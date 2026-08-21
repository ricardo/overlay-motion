#!/usr/bin/env bash
# Agent environment bootstrap for the field-edit pipeline
# (person matting, voice denoise, word-level captions).
#
# Reuse-first and idempotent: anything already present (including past
# dev-assets/projects/* downloads) is symlinked into canonical paths at zero
# cost on every run. Downloads and pip installs only happen for requested
# groups. Always exits 0; read the summary to see what is usable.
#
# Usage:
#   bash scripts/agent-bootstrap.sh                  # detect + reuse only, no downloads
#   bash scripts/agent-bootstrap.sh --need captions  # transcriber AND aligner
#   bash scripts/agent-bootstrap.sh --need matting --need denoise
#   bash scripts/agent-bootstrap.sh --all            # fetch everything
#   OM_WHISPER_MODEL=small.en-q5_1 ... --need captions   # smaller model (~180MB)
#
# Captions need two different tools and the second one is the one that matters:
# a transcriber drafts the words, a forced aligner decides when each word is
# said. Whisper alone has shipped visibly wrong caption timing, so this script
# treats captions as unusable until an aligner is present, no matter how ready
# the transcriber looks.
#
# Cold-fetch cost: captions ~540MB (medium) or ~180MB (small) for the whisper
# model, plus the torch venv (~100MB wheels on macOS, multi-GB on CUDA Linux)
# shared with matting/denoise; RVM repo + checkpoint ~20MB.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV="$ROOT/dev-assets"
MODELS="$DEV/models"
VENV="$DEV/matting-venv"
RVM_DIR="$DEV/rvm"
WHISPER_MODEL="${OM_WHISPER_MODEL:-medium.en-q5_0}"
# torch/torchvision must be a matched pair; a bare `pip install torchvision`
# (or unpinned deepfilternet) into an existing venv silently upgrades torch
# (seen: 2.8.0 -> 2.13.0). Install the pair first, always pinned.
TORCH_PIN="torch==2.8.0"
TORCHVISION_PIN="torchvision==0.23.0"
# torchaudio carries MMS_FA + forced_align, the caption aligner. It pairs with
# torch the same way torchvision does, and a mismatch fails only at import.
TORCHAUDIO_PIN="torchaudio==2.8.0"
DFN_PIN="deepfilternet==0.5.6"

NEED_CAPTIONS=0; NEED_MATTING=0; NEED_DENOISE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --all) NEED_CAPTIONS=1; NEED_MATTING=1; NEED_DENOISE=1 ;;
    --need)
      shift
      case "${1:-}" in
        captions) NEED_CAPTIONS=1 ;;
        matting) NEED_MATTING=1 ;;
        denoise) NEED_DENOISE=1 ;;
        *) echo "unknown group: ${1:-} (captions|matting|denoise)"; exit 1 ;;
      esac ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1 (--need captions|matting|denoise, --all)"; exit 1 ;;
  esac
  shift
done
# Captions join the venv groups: the aligner lives there too.
FETCH_VENV=$(( NEED_MATTING || NEED_DENOISE || NEED_CAPTIONS ))

OK=(); WARN=()
ok()   { OK+=("$1"); echo "  ok: $1"; }
warn() { WARN+=("$1"); echo "  MISSING: $1"; }

mkdir -p "$MODELS"

