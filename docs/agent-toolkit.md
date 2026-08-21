# Agent capability toolkit

OverlayMotion specifies capabilities, not vendors. An agent may use local CLI
tools, hosted services or a human-assisted step, provided the returned evidence
meets these contracts. The canonical machine-readable list is
`AGENT_CAPABILITIES` in `src/agent/policy.ts`.

## Required capabilities

### Media probe

Input: source media. Output: duration, display dimensions, rotation, frame
rate, codec, color/HDR information and audio streams. `ffprobe` is one suitable
implementation. Never assume file extension describes the decoded video.

### Word transcription and forced alignment

Input: the final cut-only speech audio plus verified transcript copy. Output:
language, segments, each word's forced-aligned start/end time and confidence
where available.

These are two capabilities, not one, and only the second one sets timing.
Transcription drafts the words. Forced phoneme/CTC alignment against the edited
audio supplies every timestamp. Segment-only or raw Whisper token timestamps
are not a degraded fallback for this contract, they are a rejected input:
evenly divided or ASR-inferred words are not exact sync, and captions built
that way have already been rejected on review. `scripts/align-words.py` is the
local implementation (torchaudio MMS_FA, or WhisperX wav2vec2), and it writes
an envelope naming the aligner so downstream steps can refuse anything else.

The delivery QA step must also return decoded audio offset relative to the
aligned proxy; `scripts/check-caption-sync.py` measures it.

### Frame sampling

Input: media and timestamps. Output: a timeline contact sheet plus
full-resolution frames at edit checkpoints. Sample the whole clip once, then
densely around gestures, overlays, cuts, crops and semantic inserts.

### Visual inspection

Input: frames plus transcript intent. Output: padded protected regions, crop
focus, gesture anchor and confidence. Multimodal inspection is enough for
stable placements. It must examine time, not one convenient still.

### Validation and preview QA

Validate both the Edit Decision Plan and Edit Spec with `validateEditDecisionPlan`
(`src/agent/edit-plan.ts`) and `parseSpec` (`src/spec/validate.ts`). Inspect
low-cost checkpoints before full render; verify source audio, captions, spatial
safety and semantic content.

## Conditional capabilities

### Face/hand landmarks or tracking

Use a detector such as MediaPipe only when the face, hand or fingertip moves
enough that sampled inspection cannot keep an anchor safe. Return time-series
landmarks in upright display coordinates, presentation timestamps, confidence,
detection misses, smoothing parameters and any crop-edge clamps. Smooth noisy
coordinates, keep padding, hold the last good anchor over brief misses, reset at
hard cuts, and fall back to a verified static safe region after sustained
failure. A tracked crop must remain inside the source on every frame; never
letterbox, expose black/transparent pixels or invent scene content merely to
keep a face mathematically centered. Installing a large model for a stable
three-second gesture is wasteful and creates extra failure modes.

### Asset acquisition

Use when the requested image/video is absent. Search sources that expose usage
rights, download an editor-friendly file, and return source URL, license and
required credit. Reject a visually good asset when its rights cannot be
established. Cache it locally so preview and render do not depend on a remote
URL.

### Citation verification

Use when displaying a quote, statistic, identity, date or other factual claim.
Return verified copy, an authoritative source and any edition/translation that
changes wording. Search snippets are discovery, not verification.

### Media normalization

Use only when the source cannot be decoded predictably. Bake rotation and make
an editor-friendly proxy while preserving the original reference. Preserve the
source color primaries, transfer function, range, bit depth and HDR metadata
when supported. Never reinterpret or merely retag HDR as SDR. When HDR-to-SDR
is unavoidable, use a color-managed transform, return its parameters, and
verify representative source/proxy/delivery frames through the same display
transform. Do not silently alter speed, perceived color or audio sample timing.

## Escalation ladder

1. metadata + transcript + sparse contact sheet;
2. targeted full-resolution frames;
3. denser sampling around uncertain motion;
4. landmarks/tracking when spatial meaning still cannot be preserved;
5. ask the user only when evidence cannot resolve a consequential choice.

This ladder keeps tokens, model downloads and renders proportional to actual
uncertainty.
