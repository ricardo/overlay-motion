#!/usr/bin/env python3
"""Build render-props.json: word-timed captions over any clip, timed from an
`aligned-words.json` produced by forced alignment.

Probes the source rather than hardcoding its shape, so it runs on a clip nobody
has measured yet.

    python3 scripts/align-words.py --audio <cut audio> --transcript copy.txt
    python3 scripts/build-caption-props.py \\
        --dir my-clip --source proxy.mov \\
        --case upper --y 68

The alignment file has to name the aligner that produced it. This script reads
timing, not audio, so it cannot tell a forced alignment from a transcriber's
guess by looking at the numbers; the envelope is the only place that difference
is visible, and transcriber timestamps rendered as captions is the failure this
check exists to stop.

The media must also be reachable by the renderer under `public/`; pass --src
when the published path differs from `/projects/<dir name>/<source>`.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import NoReturn

ALIGNMENT_CLASS = "forced-phoneme-or-ctc"

parser = argparse.ArgumentParser()
parser.add_argument("--dir", required=True, help="project folder holding the source and alignment")
parser.add_argument("--src", help="public path for the renderer; derived from --dir when omitted")
parser.add_argument("--source", default="source.mp4")
parser.add_argument("--out", default="render-props.json")
parser.add_argument("--y", type=float, default=74, help="caption band top, %% of height")
parser.add_argument("--region-h", type=float, default=13, help="caption band height, %%")
parser.add_argument("--x", type=float, default=8)
parser.add_argument("--region-w", type=float, default=84)
parser.add_argument("--primary", default="#2563EB", help="active-word pill color")
parser.add_argument("--max-words", type=int, default=4, help="hard cap per cue")
parser.add_argument("--case", default="as-spoken", choices=("as-spoken", "upper", "lower"))
parser.add_argument("--punctuation", default="keep", choices=("keep", "strip"))
parser.add_argument("--accept-draft-transcript", action="store_true",
                    help="render copy nobody verified against the audio")
args = parser.parse_args()

HERE = Path(args.dir)
SRC = args.src or f"/projects/{HERE.name}/{args.source}"

probe = json.loads(
    subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate,nb_frames",
         "-show_entries", "format=duration", "-of", "json", str(HERE / args.source)],
        check=True, capture_output=True, text=True,
    ).stdout
)
stream = probe["streams"][0]
num, den = (int(v) for v in stream["r_frame_rate"].split("/"))
fps = num / den
width, height = int(stream["width"]), int(stream["height"])
frames = int(stream["nb_frames"]) if stream.get("nb_frames", "N/A") != "N/A" else None
duration = frames / fps if frames else float(probe["format"]["duration"])

FORMATS = {"vertical": (1080, 1920), "horizontal": (1920, 1080),
           "landscape": (1620, 1080), "square": (1080, 1080)}
aspect = width / height
fmt = min(FORMATS, key=lambda k: abs(FORMATS[k][0] / FORMATS[k][1] - aspect))


def reject(message: str, *hints: str) -> NoReturn:
    print(f"build-caption-props: {message}", file=sys.stderr)
    for hint in hints:
        print(f"  {hint}", file=sys.stderr)
    sys.exit(1)


ALIGN_PATH = HERE / "aligned-words.json"
if not ALIGN_PATH.exists():
    reject(
        f"no alignment at {ALIGN_PATH}",
        "python3 scripts/align-words.py --audio <cut audio> --transcript copy.txt",
    )
alignment = json.loads(ALIGN_PATH.read_text())

# A bare array is the shape a transcriber dump takes when it is reshaped by
# hand, and it is the shape every pre-gate project wrote. Both re-align in one
# command, so neither gets an exception here.
if isinstance(alignment, list):
    reject(
        f"{ALIGN_PATH.name} is a bare word list with no aligner named",
        "Caption timing comes from forced alignment, never from transcriber timestamps.",
        "python3 scripts/align-words.py --audio <cut audio> --transcript copy.txt",
    )
if alignment.get("alignment") != ALIGNMENT_CLASS:
    reject(
        f"{ALIGN_PATH.name} declares alignment={alignment.get('alignment')!r}, "
        f"and captions require {ALIGNMENT_CLASS!r}",
        "Segment or token times from an ASR drift after every cut. Re-align:",
        "python3 scripts/align-words.py --audio <cut audio> --transcript copy.txt",
    )
aligner = str(alignment.get("aligner", "")).strip()
# whisperx survives this on purpose: it is whisper plus a wav2vec2 aligner.
if not aligner or re.fullmatch(r"whisper[-. ]?(cpp|cli)?", aligner, re.I):
    reject(
        f"aligner={aligner!r} is a transcriber, not a forced aligner",
        "Use whisperx (wav2vec2) or mms_fa via scripts/align-words.py.",
    )
if not alignment.get("transcriptVerified") and not args.accept_draft_transcript:
    reject(
        f"{ALIGN_PATH.name} carries a machine draft nobody read back against the audio",
        "Timing is aligned, but the words may not be the words. Fix names, brands and",
        "contractions, then re-run align-words.py with --transcript <file>.",
        "Pass --accept-draft-transcript only when the draft has been checked by ear.",
    )

words = alignment["words"]  # [start, end, text, score]
print(f"alignment: {aligner} ({alignment.get('model', 'unknown model')}), {len(words)} words")

# --- phrase grouping --------------------------------------------------------
# The cap is a ceiling, not a target. Within it the break goes where the speech
# breaks: a sentence end, a comma, or a pause. Filling every cue to the cap
# would read as chopped-up text rather than phrasing. The template enforces the
# same ceiling independently, so this is the intent and that is the guarantee.
MAX_WORDS = args.max_words

phrases, cur = [], []
for i, (start, end, text, _score) in enumerate(words):
    if cur:
        gap = start - cur[-1][1]
        chars = sum(len(w[2]) + 1 for w in cur)
        if (
            len(cur) >= MAX_WORDS
            or gap > 0.6
            or chars + len(text) > 34
            or re.search(r"[.!?]$", cur[-1][2])
            or (re.search(r",$", cur[-1][2]) and len(cur) >= 2)
        ):
            phrases.append(cur)
            cur = []
    cur.append((start, end, text))
if cur:
    phrases.append(cur)

cues = []
prev_end = 0.0
for pi, phrase in enumerate(phrases):
    start = max(0.0, phrase[0][0] - 0.08, prev_end + 0.02)
    nxt = phrases[pi + 1][0][0] - 0.08 if pi + 1 < len(phrases) else duration
    end = min(phrase[-1][1] + 0.18, nxt - 0.02, duration - 0.05)
    end = max(end, phrase[-1][1] + 0.01)  # a cue never cuts its own last word
    prev_end = end
    cues.append(
        {
            "start": round(start, 3),
            "end": round(end, 3),
            "words": [
                {
                    "text": t,
                    "start": max(round(a, 3), round(start, 3)),
                    "end": min(round(b, 3), round(end, 3)),
                }
                for a, b, t in phrase
            ],
        }
    )

spec = {
    "version": 1,
    "fps": round(fps, 6),
    "format": fmt,
    "durationSec": round(duration, 4),
    "source": {"type": "video", "src": SRC, "fit": "cover"},
    "sound": {"enabled": False, "volume": 1},
    "overlays": [
        {
            "template": "caption-classic",
            "region": {"x": args.x, "y": args.y, "w": args.region_w, "h": args.region_h},
            "time": {"start": "0s", "duration": f"{round(duration, 4)}s"},
            "sound": {"enabled": False},
            "props": {
                # `classic` is the plain-subtitle preset: white type, and the
                # active word gets a filled pill in the theme's primary.
                "preset": "classic",
                "layout": {"textAlign": "center", "verticalAlign": "center"},
                "highlight": {"mode": "word", "duringGaps": "none", "badgeMarginX": 6},
                "appearance": {"mode": "instant", "durationSec": 0.18},
                # Display-only. The transcript and the timing are untouched.
                "text": {"case": args.case, "punctuation": args.punctuation},
                # Restated even though the preset already caps at 4: the render
                # is reproducible from this file alone, without knowing which
                # preset defaults were current when it was written.
                "grouping": {"mode": "explicit", "maxWords": args.max_words},
                "track": {"timebase": "composition", "cues": cues},
            },
        }
    ],
}

theme = {
    "name": "Blue Highlight",
    # The pill is `primary` and its text is `onPrimary`: that pairing is what
    # makes "blue background on the highlighted word" a theme choice rather
    # than a hardcoded color in the overlay.
    "colors": {
        "primary": args.primary,
        "secondary": "#1D4ED8",
        "accent": "#38BDF8",
        "onPrimary": "#FFFFFF",
        "surface": "#0B1220",
        "onSurface": "#FFFFFF",
        "muted": "#94A3B8",
        "background": "#000000",
    },
    "fonts": {
        "heading": "'Montserrat', 'Inter', 'SF Pro Display', system-ui, sans-serif",
        "body": "'Inter', 'SF Pro Text', system-ui, sans-serif",
    },
    "radius": 20,
    "logoText": "",
}

json.dump({"spec": spec, "theme": theme}, open(HERE / args.out, "w"))
print(f"source {width}x{height} @ {fps:.3f}fps, {duration:.2f}s -> format {fmt}")
print(f"{len(words)} words -> {len(cues)} cues")
for c in cues:
    print(f"{c['start']:7.2f} {c['end']:7.2f}  {' '.join(w['text'] for w in c['words'])}")
