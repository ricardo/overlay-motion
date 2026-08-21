#!/usr/bin/env python3
"""Force-align a verified transcript against final cut audio.

This is the only supported way to produce caption timing. A transcriber alone
(whisper.cpp, whisper, any ASR) returns segment or token times that drift a
tenth of a second or more and drift differently after every cut; those have
shipped visibly wrong captions and were rejected on review. A phoneme/CTC
aligner is asked a different question: given these exact words and this exact
audio, where does each word start. That is the number captions need.

    # already have the verified copy
    python3 scripts/align-words.py --audio cut-audio.wav --transcript copy.txt

    # no copy yet: drafts one with whisper-cli, aligns it, and marks the
    # result unverified until you read it back against the audio
    python3 scripts/align-words.py --audio cut-proxy.mp4

Audio is prepared from whatever you pass (any file ffmpeg can decode) into mono
16kHz PCM, because that is what the aligner was trained on. Times therefore
belong to the timeline of the file you pass, so pass the cut-only proxy, never
the original media.

Output is `aligned-words.json`, an envelope that names the aligner it came
from. `scripts/build-caption-props.py` refuses input without that envelope,
which is what keeps a transcriber's timestamps from reaching a render.

Backends:
  mms_fa    torchaudio MMS_FA + forced_align (default). Needs a verified
            transcript; times every word you give it.
  whisperx  wav2vec2 alignment through `uvx whisperx`. Transcribes and aligns
            in one pass; leaves words it cannot align untimed.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path
from typing import NoReturn

SAMPLE_RATE = 16000
ALIGNMENT_CLASS = "forced-phoneme-or-ctc"
REEXEC_FLAG = "OM_ALIGN_REEXEC"


def fail(message: str, *hints: str) -> NoReturn:
    print(f"align-words: {message}", file=sys.stderr)
    for hint in hints:
        print(f"  {hint}", file=sys.stderr)
    sys.exit(1)


# --- audio ------------------------------------------------------------------


def is_aligner_wav(path: Path) -> bool:
    """Mono 16-bit PCM at the aligner's sample rate reads without conversion."""
    try:
        with wave.open(str(path)) as wav:
            return (
                wav.getnchannels() == 1
                and wav.getsampwidth() == 2
                and wav.getframerate() == SAMPLE_RATE
            )
    except (wave.Error, EOFError, FileNotFoundError):
        return False


def prepare_audio(source: Path, workdir: Path) -> Path:
    if is_aligner_wav(source):
        return source
    if not shutil.which("ffmpeg"):
        fail(
            f"{source.name} is not mono {SAMPLE_RATE}Hz PCM and ffmpeg is missing",
            "brew install ffmpeg (or distro equivalent), or pass an already converted wav",
        )
    out = workdir / "audio16k.wav"
    print(f"== preparing {out.name} from {source.name}")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(source), "-vn",
         "-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le", str(out)],
        check=True,
    )
    return out


def read_wav(path: Path):
    """stdlib `wave` rather than torchaudio.load: torchaudio >= 2.11 routes
    loading through torchcodec, which is a second install to go wrong for a
    file format Python already reads."""
    import numpy as np
    import torch

    with wave.open(str(path)) as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            fail(f"{path.name} must be mono 16-bit PCM")
        rate = wav.getframerate()
        pcm = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16)
    waveform = torch.from_numpy(pcm.astype(np.float32) / 32768.0).unsqueeze(0)
    return waveform, rate


# --- transcript -------------------------------------------------------------


def whisper_model_path() -> Path | None:
    root = Path(__file__).resolve().parent.parent
    models = root / "dev-assets" / "models"
    named = os.environ.get("OM_WHISPER_MODEL")
    if named:
        candidate = models / f"ggml-{named}.bin"
        if candidate.exists():
            return candidate
    found = sorted(models.glob("ggml-*.bin"), key=lambda p: p.stat().st_size, reverse=True)
    return found[0] if found else None


def draft_transcript(audio: Path, workdir: Path, language: str) -> str:
    """Draft copy only. Alignment still decides every timestamp."""
    if not shutil.which("whisper-cli"):
        fail(
            "no transcript given and whisper-cli is not installed",
            "pass --transcript copy.txt, or: bash scripts/agent-bootstrap.sh --need captions",
        )
    model = whisper_model_path()
    if model is None:
        fail(
            "no transcript given and no whisper model found",
            "bash scripts/agent-bootstrap.sh --need captions",
        )
    prefix = workdir / "transcript-draft"
    print(f"== drafting transcript with whisper-cli ({model.name})")
    subprocess.run(
        ["whisper-cli", "-m", str(model), "-f", str(audio),
         "-l", language, "-otxt", "-of", str(prefix), "-np"],
        check=True, capture_output=True,
    )
    text = " ".join(prefix.with_suffix(".txt").read_text().split())
    print(f"   draft: {text}")
    print(f"   saved: {prefix.with_suffix('.txt')}")
    return text


