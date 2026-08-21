# Camera motion

Everything on this page is implemented. Keyframes, rotation and `crop` are not
part of Edit Spec v1: do not author them.

A camera block may live at three locations, and its location is its scope:

- `spec.camera`: the scene; source and every overlay move as one shot
  (`src/player/SceneCamera.tsx`).
- `source.camera`: footage only; overlays stay locked to their regions.
- `overlay.camera`: one overlay's region viewport, on the overlay's own timeline
  (`src/player/OverlayCamera.tsx`).

Location-based scope avoids selectors and overlay IDs. Any scope accepts one
camera or an array of up to 8, each becoming its own nested transform, so a
zoom-out is a reusable effect rather than something an overlay can only have
once. Scopes combine; their transforms nest.

## Camera motion vs object motion

The one distinction every author and agent must hold: a **camera** moves the
frame around finished content; **object motion** is the content moving. They
never share knobs.

| | Camera motion | Object motion |
| --- | --- | --- |
| What moves | The viewport (scene, footage, or one overlay's region) | The template's own elements (card, text, items) |
| Who owns it | The spec's `camera` blocks | The template |
| Steered by | `spec.camera`, `source.camera`, `overlay.camera` | `time.appear`, `reveal`, `exit`, `overlay.motion`, template props |
| Examples | Push in on a face, handheld sway, settle after entrance | Card springs up, text types on, list items stagger |

The `handheld` preset is the one place authors reliably pick the wrong side. It
is a CAMERA: it moves a region's viewport and therefore zooms in (5x `amount`) so
drift never exposes a frame edge. For a transparent cutout there is no edge to
protect and the zoom silently changes how big the art reads, so overlays carry
`overlay.motion` for that: object motion applied to the element itself
(`src/player/shake.ts`, rendered by `src/player/OverlayMotion.tsx`), available on
every template. Shaking framed footage or a whole scene is still the camera's job.
The two motion families are documented in
[edit-spec.md](edit-spec.md#the-motion-language).

`motion` and `camera` are separate transform layers, so they stack: a card can
pull out and drift at the same time. Order, outermost first, is
`OverlayTransform` (scale/enter/exit) → `OverlayCamera` (region viewport) →
`OverlayMotion` (the element) → the template.

Rule of thumb: if the move belongs to a thing ("the card slides in"), it is
object motion and lives in the template. If the move belongs to the viewer's eye
("we lean toward the speaker"), it is a camera. A camera never choreographs
entrances or exits, and templates never implement camera motion internally.

## The fields

```ts
{
  preset: "push-in" | "push-in-out" | "push-in-fast-out" | "pull-out"
        | "pan-left" | "pan-right" | "pan-up" | "pan-down" | "handheld",
  amount?: number,                       // default 0.06, max 1
  inSec?: number,                        // zoom presets only
  outSec?: number,                       // zoom presets only
  rest?: number,                         // default 0, zoom presets only
  focus?: { x: number, y: number },      // composition percentages, default center
  frequency?: number,                    // handheld only, default 2.4
  seed?: number,                         // handheld only, default 0
  time?: TimeWindow,
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out",  // default ease-in-out
}
```

- **`amount`** is motion strength: zoom fraction for push and pull, own-size
  fraction for pans, wobble amplitude for handheld (0.018 reads as natural
  micro-shake).
- **`inSec` / `outSec`** are second-exact phase durations on the raw window
  timeline, and they bypass the easing curve so seconds stay seconds. `inSec` is
  how long the approach takes from the window start ("zoom in right NOW");
  `outSec` is how long the return takes, ending at the window close. Whatever
  remains between them is the hold. `push-in` takes `inSec` and holds the arrived
  framing to the window end; `pull-out` takes `outSec`; `push-in-out` and
  `push-in-fast-out` take both. This is the tool for spoken beats: two commands
  in the audio become one window whose edges sit on them.
- **`rest`** is the zoom this camera HOLDS when it is not moving: after its move
  settles, and everywhere outside its window. Without it a camera returns to
  identity, so "open tight on the face, then sit at a slight push for the rest of
  the video" would be two windows meeting at a step. `rest: 0.1` with
  `preset: "pull-out"` and `amount: 0.375` opens at 1.375, settles to 1.10 and
  stays there. `rest: 0` is the plain behaviour.
- **`focus`** is the transform origin in percentages of the camera owner's
  untransformed box: `{x: 0, y: 0}` top-left, `{x: 100, y: 100}` bottom-right,
  default center. The focus point lands at viewport center.

Scope viewport: root is the composition, source is the footage slot (including a
slot inside a `wraps-video` template), overlay is the resolved region box. Render
nesting:

```text
composition clip
  root camera
    source camera
      source
    overlay region placement
      overlay camera
        template internal motion
```

## Time semantics

- Root and source camera time uses the composition timeline. Overlay camera time
  uses that overlay's own timeline: `0s` is the overlay's first frame.
- `camera.time` selects a window inside the owner timeline. Without it, the window
  is the full owner timeline.
- Outside the window the camera sits at its resting zoom, which is identity
  unless `rest` says otherwise. A completed window never leaks its final pan into
  the following edit. A delayed overlay `pull-out` is the exception before its
  window: it holds the opening zoom so motion can begin without a snap.
- All resolution uses frames, `fps` and pure interpolation. No CSS animation,
  wall clock, randomness or runtime measurement affects rendered frames, which is
  why the Player and a CLI render agree frame for frame.

## Safe authoring defaults

Camera motion needs one editorial intent. It is not background decoration.

- Camera windows in the same scope must not overlap, and validation rejects it.
  Stacked transforms read as rapid zoom reversals or playback glitches.
- `push-in-fast-out` needs at least a 3-second window: arrive, hold the new
  framing long enough to read, then return once. Validation rejects shorter.
- Leave about 1 second between separate moves in the same scope unless a cut
  creates a new shot.
- Do not alternate push-in and pull-out repeatedly to manufacture energy.
  Repeating camera motion requires an explicit editorial reason, which means the
  user asked for it.
- To end zoomed, either close the window on the composition's final frame or set
  `rest`. Do not leave a gap and expect the framing to persist on its own.
- Choose the scope by semantics and text safety together. "Zoom in with the
  camera" is the recording camera, so footage-only `source.camera` fits, and it
  keeps text out of an animated scale: animated scale over text shimmers glyphs
  in Chromium renders, see [recipe-scaled-text.md](recipe-scaled-text.md).
- A footage push-in magnifies the subject toward locked overlay regions. Check
  overlay clearance against the zoomed subject at the overlay's exit time, using
  the camera's zoom at that moment, not the pre-zoom frame.
- Inspect a continuous preview at normal speed. Entrance, middle and exit stills
  cannot reveal oscillation.

## Presets

Presets are authoring sugar, never separate rendering behavior.

- `push-in`: zoom from `1` to `1 + amount`.
- `pull-out`: zoom from `1 + amount` to `1`.
- `push-in-out`: approach, hold, then restore framing before the window ends.
- `push-in-fast-out`: spends most of the window approaching, then returns quickly.
- `pan-left/right/up/down`: move focus by `amount * 100` percentage points.
  Direction describes camera attention, so `pan-right` raises focus `x` and
  pixels move left.
- `handheld`: deterministic wobble shaped by `frequency` and phase-shifted by
  `seed`; `easing` is ignored.

## Example

```json
{
  "version": 1,
  "format": "vertical",
  "fps": 30,
  "durationSec": 12,
  "camera": {
    "preset": "push-in",
    "amount": 0.06,
    "time": { "start": "0s", "duration": "12s" },
    "easing": "ease-in-out"
  },
  "source": {
    "type": "video",
    "src": "intro.mp4",
    "camera": {
      "preset": "pull-out",
      "amount": 0.375,
      "rest": 0.1,
      "outSec": 1.2,
      "focus": { "x": 72, "y": 42 },
      "time": { "start": "2s", "duration": "4s" }
    }
  },
  "overlays": [
    {
      "template": "stat-counter",
      "region": "corner-tl",
      "time": { "start": "3s", "duration": "4s" },
      "camera": { "preset": "push-in", "amount": 0.08, "inSec": 0.6 },
      "props": { "value": 150, "suffix": "K", "label": "subscribers" }
    }
  ]
}
```

## Validation

`validateSpec` rejects, by name and path:

- a camera window extending past the composition duration;
- overlapping windows within one scope;
- `push-in-fast-out` under 3 seconds;
- `rest` on a preset that does not zoom, or `rest` greater than `amount`;
- `inSec` or `outSec` on a pan or handheld, `outSec` on `push-in`, `inSec` on
  `pull-out`, or `inSec + outSec` longer than the window;
- a camera on an `audio` or `none` source.
