# Delivery encode and color verification

Read this before the final standards-safe encode, and whenever a delivered file
looks different from the source.

The color rules themselves are in the playbook: preserve the source's perceived
color and audio unless a creative change was requested, never retag HDR as SDR,
and never approve an unexplained shift. This page is the mechanical part, the
encode out of the renderer's master.

## The master's tags are a hypothesis, not a fact

The Chromium-based renderer emits a master whose pixel format and color tags do
not describe the pixels reliably (observed: `yuvj420p` tagged `bt470bg` full range
for BT.709 input). Before the final encode:

1. Treat the master's tags as a hypothesis. Decode one overlay-free frame under
   each plausible interpretation and PSNR it against the same frame of the editing
   proxy; the interpretation that matches the proxy wins.
2. Convert with an explicit decode-to-RGB step using the verified interpretation,
   then encode RGB to BT.709 limited with explicit H.264 color metadata. A single
   YUV-to-YUV filter chain that trusts the tags can silently double-apply a range
   conversion and crush levels; this exact failure has produced a crushed 17.9 dB
   delivery in practice.
3. Re-measure delivered frames against the proxy (overlay-free frame, around 40 dB
   expected) before approval. A "correctly tagged" delivery is not evidence; the
   measurement is.

## Normalizing an awkward source

Normalize only when the source cannot be decoded predictably. Bake rotation and
make an editor-friendly proxy while preserving the original reference. Preserve
the source color primaries, transfer function, range, bit depth and HDR metadata
when supported. When HDR-to-SDR is unavoidable, use a color-managed transform,
record its parameters, and verify representative source, proxy and delivery frames
through the same display transform. Do not silently alter speed, perceived color
or audio sample timing.
