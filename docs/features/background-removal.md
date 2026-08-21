# Person background removal and replacement

Read this before matting anything: removing, replacing or blurring back the
background behind a person.

Treat background removal as preparation of a reversible video proxy. Edit Spec v1
does not express person segmentation, so the original remains immutable and the
composited proxy becomes the spec's video source. Record the segmentation
backend, model/checkpoint, mask treatment, background and color path in the edit
decision plan.

## Two decisions the caller owns

"Remove the background" names what leaves and never what arrives. A second choice
hides in the same sentence: whether the cutout gets an outline, the sticker ring
that reads as a cut-out sticker rather than a floating subject.

Both are the caller's, not the agent's, and both are expensive to guess because
each wrong answer costs a full re-render. Ask them as **one** question before
matting starts:

- **Backdrop**: `transparent` (a real alpha channel, for compositing later), a
  flat color, the source blurred back, or supplied media. Transparency has a cost
  worth stating: `.mov` means ProRes 4444, which is large, and QuickTime shows
  black behind it because it does not composite alpha.
- **Outline**: off, or a width and color.

**The outline defaults to off.** It is an effect the user asks for, never a
byproduct of matting. Record its presence with the same `basis` an overlay choice
carries, in the plan's `cutout.outline`.

An outline also changes what the backdrop question means. With one, the matte's
soft edge blends into the ring instead of into the backdrop, so a busy plate
stops leaking through hair. Without one, edge quality is the whole illusion and a
high-contrast backdrop will expose every matte flaw.

## Default tool

[`scripts/person-cutout.py`](../../scripts/person-cutout.py) implements both
decisions as flags and is the path new edits should take. Run it with the
bootstrap venv:

```bash
dev-assets/matting-venv/bin/python scripts/person-cutout.py IN OUT \
    --repo dev-assets/rvm \
    --checkpoint dev-assets/models/rvm_mobilenetv3.pth \
    --background transparent|#RRGGBB|blur|<file> \
    --stroke 0 --stroke-color '#FFFFFF' \
    --overlay captions.mov
```

`--stroke 0` is the default and draws nothing. `--overlay` folds an RGBA layer (a
caption render, say) into the same pass, so the protected foreground is encoded
exactly once instead of decoded and re-encoded to composite. Do that compositing
in float with a straight-alpha "over"; ffmpeg's `overlay` filter carries the main
input's alpha through unchanged, which clips the overlay to whatever silhouette
it crosses.

Outline width is a ratio, not a constant: measure it against the subject, not the
frame. The reference look that set the current default is ~3.4% of the head's
width, which is 20px for a head filling 600px of a 1080-wide portrait.

The per-project `dev-assets/projects/*/composite_rvm*.py` copies predate this
script and are kept only as evidence for their field tests.

Use a soft alpha matte, not a binary cutout:

```text
output = source_foreground * alpha + replacement_background * (1 - alpha)
```

Run inference on a resized RGB copy when needed, but composite the
full-resolution color-managed source frame. Do not send foreground pixels through
a generative model or use a model-produced foreground when source color must be
preserved, unless a source-to-result comparison verifies that it is neutral.
Process frames in presentation-timestamp order, preserve their timestamps, and
reset temporal model state at hard cuts or discontinuities.

## Proven macOS path

A reviewed and approved edit used
[`scripts/person-gradient.swift`](../../scripts/person-gradient.swift):

1. Apple `avconvert` baked display rotation and converted the iPhone Dolby Vision
   profile 8.4 / HLG source through a color-managed path to an SDR BT.709 editing
   proxy. The original MOV remained unchanged.
2. `VNGeneratePersonSegmentationRequest` ran at `.accurate` quality through one
   `VNSequenceRequestHandler`, returning an 8-bit person matte for each frame.
3. Core Image scaled the matte to the source frame, expanded it with
   `CIMorphologyMaximum` radius `1.5`, then feathered it with `CIGaussianBlur`
   radius `1.15`. These were starting values for this 1080x1920 source, not
   universal constants.
4. `CIBlendWithMask` composited unchanged proxy foreground pixels over the
   requested procedural gradient. The script wrote a silent, rotation-correct
   H.264 BT.709 proxy with original presentation timestamps.
5. OverlayMotion rendered captions from that proxy. Final mux copied the original
   AAC packet stream instead of encoding audio again.

The approving QA for that edit measured color fidelity, matte edges, full decodes
and byte-identical copied audio; hold any reimplementation to the same checks.

## Linux and Windows backends

Keep the same ingest, alpha-composite and QA contract; replace Apple Vision with
one of these local matting backends:

