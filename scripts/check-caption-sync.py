#!/usr/bin/env python3
"""Check caption timing against the audio it claims to describe.

The playbook's reject rules are mechanical, so an agent should not be the one
remembering them at the end of a long edit:

  - the first word cannot start before the audio starts speaking;
  - a word cannot sit inside a silence;
  - words run forward, inside the clip, without overlapping each other;
  - a cue holds its own words and leaves the next cue alone;
  - delivered audio lands within 20ms of the audio the alignment used.

    python3 scripts/check-caption-sync.py --audio cut-audio.wav
    python3 scripts/check-caption-sync.py --audio cut-audio.wav \\
        --props render-props.json --delivery out.mp4

Exit status is 1 when anything fails, so this can gate a render. It reads the
alignment envelope from align-words.py; a bare word list fails here too.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ALIGNMENT_CLASS = "forced-phoneme-or-ctc"

parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
parser.add_argument("--audio", required=True, help="the audio the alignment was made against")
parser.add_argument("--words", help="default: aligned-words.json beside --audio")
parser.add_argument("--props", help="render-props.json, to check cue windows too")
parser.add_argument("--delivery", help="rendered file, to measure delivered audio offset")
parser.add_argument("--noise", default="-35dB", help="silencedetect threshold")
parser.add_argument("--min-silence", type=float, default=0.15,
                    help="shortest silence that a word may not sit inside")
parser.add_argument("--onset-tolerance", type=float, default=0.10)
parser.add_argument("--max-delivery-offset", type=float, default=0.02)
args = parser.parse_args()

failures: list[str] = []
notes: list[str] = []


def probe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nk=1:nw=1", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    return float(out)


def silences(path: Path) -> list[tuple[float, float]]:
    """[(start, end)] of detected silence. An unterminated final silence runs
    to the end of the file."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", str(path), "-af",
         f"silencedetect=noise={args.noise}:d={args.min_silence}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    spans, start = [], None
    for match in re.finditer(r"silence_(start|end): (-?[\d.]+)", proc.stderr):
        kind, value = match.group(1), float(match.group(2))
        if kind == "start":
            start = value
        elif start is not None:
            spans.append((start, value))
            start = None
    if start is not None:
        spans.append((start, probe_duration(path)))
    return spans


def speech_onset(path: Path) -> float:
    """First moment the file is not silent."""
    for start, end in silences(path):
        if start <= 0.05:
            return end
    return 0.0


audio = Path(args.audio)
if not audio.exists():
    sys.exit(f"check-caption-sync: audio not found: {audio}")
words_path = Path(args.words) if args.words else audio.parent / "aligned-words.json"
if not words_path.exists():
    sys.exit(f"check-caption-sync: no alignment at {words_path}")

alignment = json.loads(words_path.read_text())
if isinstance(alignment, list):
    sys.exit(
        f"check-caption-sync: {words_path.name} is a bare word list with no aligner named.\n"
        "  python3 scripts/align-words.py --audio <cut audio> --transcript copy.txt"
    )
if alignment.get("alignment") != ALIGNMENT_CLASS:
    failures.append(
        f"alignment class is {alignment.get('alignment')!r}, not {ALIGNMENT_CLASS!r}"
    )
if not alignment.get("transcriptVerified"):
    notes.append("transcript is a machine draft; the words themselves are unverified")
words = alignment["words"]

duration = probe_duration(audio)
onset = speech_onset(audio)
gaps = [(s, e) for s, e in silences(audio) if s > 0.05]
print(f"== {audio.name}: {duration:.3f}s, speech starts {onset:.3f}s, "
      f"{len(gaps)} interior silences, {len(words)} words "
      f"({alignment.get('aligner', 'unknown')})")

first_start = words[0][0]
if first_start < onset - args.onset_tolerance:
    failures.append(
        f"first word {words[0][2]!r} starts {first_start:.3f}s, "
        f"{onset - first_start:.3f}s before the audio speaks ({onset:.3f}s)"
    )

previous_end = None
for index, (start, end, text, _score) in enumerate(words):
    if end <= start:
        failures.append(f"word {index} {text!r} ends at or before it starts ({start:.3f}-{end:.3f})")
    if start < 0 or end > duration + 0.05:
        failures.append(f"word {index} {text!r} falls outside the clip ({start:.3f}-{end:.3f})")
    if previous_end is not None and start < previous_end - 0.001:
        failures.append(f"word {index} {text!r} starts before the previous word ended")
    previous_end = end
    for silence_start, silence_end in gaps:
        overlap = min(end, silence_end) - max(start, silence_start)
        # Proportion, not raw overlap: a word's release decays under the noise
        # floor, so the last consonant of a phrase legitimately reaches into the
        # silence after it. A word is misplaced when the silence holds most of
        # it, which is what a drifting timestamp looks like.
        if overlap > 0.12 and overlap > 0.5 * (end - start):
            failures.append(
                f"word {index} {text!r} ({start:.3f}-{end:.3f}) spends {overlap:.3f}s "
                f"of its {end - start:.3f}s inside silence "
                f"{silence_start:.3f}-{silence_end:.3f}"
            )

if args.props:
    props_path = Path(args.props)
    spec = json.loads(props_path.read_text())
    spec = spec.get("spec", spec)
    cues = []
    for overlay in spec.get("overlays", []):
        track = overlay.get("props", {}).get("track")
        if track:
            cues.extend(track.get("cues", []))
    print(f"== {props_path.name}: {len(cues)} cues")
    for index, cue in enumerate(cues):
        cue_words = cue.get("words", [])
        if not cue_words:
            continue
        if cue["start"] > cue_words[0]["start"] + 0.001:
            failures.append(f"cue {index} opens after its first word ({cue['start']:.3f})")
        if cue["end"] < cue_words[-1]["end"] - 0.001:
            failures.append(f"cue {index} closes before its last word ({cue['end']:.3f})")
        if index + 1 < len(cues) and cue["end"] > cues[index + 1]["start"] + 0.001:
            failures.append(f"cue {index} overlaps cue {index + 1}")
        if len(cue_words) > 4:
            notes.append(f"cue {index} carries {len(cue_words)} words (cap is 4)")

if args.delivery:
    delivery = Path(args.delivery)
    delivered_onset = speech_onset(delivery)
    delta = delivered_onset - onset
    print(f"== {delivery.name}: speech starts {delivered_onset:.3f}s, delta {delta:+.3f}s")
    if abs(delta) > args.max_delivery_offset:
        direction = "late, trim its leading" if delta > 0 else "early, delay it by"
        failures.append(
            f"delivered audio is {abs(delta):.3f}s {direction} {abs(delta):.3f}s "
            f"(ceiling {args.max_delivery_offset:.3f}s)"
        )

for note in notes:
    print(f"note: {note}")
if failures:
    print(f"\nFAIL: {len(failures)} problem(s)")
    for failure in failures:
        print(f"  - {failure}")
    sys.exit(1)
print("\nPASS: caption timing agrees with the audio")