echo "== system tools"
# Node and git come first because they are the two this repo cannot work
# around: npm install needs one, and `npm run om:check` fast-forwards the
# checkout with the other. Without git the update check cannot tell a dirty
# tree from a missing tool, so it refuses to touch anything and says so.
if command -v node >/dev/null 2>&1; then
  NODE_V=$(node --version 2>/dev/null | sed 's/^v//')
  NODE_MAJOR=${NODE_V%%.*}
  NODE_REST=${NODE_V#*.}; NODE_MINOR=${NODE_REST%%.*}
  if [ "${NODE_MAJOR:-0}" -gt 20 ] 2>/dev/null || { [ "${NODE_MAJOR:-0}" -eq 20 ] 2>/dev/null && [ "${NODE_MINOR:-0}" -ge 19 ] 2>/dev/null; }; then
    ok "node $NODE_V"
  else
    warn "node $NODE_V is below the required 20.19 (nvm install 20, or your distro's current build)"
  fi
else
  warn "node 20.19+ (nvm install 20, or https://nodejs.org)"
fi
if command -v git >/dev/null 2>&1; then
  if [ -d "$ROOT/.git" ]; then
    ok "git $(git --version 2>/dev/null | awk '{print $3}')"
  else
    warn "this is not a git checkout, so npm run om:check cannot update it (git clone instead of unpacking an archive)"
  fi
else
  warn "git (xcode-select --install on macOS, apt install git, or https://git-scm.com)"
fi
for tool in ffmpeg ffprobe whisper-cli; do
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool"; else
    warn "$tool (brew install ffmpeg / whisper-cpp, or distro equivalent)"
  fi
done
if [ "$(uname)" = "Darwin" ]; then
  command -v avconvert >/dev/null 2>&1 && ok "avconvert (HDR->SDR proxy path)" \
    || warn "avconvert (expected on macOS)"
else
  echo "  note: no avconvert off macOS; use the ffmpeg tonemap proxy path (see playbook)"
fi

echo "== caption transcriber: whisper model ($WHISPER_MODEL), drafts words only"
WHISPER_BIN="$MODELS/ggml-$WHISPER_MODEL.bin"
if [ ! -s "$WHISPER_BIN" ]; then
  existing="$(find "$DEV" -maxdepth 3 -name "ggml-*.bin" -size +50M 2>/dev/null | head -1)"
  if [ -n "$existing" ]; then
    ln -sf "$existing" "$MODELS/$(basename "$existing")"
    WHISPER_BIN="$MODELS/$(basename "$existing")"
    echo "  reusing $existing"
  elif [ "$NEED_CAPTIONS" = 1 ]; then
    echo "  downloading ggml-$WHISPER_MODEL.bin ..."
    curl -fSL --retry 2 -o "$WHISPER_BIN" \
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$WHISPER_MODEL.bin" \
      || rm -f "$WHISPER_BIN"
  fi
fi
[ -s "$WHISPER_BIN" ] && ok "whisper model: $WHISPER_BIN" \
  || warn "whisper model (fetch with: --need captions)"

echo "== python venv (caption aligner + matting + denoise)"
PY="$VENV/bin/python"
if [ ! -x "$PY" ]; then
  # Prefer adopting a proven venv from a past project over a fresh install.
  adopted=""
  for cand in "$DEV"/projects/*/audio-venv "$DEV"/projects/*/matting-venv; do
    [ -x "$cand/bin/python" ] || continue
    if "$cand/bin/python" -c "import torch" >/dev/null 2>&1; then
      ln -sfn "$cand" "$VENV"; adopted="$cand"; break
    fi
  done
  if [ -n "$adopted" ]; then
    echo "  adopted existing venv: $adopted"
  elif [ "$FETCH_VENV" = 1 ]; then
    if command -v python3 >/dev/null 2>&1; then
      python3 -m venv "$VENV" && "$VENV/bin/pip" install -q --upgrade pip
    else
      warn "python3 (install Python >= 3.10)"
    fi
  fi
  PY="$VENV/bin/python"
fi
if [ -x "$PY" ]; then
  NEED_VISION=$(( NEED_MATTING || NEED_DENOISE ))
  if ! "$PY" -c "import torch, torchvision" >/dev/null 2>&1 && [ "$NEED_VISION" = 1 ]; then
    "$VENV/bin/pip" install -q "$TORCH_PIN" "$TORCHVISION_PIN" \
      || warn "torch/torchvision install failed (network or platform wheels)"
  fi
  if [ "$NEED_CAPTIONS" = 1 ] && ! "$PY" -c "import torchaudio" >/dev/null 2>&1; then
    if "$PY" -c "import torch" >/dev/null 2>&1; then
      # An adopted venv's torch is not necessarily this script's pin, and
      # upgrading it to satisfy torchaudio would break whatever already works
      # here. Take the audio wheel alone and let the import test judge the pair.
      "$VENV/bin/pip" install -q --no-deps torchaudio \
        || warn "torchaudio install failed (network or platform wheels)"
    else
      "$VENV/bin/pip" install -q "$TORCH_PIN" "$TORCHAUDIO_PIN" \
        || warn "torch/torchaudio install failed (network or platform wheels)"
    fi
  fi
  "$PY" -c "import torch, torchvision" >/dev/null 2>&1 \
    && ok "venv torch+torchvision: $PY" \
    || warn "venv torch+torchvision (fetch with: --need matting or --need denoise)"
  # `-x` is not "works". Observed in the field: the shim survived a repo move
  # with a shebang pointing at a python that no longer existed, and a later
  # torchaudio upgrade removed the `torchaudio.backend` that `df` imports. Both
  # times the file was still executable and this script still said ok, so the
  # breakage was found mid-edit instead of at bootstrap. Import the module.
  dfn_works() { "$PY" -c "import df.enhance" >/dev/null 2>&1; }
  if ! dfn_works && [ "$NEED_DENOISE" = 1 ]; then
    "$VENV/bin/pip" install -q "$TORCH_PIN" "$DFN_PIN" >/dev/null 2>&1 || true
  fi
  if dfn_works; then
    ok "deepFilter (DeepFilterNet3 denoise)"
  elif [ -x "$VENV/bin/deepFilter" ]; then
    warn "deepFilter present but 'import df.enhance' fails; do NOT pip-fix it here (shared torchaudio with the aligner), use a separate env or ffmpeg afftdn"
  else
    warn "deepFilter (fetch with: --need denoise)"
  fi
else
  warn "venv (fetch with: --need matting or --need denoise)"
fi

echo "== caption aligner (forced phoneme/CTC), decides caption timing"
ALIGNER=""
if [ -x "$PY" ] && "$PY" -c "import torchaudio; torchaudio.pipelines.MMS_FA" >/dev/null 2>&1; then
  ALIGNER="mms_fa"
  ok "aligner: torchaudio MMS_FA ($PY)"
elif [ "$NEED_CAPTIONS" = 1 ] && [ -x "$PY" ]; then
  # The pair only fails at import, so say which halves are actually here.
  echo "  note: torchaudio unusable with this venv's torch ($("$PY" -c \
    "import torch;print(torch.__version__)" 2>/dev/null || echo "no torch"))"
fi
if command -v uvx >/dev/null 2>&1; then
  [ -z "$ALIGNER" ] && ALIGNER="whisperx"
  ok "aligner alternate: whisperx via uvx (align-words.py --backend whisperx)"
fi
[ -n "$ALIGNER" ] || warn "caption aligner (fetch with: --need captions, or install uv)"

echo "== Robust Video Matting"
if [ ! -f "$RVM_DIR/inference.py" ]; then
  existing="$(find "$DEV"/projects -maxdepth 3 -name inference.py -path "*rvm*" 2>/dev/null | head -1)"
  if [ -n "$existing" ]; then
    ln -sfn "$(dirname "$existing")" "$RVM_DIR"
    echo "  reusing $(dirname "$existing")"
  elif [ "$NEED_MATTING" = 1 ]; then
    git clone -q --depth 1 https://github.com/PeterL1n/RobustVideoMatting "$RVM_DIR" 2>/dev/null || true
  fi
fi
[ -f "$RVM_DIR/inference.py" ] && ok "RVM repo: $RVM_DIR (GPL-3.0, review before proprietary use)" \
  || warn "RVM repo (fetch with: --need matting)"

CKPT="$MODELS/rvm_mobilenetv3.pth"
if [ ! -s "$CKPT" ]; then
  existing="$(find "$DEV"/projects -maxdepth 3 -name "rvm_mobilenetv3.pth" 2>/dev/null | head -1)"
  if [ -n "$existing" ]; then
    ln -sf "$existing" "$CKPT"
    echo "  reusing $existing"
  elif [ "$NEED_MATTING" = 1 ]; then
    curl -fSL --retry 2 -o "$CKPT" \
      "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3.pth" \
      || rm -f "$CKPT"
  fi
fi
[ -s "$CKPT" ] && ok "RVM checkpoint: $CKPT" || warn "RVM checkpoint (fetch with: --need matting)"

echo
mode="report-only (reuse + detect)"
[ "$NEED_CAPTIONS$NEED_MATTING$NEED_DENOISE" != "000" ] && mode="fetch: captions=$NEED_CAPTIONS matting=$NEED_MATTING denoise=$NEED_DENOISE"
echo "== summary [$mode]: ${#OK[@]} ready, ${#WARN[@]} missing"
for w in "${WARN[@]:-}"; do [ -n "$w" ] && echo "  todo: $w"; done
if [ -n "$ALIGNER" ]; then
  echo "captions: draft the words, then time them with $ALIGNER"
  echo "  python3 scripts/align-words.py --audio <cut audio> --transcript copy.txt"
else
  echo "CAPTIONS BLOCKED: a transcriber without a forced aligner is not a caption"
  echo "  pipeline, and whisper's own timestamps have shipped wrong captions before."
  echo "  bash scripts/agent-bootstrap.sh --need captions"
fi
echo "paths for scripts:"
echo "  python:     $VENV/bin/python"
echo "  denoise:    $VENV/bin/deepFilter"
echo "  rvm repo:   $RVM_DIR"
echo "  checkpoint: $CKPT"
echo "  whisper:    $WHISPER_BIN (draft words only)"
echo "  aligner:    ${ALIGNER:-none}"
exit 0