- **Robust Video Matting (preferred for moving people):** RVM carries recurrent
  state between frames, which usually gives more stable video edges than an
  image-only model. Use its MobileNetV3 checkpoint through PyTorch or ONNX and
  retain recurrent state in timestamp order. The official implementation and
  weights are GPL-3.0, so review distribution requirements before using them in a
  proprietary product. See the [official RVM repository](https://github.com/PeterL1n/RobustVideoMatting).
- **MODNet (lighter fallback):** use the portrait-matting ONNX model for CPU,
  integrated-GPU or simpler deployments. Because MODNet treats frames
  independently, add motion-aware temporal smoothing and inspect fast hands, hair
  and motion blur for flicker. Avoid a blind exponential average that leaves a
  trailing silhouette. See the [official MODNet repository](https://github.com/ZHKKKe/MODNet)
  and [OpenVINO model entry](https://github.com/openvinotoolkit/open_model_zoo/blob/master/models/public/modnet-webcam-portrait-matting/README.md).

Select an ONNX Runtime execution provider from detected hardware, with CPU as a
required fallback:

- **Windows:** prefer WinML on supported current Windows systems for automatic
  provider selection; use CUDA/TensorRT for compatible NVIDIA installations,
  OpenVINO for supported Intel hardware, or DirectML for older/broad DirectX 12
  deployments. DirectML remains supported but is in sustained engineering.
- **Linux:** use CUDA/TensorRT for compatible NVIDIA installations, OpenVINO for
  supported Intel CPU/GPU/NPU hardware, or the default CPU provider.

Provider availability and version compatibility must be detected, not assumed.
Consult the current [ONNX Runtime provider matrix](https://onnxruntime.ai/docs/execution-providers/)
and [Windows guidance](https://onnxruntime.ai/docs/get-started/with-windows.html).
Pin runtime, model and checkpoint versions in the decision plan. Verify the
license of both code and the exact downloaded weights before shipping.

## Matte refinement and compositing rules

- Apply orientation before inference. A mask inferred from coded orientation must
  receive the identical transform as the displayed frame.
- Follow the selected checkpoint's exact channel order, normalization, aspect
  handling and recurrent-state contract. Never stretch a frame merely to match
  model input dimensions; pad or crop as documented, then map the matte back.
- Infer at reduced resolution when hardware requires it, but upscale only the
  matte and composite at delivery resolution. Prefer edge-aware upsampling.
- Start with roughly 1 to 2 full-resolution pixels of protective expansion and
  about 1 pixel of feather for a 1080x1920 portrait. Tune from full-resolution
  samples. Too little clips hair, glasses, ears and shoulders; too much retains a
  room-colored halo.
- For RVM, keep recurrent states across contiguous frames and reset them at cuts.
  For image-only models, use motion-compensated temporal refinement or a short
  edge-aware temporal window; never trade flicker for visible motion lag.
- Keep all matte math in float or at least 16-bit precision when the backend
  permits it. Quantize only at the required encode boundary.
- Dilate the matte for an outline with an octagonal structuring element
  (alternating square and cross 3x3 max filters). One square max-pool of the same
  radius overshoots convex corners by 41% and bevels heads and shoulders. Paint
  the ring color where the matte is partial, `source * a + ring * (1 - a)`, and
  let the dilated matte become the output coverage; the soft edge then blends
  into the ring instead of into whatever sits behind.
- Create the replacement background at the exact frame extent. Composite in a
  known working color space, then encode with correct range, primaries, transfer
  and matrix tags. Never treat an HDR tag change as conversion.

Background-removal preprocessing should normally produce video only. Preserve
audio separately. When timeline duration and cuts are unchanged, mux the original
compatible audio stream with stream copy:

```bash
ffmpeg -i rendered-video.mp4 -i source.mov \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a copy final.mp4
```

If cuts or speed change, apply the same edit map to audio; do not claim
byte-identical preservation. Validate decoded sync after the final container is
written.

## Required QA

1. Inspect a full-timeline contact sheet, then full-resolution frames at scene
   changes, lighting changes, maximum motion blur and near the beginning and end.
2. Check hair, glasses, ears, fingers, shoulders, clothing gaps and frame edges
   for clipping, holes, room-colored halos and background leaks.
3. Watch the complete composite at normal speed for matte chatter, pulsing,
   temporal trails and state leakage across cuts. Still frames alone cannot
   approve video matting.
4. Compare protected foreground crops from the color-managed source and proxy
   through the same display transform. Fail unexplained changes to skin, hair,
   clothing, neutrals, shadows or highlights. Restrict the comparison to the
   opaque region **eroded** past the outline and the feathered edge. An outline is
   opaque and is supposed to differ from the source, so including it measures the
   effect working and reads as a failing score: one such run scored 26dB where the
   eroded mask scored 57dB on the same file.
5. Decode the complete final video and audio streams. When audio was copied,
   compare source/final packet hashes and decoded samples; measure final audio
   offset as described in [captions.md](captions.md#caption-qa).
