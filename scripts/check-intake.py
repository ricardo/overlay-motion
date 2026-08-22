#!/usr/bin/env python3
"""Read the source and the request together, before the edit runs.

Every question this prints comes from a fact about the file. That is the whole
point: a generic questionnaire trains the user to skip the round, and a
question the file already answers is the fastest way to earn that. So the
script probes first, then reads the request against what it found.

    python3 scripts/check-intake.py --source talk.mp4 \\
        --request "add subtitles and cut it for reels"
    python3 scripts/check-intake.py --source talk.mp4 --request "..." \\
        --asset logo.svg --asset broll.mp4 --json

Findings carry one of four verdicts, and the verdict decides what happens next:

  blocking    stop. The edit cannot be finished as asked.
  ask         one question, options, and a default already chosen.
  checkpoint  do not ask. Show something cheap and keep going.
  default     do not ask. Choose the safer option and record it in the plan.

Exit status is 2 when anything blocks, so a wrapper can gate on it. Anything
else exits 0, including a run that produced questions: questions are not
failures, they are the round the user is owed before the render is paid for.

The contract this implements is INTAKE in src/agent/policy.ts.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

SHORT_FORM_MAX_SEC = 180.0
CLIPPING_DBFS = -1.0
QUIET_MEAN_DBFS = -32.0
# Below this share of audible audio, "there is speech here" stops being a
# defensible reading of the file.
MIN_SPEECH_SHARE = 0.05

parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
parser.add_argument("--source", required=True, help="the video being edited")
parser.add_argument("--request", default="", help="what the user asked for, in their words")
parser.add_argument("--asset", action="append", default=[],
                    help="a file the user supplied, optionally with its role: "
                         "--asset logo=brand.svg --asset b-roll=city.mp4. Repeatable. "
                         "Without a role the name is read for one, which is a guess.")
parser.add_argument("--json", action="store_true", help="machine-readable findings on stdout")
parser.add_argument("--noise", default="-35dB", help="silencedetect threshold")
args = parser.parse_args()

source = Path(args.source)
if not source.exists():
    sys.exit(f"source not found: {source}")
for tool in ("ffprobe", "ffmpeg"):
    if not shutil.which(tool):
        sys.exit(f"{tool} is required and not on PATH (brew install ffmpeg, or distro equivalent)")

request = args.request.lower()
findings: list[dict] = []


def split_asset(raw: str) -> tuple[str, str]:
    """`role=path`, or a bare path whose name is read for a role. A Windows
    drive letter is not a role, and neither is a colon inside a filename."""
    role, sep, path = raw.partition("=")
    if sep and role and "/" not in role and "\\" not in role:
        return role.strip().lower(), path
    return "", raw


assets = [split_asset(a) for a in args.asset]
asset_roles = " ".join(role for role, _ in assets)
asset_names = " ".join(Path(path).name.lower() for _, path in assets)


def note(check: str, verdict: str, headline: str, why: str, **extra) -> None:
    findings.append({"check": check, "verdict": verdict, "headline": headline, "why": why, **extra})


def asks(check: str, question: str, options: list[str], default: str, why: str) -> None:
    """A question the file raised. `default` is what happens on silence, so the
    user can ignore the round and still get a defensible edit."""
    note(check, "ask", question, why, options=options, default=default)


# ---------------------------------------------------------------- probe

def ffprobe_json(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def audio_levels(path: Path) -> tuple[float | None, float | None]:
    """(peak dBFS, mean dBFS). Both None when the file carries no audio."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    peak = re.search(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", proc.stderr)
    mean = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?) dB", proc.stderr)
    return (float(peak.group(1)) if peak else None, float(mean.group(1)) if mean else None)