def load_transcript(args, audio: Path, workdir: Path) -> tuple[str, bool]:
    if args.text:
        return " ".join(args.text.split()), True
    if args.transcript:
        path = Path(args.transcript)
        if not path.exists():
            fail(f"transcript not found: {path}")
        return " ".join(path.read_text().split()), True
    return draft_transcript(audio, workdir, args.language), False


# --- mms_fa backend ---------------------------------------------------------


def ensure_torch_python() -> None:
    """Re-exec under a python that has the aligner, instead of telling the
    caller their command was wrong. Bootstrap puts one at a known path."""
    try:
        import torch  # noqa: F401
        import torchaudio  # noqa: F401
        return
    except ImportError:
        pass
    if os.environ.get(REEXEC_FLAG):
        fail(
            "torch/torchaudio missing from the aligner python",
            "bash scripts/agent-bootstrap.sh --need captions",
            "or point OM_ALIGN_PYTHON at a python that has torch + torchaudio",
        )
    root = Path(__file__).resolve().parent.parent
    candidates = [
        os.environ.get("OM_ALIGN_PYTHON"),
        str(root / "dev-assets" / "matting-venv" / "bin" / "python"),
        str(root / "dev-assets" / "align-venv" / "bin" / "python"),
    ]
    for candidate in candidates:
        if not candidate or not os.access(candidate, os.X_OK):
            continue
        probe = subprocess.run(
            [candidate, "-c", "import torch, torchaudio"], capture_output=True
        )
        if probe.returncode == 0:
            print(f"== re-exec under {candidate}")
            os.execve(candidate, [candidate, *sys.argv], {**os.environ, REEXEC_FLAG: "1"})
    fail(
        "no python with torch + torchaudio was found",
        "bash scripts/agent-bootstrap.sh --need captions",
        "or run with --backend whisperx if uv is installed",
    )


def tokenize(words: list[str], dictionary: dict) -> tuple[list[list[int]], list[str]]:
    """Map display words to aligner tokens.

    The aligner only knows a-z and the apostrophe, so `12` or `X` reach it as
    nothing at all. Rather than guess at those, the transcript writes them the
    way they are spoken and carries the drawn form after a pipe: `twelve|12`.
    """
    tokens, display = [], []
    unspeakable = []
    for word in words:
        spoken, _, shown = word.partition("|")
        normalized = re.sub(r"[^a-z']", "", spoken.lower())
        if not normalized:
            unspeakable.append(word)
            continue
        missing = [char for char in normalized if char not in dictionary]
        if missing:
            unspeakable.append(word)
            continue
        tokens.append([dictionary[char] for char in normalized])
        display.append(shown or spoken)
    if unspeakable:
        fail(
            "these words carry no alignable letters: " + ", ".join(unspeakable),
            "write them the way they are spoken, and keep the drawn form after a pipe:",
            '  "twelve|12"  "ex|X"  "dot com|.com"',
        )
    return tokens, display


def align_mms_fa(audio: Path, transcript: str) -> tuple[list, dict]:
    ensure_torch_python()
    import numpy as np
    import torch
    import torchaudio
    import torchaudio.functional as F

    waveform, rate = read_wav(audio)
    duration = waveform.size(1) / rate
    if duration > 240:
        print(f"   note: {duration:.0f}s in one pass; split the audio if this runs out of memory")

    bundle = torchaudio.pipelines.MMS_FA
    if rate != bundle.sample_rate:
        fail(f"{audio.name} is {rate}Hz; MMS_FA expects {bundle.sample_rate}Hz")
    model = bundle.get_model(with_star=False)
    model.eval()
    dictionary = bundle.get_dict(star=None)

    words = transcript.split()
    tokens, display = tokenize(words, dictionary)
    flat = [token for word in tokens for token in word]

    with torch.inference_mode():
        emission, _ = model(waveform)
    alignment, scores = F.forced_align(
        emission, torch.tensor([flat], dtype=torch.int32), blank=0
    )
    spans = F.merge_tokens(alignment[0], scores[0].exp())
    ratio = waveform.size(1) / emission.size(1) / rate

    aligned, index = [], 0
    for word, word_tokens in zip(display, tokens):
        segment = spans[index : index + len(word_tokens)]
        index += len(word_tokens)
        aligned.append([
            round(segment[0].start * ratio, 3),
            round(segment[-1].end * ratio, 3),
            word,
            round(float(np.mean([span.score for span in segment])), 3),
        ])
    return aligned, {"aligner": "mms_fa", "model": "torchaudio MMS_FA",
                     "audioDurationSec": round(duration, 3)}


