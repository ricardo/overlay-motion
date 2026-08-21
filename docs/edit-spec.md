# Edit Spec v1

An edit spec is a JSON document that describes a finished edit: one base
source, a stack of overlay templates, cameras, and sound. It is the only
input an agent needs to produce a video. Zod schemas live in
`src/spec/types.ts`; full validation (shape + template cross-checks) is
`validateSpec` / `parseSpec` from `src/spec/validate.ts`.

```json
{
  "version": 1,
  "format": "landscape",
  "fps": 60,
  "durationSec": 20,
  "source": { "type": "video", "src": "your-footage.mp4" },
  "overlays": [
    {
      "template": "speaker-card",
      "region": "lower-third",
      "time": { "start": "2s", "duration": "9s", "appear": 0.7 },
      "props": { "name": "Ana", "role": "Founder", "photo": "ana.png" }
    }
  ]
}
```

This page is the grammar every spec uses. Three parts of it are big enough to
have their own page, and you only need them when the edit does:
[captions](features/captions.md), [sound cues](features/sound.md) and
[music](features/music.md).

## The two axes: region and time

Natural language like "on the bottom, at 2/3 of the video, for 3s" compiles
to `region: "lower-third"`, `time: { start: "66%", duration: "3s" }`.

- **`region`** (space): a named region (`fullscreen`, `top-banner`, `lower-third`,
  `upper-third`, `caption-zone`, `left-panel`, `right-panel`, `center`,
  `corner-tl/tr/bl/br`) or a custom rect in percentages
  (`{ "x": 31, "y": 70, "w": 38, "h": 18 }`). Unset uses the template's
  preferred region.
- **`time`** (timeline): values are seconds (`3` or `"3s"`), percentages of
  the owner timeline (`"66%"`), or negative seconds from the end (`"-2s"`).
  A window is `{ start, duration, appear, hold }`: `appear` is how long the
  entrance choreography takes, `hold` is how long the finished overlay stays
  after that. `duration` absent + `hold` present makes the window
  `appear + hold`.

Sequence overlays with about 1s between windows so handoffs read cleanly.

## Source and the source contract

`source` is the base layer: `{ type: "video", src }` (options: `muted`,
`fit`, `position`, `flipHorizontal`, footage-only `camera`, time-windowed
`reframes`), `{ type: "audio", src }`, or
`{ type: "none" }`.

### Subject-safe source reframes

`source.reframes` moves the base footage into a percentage rectangle during a
time window while overlays stay locked to the composition. This is editorial
layout, not camera motion. It is intended for split screens where simply
covering half of the fullscreen source would hide a face or demonstrated
object. Reframe windows may not overlap.

```json
{
  "type": "video",
  "src": "speaker.mp4",
  "fit": "cover",
  "position": "center 30%",
  "reframes": [
    {
      "time": { "start": "9s", "duration": "8s" },
      "region": { "x": 4, "y": 8, "w": 44, "h": 84 },
      "position": "60% center",
      "transitionSec": 0.3
    }
  ]
}
```

`fit` defaults to `cover`, `position` to `center`, and `transitionSec` to 0.3.
Resolve the position by inspecting the subject across the full window.

Every template declares one relationship with that base source, and
validation enforces it:

| Contract | Meaning | Requires |
| --- | --- | --- |
| `overlay` | Self-contained; draws over whatever the source is. Most templates. | nothing |
| `annotates-video` | Only makes sense over footage (captions, ticker, recording chrome). | `source.type: "video"` |
| `wraps-video` | Renders the base video inside its own layout (video-card). One per spec. | `source.type: "video"` |
| `visualizes-audio` | Driven by a standalone audio file (audiogram); receives it as `sourceSrc`. | `source.type: "audio"` |

A template that ships its own footage via props is still `overlay`: the
contract describes the BASE source only.

## Camera motion vs object motion

A **camera** moves the frame around finished content; **object motion** is
the content moving, and it belongs to the template. A camera never
choreographs entrances or exits.

Cameras live at three scopes, location = scope:

- `spec.camera`: the scene; source and every overlay move as one shot.
- `source.camera`: footage only; overlays stay locked to their regions.
- `overlay.camera`: one overlay's region viewport, on the overlay's own
  timeline.

Presets: `push-in`, `push-in-out`, `push-in-fast-out`, `pull-out`,
`pan-left/right/up/down`, `handheld` (fields `frequency`, `seed`), with
`amount`, `focus {x,y}`, `time`, `easing`. Scene scope accepts an array of
windows. Full grammar: [camera-motion-spec.md](camera-motion-spec.md).

## The motion language

Small on purpose, so mixed templates read as one design system. All three
knobs are optional; unset keeps the template's native motion.