def silent_seconds(path: Path, duration: float) -> float:
    """Total silence, so its complement is the audible share of the file."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", str(path), "-af",
         f"silencedetect=noise={args.noise}:d=0.5", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    total, opened = 0.0, None
    for line in proc.stderr.splitlines():
        start = re.search(r"silence_start:\s*(-?\d+(?:\.\d+)?)", line)
        end = re.search(r"silence_end:\s*(-?\d+(?:\.\d+)?)", line)
        if start:
            opened = float(start.group(1))
        elif end and opened is not None:
            total += max(0.0, float(end.group(1)) - opened)
            opened = None
    if opened is not None:
        total += max(0.0, duration - opened)
    return total


probe = ffprobe_json(source)
video = next((s for s in probe["streams"] if s.get("codec_type") == "video"), None)
audio = next((s for s in probe["streams"] if s.get("codec_type") == "audio"), None)
if video is None:
    sys.exit(f"{source} carries no video stream")

duration = float(probe.get("format", {}).get("duration") or video.get("duration") or 0.0)
width, height = int(video.get("width", 0)), int(video.get("height", 0))
# A rotation tag swaps what the viewer sees; a portrait phone clip is usually
# encoded landscape plus 90 degrees, and reading the raw size calls it wide.
rotation = 0
for entry in video.get("side_data_list", []) or []:
    if "rotation" in entry:
        rotation = int(abs(float(entry["rotation"])))
if rotation in (90, 270):
    width, height = height, width
aspect = (width / height) if height else 0.0
transfer = (video.get("color_transfer") or "").lower()
primaries = (video.get("color_primaries") or "").lower()

speech_share = None
peak_db = mean_db = None
if audio is not None:
    peak_db, mean_db = audio_levels(source)
    if duration > 0:
        speech_share = max(0.0, duration - silent_seconds(source, duration)) / duration

facts = {
    "duration_sec": round(duration, 2),
    "display_size": f"{width}x{height}",
    "aspect": round(aspect, 3),
    "rotation": rotation,
    "has_audio": audio is not None,
    "audible_share": None if speech_share is None else round(speech_share, 3),
    "peak_dbfs": peak_db,
    "mean_dbfs": mean_db,
    "color_transfer": transfer or None,
    "assets_supplied": [f"{role or '?'}: {Path(path).name}" for role, path in assets],
}

# ---------------------------------------------------------------- read the request

def wants(*words: str) -> bool:
    return any(re.search(rf"\b{w}\b", request) for w in words)


wants_captions = wants("caption", "captions", "subtitle", "subtitles", "legenda", "legendas")
wants_vertical = wants("vertical", "reels", "reel", "tiktok", "shorts", "9:16")
wants_horizontal = wants("horizontal", "landscape", "widescreen", "16:9", "youtube")
wants_logo_asset = wants("logo", "logotype", "wordmark") or bool(
    re.search(r"\b(?:brand|marca)\s+(?:asset|mark|logo)\b", request)
)
wants_brand = wants("brand", "branded", "branding", "marca") or wants_logo_asset
wants_broll = wants("b-roll", "broll", "stock", "cutaway", "cutaways")
wants_music = wants("music", "soundtrack", "trilha", "song", "bed")
# A palette can legitimately say "black background". Background removal is an
# action, not the mere presence of the noun, so only explicit cutout language
# opens the backdrop question.
wants_cutout = wants("cutout", "cut-out") or bool(re.search(
    r"\b(?:remove|replace|erase|delete|key(?:\s+out)?)\s+(?:the\s+)?background\b|\bgreen[ -]?screen\b|\b(?:alpha|background)\s+matte\b",
    request,
))
wants_second_frame = wants("split", "split-screen", "picture-in-picture", "pip", "side-by-side")
wants_subjective_cut = wants("boring", "slow", "dead", "unnecessary", "tighten", "chatas")
vague_only = bool(request.strip()) and wants("punchy", "dynamic", "viral", "engaging", "better") \
    and not any([wants_captions, wants_vertical, wants_horizontal, wants_brand,
                 wants_broll, wants_music, wants_cutout, wants_second_frame])

# ---------------------------------------------------------------- source checks

if wants_captions and audio is None:
    note("captions-without-speech", "blocking",
         "Captions were requested and the source has no audio stream.",
         "Forced alignment has nothing to align. Supply the audio, or drop the captions.")
elif wants_captions and speech_share is not None and speech_share < MIN_SPEECH_SHARE:
    note("captions-without-speech", "blocking",
         f"Captions were requested and only {speech_share:.1%} of the audio is above the noise floor.",
         "Nothing here reads as speech, so alignment would invent timing for words nobody said.")

if wants_vertical and duration > SHORT_FORM_MAX_SEC:
    asks("long-source-short-platform",
         f"The source runs {duration / 60:.1f} min and short form was requested. "
         "One continuous cut, or a highlight selection?",
         ["one cut, trimmed at the head and tail",
          "a highlight selection, best moments only"],
         "one cut, trimmed at the head and tail",
         "No preview answers this, and the answer changes every decision after it.")

if wants_vertical and aspect > 1.05:
    asks("reframe-drops-a-protected-subject",
         "A horizontal source is going vertical, so the sides get cropped. Whose framing wins?",
         ["keep the speaker centered, crop the rest",
          "follow the speaker with a tracked crop",
          "fit the whole frame and fill the top and bottom"],
         "keep the speaker centered, crop the rest",
         "A crop that cuts the speaker is a redo, and the file cannot say which subject matters.")

if wants_horizontal and aspect < 0.95:
    asks("vertical-source-horizontal-request",
         "A vertical source is filling a horizontal frame. What fills the sides?",
         ["a blurred plate of the same footage", "solid brand color", "pillarbox, sides left empty"],
         "a blurred plate of the same footage",
         "Both are common and they look nothing alike.")

if wants_second_frame and aspect < 0.95:
    asks("no-room-for-a-second-frame",
         "A second frame was requested over a vertical source, where it does not fit beside the speaker.",
         ["cover part of the speaker with it", "cut away to it, full frame"],
         "cut away to it, full frame",
         "The layout does not fit and both answers are legitimate edits.")

if transfer in {"smpte2084", "arib-std-b67"} or primaries == "bt2020":
    note("hdr-source", "checkpoint",
         f"The source is HDR ({transfer or primaries}).",
         "Choose the color path and verify it: one source frame and one delivery frame "
         "through the same transform, before the full render.")

if peak_db is not None and peak_db >= CLIPPING_DBFS:
    note("audio-is-clipping-or-too-quiet", "checkpoint",
         f"Audio peaks at {peak_db:.1f} dBFS, at or past clipping.",
         "The render inherits it. Show the measured levels and the correction before rendering.")
elif mean_db is not None and mean_db <= QUIET_MEAN_DBFS:
    note("audio-is-clipping-or-too-quiet", "checkpoint",
         f"Audio averages {mean_db:.1f} dBFS, far below speech level.",
         "The render inherits it. Show the measured levels and the correction before rendering.")

if wants_music and audio is not None and speech_share is not None and speech_share > 0.9:
    asks("source-already-has-music",
         "A music bed was requested and the source audio is continuous, which usually means "
         "music is already in the take.",
         ["keep the music that is already there", "replace it with the requested bed"],
         "keep the music that is already there",
         "Two beds stack, and the 0.3 ceiling only governs the one this library adds.")

# ---------------------------------------------------------------- request checks

supplied = f"{asset_roles} {asset_names}"

if wants_logo_asset and not re.search(r"logo|brand|mark", supplied):
    note("brand-without-assets", "blocking",
         "A logo or brand mark was requested and no matching asset was supplied.",
         "A real logo is never fabricated, at any confidence. Ask for the file.")

if wants_broll and not args.asset:
    note("b-roll-without-media", "blocking",
         "Specific b-roll was requested and no media came with it.",
         "Every asset in the plan carries provenance, and there is nothing here to record.")

if wants_captions and audio is not None:
    note("captions-without-verified-copy", "checkpoint",
         "Show the drafted transcript for approval before aligning it.",
         "A wrong word is invisible until the finished video, the most expensive place to find it.")

if wants_cutout:
    asks("cutout-without-a-backdrop",
         "Background removal was requested. What arrives behind the subject, and does the cutout get an outline?",
         ["transparent, no outline", "solid brand color, no outline", "blurred plate of the source"],
         "solid brand color, no outline",
         "Each answer re-renders, so asking twice costs two renders.")

if wants_subjective_cut:
    note("subjective-destructive-cut", "checkpoint",
         "Send the cut list with timestamps before rendering.",
         "Destructive and subjective, but a list answers it faster than a question does.")

if vague_only:
    note("vague-quality-request", "default",
         "Nothing specific was asked for, so the weak-prompt default edit applies.",
         "Trim dead head and tail, word-timed captions, brand tokens, restrained emphasis. "
         "Report it line by line instead of asking.")

# ---------------------------------------------------------------- report

blocking = [f for f in findings if f["verdict"] == "blocking"]
questions = [f for f in findings if f["verdict"] == "ask"]

if args.json:
    print(json.dumps({"source": str(source), "facts": facts, "findings": findings}, indent=2))
else:
    print(f"== source: {source.name}")
    for key, value in facts.items():
        if value not in (None, [], ""):
            print(f"  {key}: {value}")
    print()
    if not findings:
        print("== intake: nothing to raise. The file and the request agree.")
    for finding in findings:
        print(f"== {finding['verdict'].upper()} [{finding['check']}]")
        print(f"  {finding['headline']}")
        print(f"  why: {finding['why']}")
        for option in finding.get("options", []):
            mark = "*" if option == finding.get("default") else "-"
            print(f"  {mark} {option}")
        if finding.get("default"):
            print(f"  on silence: {finding['default']}")
        print()

    print(f"== summary: {len(blocking)} blocking, {len(questions)} question(s), "
          f"{len(findings) - len(blocking) - len(questions)} handled without asking")
    if len(questions) > 3:
        print("  NOTE: more than three questions. Ask the three that change the render most, "
              "default the rest from source evidence.")
    if blocking:
        print("  Resolve the blocking findings before the edit runs.")

sys.exit(2 if blocking else 0)