# --- whisperx backend -------------------------------------------------------


def align_whisperx(audio: Path, workdir: Path, language: str, model: str) -> tuple[list, dict]:
    if not shutil.which("uvx"):
        fail(
            "uvx not found",
            "install uv (https://docs.astral.sh/uv/), or use the default --backend mms_fa",
        )
    out = workdir / "whisperx"
    print("== whisperx (transcribe + wav2vec2 align)")
    subprocess.run(
        ["uvx", "whisperx", str(audio), "--model", model, "--language", language,
         "--device", "cpu", "--compute_type", "int8", "--vad_method", "silero",
         "--output_format", "json", "--output_dir", str(out)],
        check=True,
    )
    produced = sorted(out.glob("*.json"))
    if not produced:
        fail("whisperx wrote no json")
    data = json.loads(produced[0].read_text())

    aligned, untimed = [], []
    for segment in data.get("segments", []):
        for word in segment.get("words", []):
            text = word.get("word", "").strip()
            if word.get("start") is None or word.get("end") is None:
                untimed.append(text)
                continue
            aligned.append([
                round(float(word["start"]), 3),
                round(float(word["end"]), 3),
                text,
                round(float(word.get("score", 0.0)), 3),
            ])
    if untimed:
        fail(
            "whisperx could not time these words: " + ", ".join(untimed),
            "an untimed word cannot be placed without inventing cadence, which is the",
            "failure this script exists to prevent. Re-run with the default backend and a",
            "verified transcript that spells them as spoken:",
            "  python3 scripts/align-words.py --audio <audio> --transcript copy.txt",
        )
    duration = data.get("segments", [{}])[-1].get("end")
    return aligned, {"aligner": "whisperx", "model": f"whisperx {model} + wav2vec2",
                     "audioDurationSec": round(float(duration), 3) if duration else None}


# --- main -------------------------------------------------------------------


parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
parser.add_argument("--audio", required=True,
                    help="final cut-only audio or proxy; times belong to this file's timeline")
parser.add_argument("--transcript", help="verified transcript file")
parser.add_argument("--text", help="verified transcript inline")
parser.add_argument("--out", help="default: aligned-words.json beside --audio")
parser.add_argument("--backend", default="mms_fa", choices=("mms_fa", "whisperx"))
parser.add_argument("--language", default="en")
parser.add_argument("--whisperx-model", default="small.en")
args = parser.parse_args()

source = Path(args.audio)
if not source.exists():
    fail(f"audio not found: {source}")
workdir = source.parent
out_path = Path(args.out) if args.out else workdir / "aligned-words.json"

audio = prepare_audio(source, workdir)

if args.backend == "whisperx":
    if args.transcript or args.text:
        print("   note: whisperx transcribes its own copy; --transcript is ignored")
    words, provenance = align_whisperx(audio, workdir, args.language, args.whisperx_model)
    verified = False
else:
    transcript, verified = load_transcript(args, audio, workdir)
    words, provenance = align_mms_fa(audio, transcript)

if not words:
    fail("no words were aligned")

envelope = {
    "version": 1,
    "alignment": ALIGNMENT_CLASS,
    **provenance,
    "audio": audio.name,
    "sampleRate": SAMPLE_RATE,
    # False means a machine chose this wording and nobody has read it back
    # against the audio yet. build-caption-props.py stops on it.
    "transcriptVerified": verified,
    "words": words,
}
out_path.write_text(json.dumps(envelope, indent=2))

for start, end, word, score in words:
    print(f"{start:8.3f} {end:8.3f}  {score:5.2f}  {word}")
print(f"\n{len(words)} words -> {out_path}")
if not verified:
    print("\n!! transcript is a machine draft, not verified copy.")
    print("   Read it back against the audio, fix names/brands/contractions, then re-run:")
    print(f"   python3 scripts/align-words.py --audio {source} --transcript <file>")