- **`reveal`** (text entrance hint): `"fade-up"`, `"blur-in"`,
  `"typewriter"`. Text templates map it to their nearest native mode and may
  expose richer extensions via props (quote-card `animateIn` adds
  `"lines"`/`"words"`; tweet-card adds `"paragraphs"`/`"none"`). A template's
  own prop overrides the hint, so swapping one value compares treatments with
  identical copy and timing. Quote Card's `revealDurationSec` defaults to
  `"auto"`: it derives from `time.appear` when that is set, otherwise from the
  real wrapped line count after fonts load. A positive number overrides both
  and measures from the first line starting to the last becoming fully visible.
- **`enter`** (card entrance, renderer-provided, identical on every
  template): `"slide-left"`, `"slide-right"`, `"spring"`, `"mask"`.
- **`exit`**: `"blur-out"` (blur + lift, the signature departure),
  `"fade-down"`, `"shrink"`, `"vanish"` (anticipation, then a 0.45s implosion
  with blur and a `pop` cue: the literal "make it disappear"; the other three
  run 0.9s). Templates with their own `exit` prop (speaker-card) treat the
  spec value as default, not override.
- **`motion`** (object motion, works on EVERY template). Two families, and the
  family decides which knobs mean anything.

  **Periodic**, oscillating for as long as their window lasts: `"shake"` (held
  in a hand: a slow drift, a mid correction and a fine tremor), `"wobble"` (a
  rock), `"float"` (a bob), `"sway-3d"` (a slow turn through depth, left and
  right). Shaped by `frequency`, phase-shifted by `seed`, faded by `rampSec` and
  `rampOutSec`.

  **One-shot**, traversing their window exactly once and easing to a stop at
  both ends: `"skew-right"`, `"skew-left"`, `"skew-up"`, `"skew-down"`. Each
  starts at the opposite extreme, passes through flat, and lands in a strong
  perspective keystone facing the named direction. The window IS the tempo, so
  `frequency`, `seed` and the ramps are inert for these; use `time` to say when
  and how long. The pair on one axis chains seamlessly, because the first ends
  in exactly the pose the second starts from:

  ```json
  "motion": [
    { "style": "skew-right", "time": { "duration": "4s" } },
    { "style": "skew-left", "time": { "start": "4s", "duration": "4s" } }
  ]
  ```

  Shared knobs: `style`, `amount` (0..1, unset uses the style's own default:
  0.2 for the flat styles, 0.7 for `sway-3d`, 0.175 for the `skew-*` sweeps,
  which land near 10deg because a sweep HOLDS its end pose and the card has to
  stay readable there) and `time`. Amplitudes are
  percentages of the overlay's region box, so one `amount` reads the same
  everywhere. It is its own transform layer, so it **stacks** with `camera`,
  `enter`, `exit` and `scale`, and an array of motions stacks with itself:

  ```json
  { "template": "quote-card", "enter": "spring",
    "camera": { "preset": "pull-out", "amount": 0.25 },
    "motion": { "style": "shake", "amount": 0.3 } }
  ```

  Use it instead of a `handheld` camera whenever you want the thing to move
  rather than the view of it: the camera preset zooms the region viewport by 5x
  `amount` to hide frame edges, which changes how big a card reads and is
  meaningless for a transparent cutout. Templates may ship a `defaultMotion`
  (the sticker drifts for free); `motion: { "style": "none" }` turns it off.
  `src/player/shake.ts`, `src/player/OverlayMotion.tsx`.

## Sticker border

`sticker` takes an optional die-cut outline. It is off unless you ask for it,
and it follows the artwork's own alpha edge, not its bounding box, because a
rectangle around a cutout is exactly the frame this template exists to avoid:

```json
{ "template": "sticker", "props": { "src": "pickle", "border": { "width": 10, "color": "white" } } }
```

`width` is design pixels at a 1080px short edge and means what it says: the
outline is grown one width out from the silhouette in every direction. `color`
takes a brand token, `white` / `black`, or a `#rrggbb` literal, the same escape
captions open. The border is painted before the contact `shadow`, so the shadow
is cast by the outlined silhouette instead of crossing it.

Two scaling behaviours worth knowing, because they differ. A camera transforms
the whole overlay after the outline is drawn, so a push-in thickens the edge
along with the art, which is what something belonging to the sticker should do.
`sizePct` does not: the width resolves against the composition, not the element,
so it is a fixed thickness on the finished frame and a small sticker reads with a
proportionally heavier edge. Drop the width when you shrink the art.

## Bundled sticker art

`sticker`'s `src` takes a bundled library NAME as well as a path or URL, so an
agent with no artwork of its own still has cutouts it can reach:

