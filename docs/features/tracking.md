# Tracked overlays, head-follow and the face bubble

Read this before any request for face or head tracking, a corner bubble, or a
crop that follows the subject.

Use per-frame tracking when the user explicitly asks for it or when sampled
inspection proves that a static anchor cannot follow the subject. Unnecessary
tracking looks nervous and costs more to verify.

## Two ways to spend a track

Edit Spec v1 expresses no time-series landmarks, so tracking is always
preprocessing. There are two ways to spend the result, and picking the wrong one
is the usual mistake:

- **Bake it into a proxy**, which then becomes the spec source. Correct when the
  tracking *is* the framing of the whole delivery, such as a head-follow square
  crop. The renderer never learns the subject moved.
- **Pass it as props to a template.** Correct when the tracked subject is one
  element inside a composed frame, such as a corner bubble over a plate. The
  track is data; what it means is a rendering decision, so it belongs in the spec
  where it can be changed without re-tracking.

Prefer a tracker that emits data and a template that consumes it. A tracker that
writes pixels has welded one rendering decision shut:
`scripts/face-track.swift` exports the track,
`scripts/head-follow-square.swift` bakes a crop, and they run the same detection
over the same frames.

Captions and ordinary OverlayMotion overlays render afterward and stay
screen-locked in both paths.

## Tracking contract

1. Normalize orientation and color first. Detection coordinates, crop geometry
   and rendered pixels must share one upright display space; never mix coded
   dimensions with display dimensions.
2. Detect every presentation-timestamp-ordered frame. For a single-presenter
   shot, select the largest face. Record confidence or detection failures.
3. Convert the detector box into pixel coordinates with its documented origin.
   Apple Vision and Core Image both use a lower-left origin after orientation is
   baked; browser and CSS coordinates do not.
4. Stabilize center and size. At 24 to 30 fps, an exponential smoothing alpha
   near `0.18` to `0.28` is a useful starting range; increase it on large
   movement so the frame catches up instead of visibly lagging. Do not smooth
   across hard cuts.
5. When detection drops briefly, hold the last good anchor. Do not jump to frame
   center for one missed frame. After a real cut or sustained failure, reacquire
   or fall back to a verified static safe crop.
6. Keep tracked graphics hollow or offset unless occlusion is explicitly wanted.
   Eyes, mouth, hairline and expression remain protected.

## Head-follow square crop

Use a real crop rather than placing the portrait over a square canvas. Start
around `0.84 * source short edge` when modest zoom is acceptable; this creates
horizontal and vertical travel while retaining enough context. Center the crop on
the detected face with a small upward bias (about `0.08 * face height`) because
face boxes omit some hair. Smooth first, then clamp the crop center to
`[halfCrop, dimension - halfCrop]` on each axis. This guarantees full-frame pixels
and no black or transparent background. At source edges the subject must remain
off-center; report those clamped frames instead of fabricating pixels or
letterboxing.

On macOS, [`scripts/head-follow-square.swift`](../../scripts/head-follow-square.swift)
implements the proven local path with `VNDetectFaceRectanglesRequest`, adaptive
smoothing, edge clamping, BT.709 video-only output and tracking diagnostics:

```bash
swift scripts/head-follow-square.swift upright-bt709-input.m4v head-follow.mov 900
```

The optional crop side is in source pixels and may not exceed the short edge.
Choose it from full-resolution checkpoints, not from a contact-sheet thumbnail.
Preserve audio separately and mux it only after the OverlayMotion render.

## Face bubble: the recorder look, and what goes behind it

The style: the footage opens full frame, then collapses into a small tracked
bubble in a corner while something else takes the frame. Screen-recorder software
made it familiar, and it is the right shape whenever the speaker stops being the
thing worth looking at but is still the thing worth hearing.

It is a template, `face-bubble`, contract `wraps-video`. Two inputs:

```bash
swift scripts/face-track.swift upright-bt709-proxy.mov face-track.json
```

then the track goes into the overlay's props. Start the overlay where the
collapse should begin, not at 0: the template's own frame 0 is the untouched full
frame, so the base source layer hands over to it with nothing to see.

**What sits behind is a prop, never a second source.** This is the rule, not a
convenience:

> A spec has exactly one base `source`, and it is the speaker: the one whose
> audio survives to delivery. A screen recording, a demo capture, b-roll or a
> flat color behind them all travel in props.

Inverting that (screen recording as source, speaker as a prop) is the arrangement
that loses the speaker's audio, and it is the reason the base source is defined by
audio rather than by whichever image is larger.

| Prop | Notes |
| --- | --- |
| `track` | `[x, y, size]` per frame. `size` is the face box height, and it is what holds the head at a constant share of the bubble while the speaker leans in and out. `timebase: "composition"` indexes from the video's first frame, so a track file needs no slicing to match a late overlay start. |
| `shape` | `"circle"`, `"square"`, or `{ radiusPct }` for anything between. The aperture is square, so rounding is the only shape control; a 16:9 picture-in-picture window is not expressible yet. |
| `backdrop` | A hex string, or `{ color, media }`. `media` takes `src`, `fit`, `position`, `dim` and `loopSec`. Supply `loopSec` for any plate shorter than the talk: the renderer cannot probe media while rendering a frame, so without it the plate freezes on its last frame. |
| `corner`, `sizePct`, `marginPct` | Placement and size, both as a share of frame width so they read the same in any format. |
| `headroom` | Crop side as a multiple of the face box. Below ~1.5 the aperture clips chin and forehead on a head turn; above ~2.5 the face stops being the subject of its own bubble. |
| `enterSec` | `0` by default, a hard cut into the bubble. Raise it only when the collapse is doing work, handing over from a full-frame shot mid-take; around 0.8s reads as a move without stalling the talk. An animated entrance the edit did not ask for is a stall. |
| `shadow` | Give it a plate to sit on, or leave it off. Flat black has nothing to receive a shadow. |

Dim a busy plate (`backdrop.media.dim` around 0.3) rather than shrinking the
bubble to compete with it.

The template caps the crop to the frame and clamps its center inside, so the
bubble is never part backdrop. Do not undo that by widening `headroom` past what
the frame can supply: on a portrait clip with a close subject the cap engages,
which is correct, and the face simply sits off-center near the edges. Perfect
centering inside a circle is not observable; a crescent of backdrop is.

## Required QA

- Inspect a full-timeline contact sheet and dense frames at maximum speed,
  largest displacement, closest and farthest face, blur, frame-edge clamps and any
  detection miss.
- Check temporal behavior at normal speed. Fail nervous micro-jitter, delayed
  catch-up, snap-back, identity swaps, black edges and crop-size pulsing.
- For tracked graphics, verify eyes and mouth remain visible. For head-follow
  crops, verify the head is centered when geometry permits and quantify
  edge-clamped frames when it does not.
- Re-check captions against the closest crop. A screen-locked caption can collide
  with a newly centered or enlarged face even when it was safe before tracking.
- Record detector/backend, coordinate mapping, smoothing values, crop size,
  misses, clamp counts and visual checkpoints in the decision plan.
- For a bubble, verify the aperture is full at the frame where the subject is
  furthest off-center, not just at a comfortable one. Compute the worst frame from
  the track rather than hunting for it by eye. Verify the handover frame against
  the source too: a wrapping template that starts late must show that moment of
  the video, not the video's first frame.