```json
{ "template": "sticker", "props": { "src": "pickle" } }
{ "template": "sticker", "props": { "src": "/my-brand/mascot.png" } }
```

Names carry no slash and no extension, so they can never collide with a path.
The set is `STICKER_LIBRARY` in `src/templates/sticker/library.ts` and the files
live in `public/stickers/`; provenance is in `public/stickers/SOURCES.md`. Today
it is one entry, `pickle`. Everything else about the template is unchanged: the
name only resolves the file.

## Sound and music

Cues default on. `sound` at the spec root sets defaults and each overlay may
override it; a template's own cue is a prop (`"sfx": "ding"`, `"sfx": false`),
while `sound.sounds` remaps by cue name for everything in scope. The core palette
is `click`, `pop`, `whoosh`, `ding`, `typewriter`. Full rules, including the two
scopes and the bundled library cues: [features/sound.md](features/sound.md).

`music` at the spec root is the bed under the whole composition, outside every
camera. `volume` is linear gain, defaults to `0.08`, and is the whole job: a bed
under speech belongs 15 to 20 LU below it, so measure both with `ffmpeg -af
ebur128` and compute the gain instead of judging it in a preview. `validateSpec`
rejects a bed above `0.3` while the source audio is unmuted. `fadeInSec` (1),
`fadeOutSec` (1.5), `trimStartSec` and `loop` (off) are the rest. The arithmetic,
a worked example and the fade/loop reasoning: [features/music.md](features/music.md).

## Captions

`caption-classic` is the caption renderer, and captions have a route that starts
before the spec does: forced alignment produces the word times, and a transcriber
never does. Read [features/captions.md](features/captions.md) before authoring
one.

The shape, in brief: pass one composition-relative `track` of cues and words (the
legacy overlay-relative `lines` remains valid), position with `region`, prefer the
named `"caption-zone"`, and configure `preset` (`classic`, `minimal`, `editorial`,
`punch`, `extruded`), `grouping`, `layout`, `highlight`, `appearance`, `styles`
and word `marks`.

```json
{
  "template": "caption-classic",
  "region": "caption-zone",
  "time": {},
  "props": {
    "preset": "classic",
    "track": {
      "timebase": "composition",
      "cues": [
        {
          "start": 1.1,
          "end": 2.4,
          "words": [
            { "text": "Build", "start": 1.18, "end": 1.45 },
            { "text": "OverlayMotion", "start": 1.46, "end": 2.05, "marks": ["buzzword"] }
          ]
        }
      ]
    }
  }
}
```

## Brand theme

Templates never hardcode style; they read tokens from the active
`BrandTheme`: `colors` (primary, onPrimary, surface, onSurface, muted,
background, optional secondary/accent), `fonts` (heading, body, optional serif), `radius`,
`logoText`, and optional `style` (surface `"solid" | "glass"`, `blur` up to
100, `opacity`, gradients, `borderColor`). Same spec + another theme =
rebranded video. Brand comes from the theme, never from props: no hex colors in
props, and caption style overrides reference these roles.

### Gradients and glass

Solid themes stay valid; `style` is additive. `backgroundGradient` applies at
composition scope. `surfaceGradient` and the glass material apply to card-based
templates through the shared `surfaceStyle()` helper, and `radius` is shared by
Quote Card, Tweet Card and every other card surface.

```json
{
  "name": "Aurora Glass",
  "colors": {
    "primary": "#3F5CCB",
    "secondary": "#173B8F",
    "accent": "#6B83E8",
    "background": "#050B18",
    "surface": "#14254A",
    "onPrimary": "#F7F9FF",
    "onSurface": "#F5F7FF",
    "muted": "#94A6CB"
  },
  "radius": 44,
  "style": {
    "backgroundGradient": { "from": "#050B18", "to": "#112D69", "angle": 145 },
    "surfaceGradient": { "from": "#1A3974", "to": "#0B162E", "angle": 145 },
    "surface": "glass",
    "blur": 32,
    "opacity": 0.64,
    "borderColor": "#4969D1"
  }
}
```

## Formats

`vertical` 1080×1920, `horizontal` 1920×1080, `landscape` 1620×1080,
`square` 1080×1080. Templates scale through the shared `rem()` helper, so
one spec renders correctly in all four.

## Validation

`parseSpec(raw)` (throws) or `validateSpec(raw)` (safe result) from
`src/spec/validate.ts`. Beyond shape, they validate every template's nested
props, enforce known template slugs, source-contract requirements, at most one
`wraps-video` overlay, and non-overlapping source-reframe windows. Overlay and
source-reframe windows may not extend past the composition duration.
`editSpec.parse` alone checks shape only; prefer the checked variants.
