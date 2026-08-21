import { z } from "zod/v3";
import { soundConfig } from "../sound/config";
import { SHAKE_STYLES } from "../player/shake";

/**
 * Edit Spec v1: the technical format that describes an edit.
 * Two unambiguous axes: `region` (space) and `time` (timeline).
 * Natural language like "on the bottom, at 2/3 of the video, for 3s"
 * compiles to: region "lower-third", time {start: "66%", duration: "3s"}.
 */

export const timeValue = z.union([
  z.number(), // seconds
  z
    .string()
    .regex(
      /^-?\d+(\.\d+)?(s|%)$/,
      'Use "3s", "66%", "-2s" (from end) or a number of seconds'
    ),
]);
export type TimeValue = z.infer<typeof timeValue>;

export const regionNames = [
  "fullscreen",
  "top-banner",
  "lower-third",
  "upper-third",
  "caption-zone",
  "left-panel",
  "right-panel",
  "center",
  "corner-tl",
  "corner-tr",
  "corner-bl",
  "corner-br",
] as const;
export const regionName = z.enum(regionNames);
export type RegionName = z.infer<typeof regionName>;

export const rectPct = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(0).max(100),
  h: z.number().min(0).max(100),
});
export type RectPct = z.infer<typeof rectPct>;

export const region = z.union([regionName, rectPct]);
export type Region = z.infer<typeof region>;

export const timeWindow = z.object({
  start: timeValue.optional(), // default: 0
  duration: timeValue.optional(), // default: until the end
  /**
   * Appear + hold: the lifecycle pattern. `appear` is how long the overlay's
   * entrance choreography takes; `hold` is how long the finished overlay stays
   * on screen after that. When `duration` is absent and `hold` is present, the
   * window becomes `appear + hold`. `appear` alone only paces the entrance.
   */
  appear: timeValue.optional(),
  hold: timeValue.optional(),
});
export type TimeWindow = z.infer<typeof timeWindow>;

/**
 * CAMERA vs OBJECT MOTION, the distinction that keeps specs sane: a camera
 * moves the FRAME around finished content, it never choreographs the content
 * itself. Entrances, exits and item motion are object motion, owned by the
 * template and steered only through `time.appear`, `reveal`, `exit` and
 * template props. If a card should slide or spring, that's the template's
 * job; if the viewer's eye should travel (push in on a face, settle after an
 * entrance), that's a camera.
 *
 * Cameras exist at three scopes, and location defines scope:
 * - `spec.camera`: the scene; source and every overlay move as one shot.
 * - `source.camera`: footage only; overlays stay locked to their regions.
 * - `overlay.camera`: one overlay's region viewport, on the overlay's own
 *   timeline (`time` defaults to the full overlay window; typical use is a
 *   `pull-out` settle starting at `time.appear`).
 * Scopes nest scene > footage/overlay > template internal motion, so an
 * overlay can never reach the scene camera. Full grammar and the preset
 * subset implemented here: docs/camera-motion-spec.md.
 */
export const cameraPreset = z.enum([
  "push-in",
  "push-in-out",
  "push-in-fast-out",
  "pull-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "handheld",
]);
export type CameraPreset = z.infer<typeof cameraPreset>;

export const cameraEasing = z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]);
export type CameraEasing = z.infer<typeof cameraEasing>;

export const camera = z.object({
  preset: cameraPreset,
  /**
   * Motion strength: zoom fraction for push/pull, own-size fraction for pans,
   * wobble amplitude for handheld (0.018 reads as natural micro-shake).
   */
  amount: z.number().positive().max(1).default(0.06),
  /**
   * Second-exact phase durations for the zoom presets, measured on the raw
   * window timeline (global easing is bypassed so seconds stay seconds).
   * `inSec`: how long the approach takes from the window start ("zoom in
   * right NOW"). `outSec`: how long the return takes, ending at the window
   * close ("zoom out right NOW"). Whatever remains between them is the hold.
   * push-in uses `inSec` (arrive, then hold to the window end); pull-out uses
   * `outSec` (return over the first outSec, then hold identity); push-in-out
   * and push-in-fast-out use both. Unset keeps each preset's native
   * fractions. Pans and handheld reject these fields.
   */
  inSec: z.number().positive().max(30).optional(),
  outSec: z.number().positive().max(30).optional(),
  /**
   * The zoom this camera HOLDS when it is not moving: after its move settles,
   * and everywhere outside its window. Zoom presets only.
   *
   * Without it every camera returns to identity, so "open tight on the face,
   * then sit at a slight push for the rest of the video" is not one move but
   * two windows meeting at a step. `rest: 0.1` with `preset: "pull-out"` and
   * `amount: 0.375` opens at 1.375, settles to 1.10, and stays there. The
   * default of 0 is the old behaviour exactly.
   *
   * It must not exceed `amount`: a camera cannot rest further in than the
   * furthest point of its own move.
   */
  rest: z.number().min(0).max(1).default(0),
  /** Transform origin in composition percentages; defaults to frame center. */
  focus: z
    .object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
    })
    .optional(),
  /** Handheld only: sway cycles per second. */
  frequency: z.number().positive().max(10).default(2.4),
  /** Handheld only: phase seed so stacked handheld tracks don't move in sync. */
  seed: z.number().int().min(0).default(0),
  time: timeWindow.optional(),
  easing: cameraEasing.default("ease-in-out"),
});
export type Camera = z.infer<typeof camera>;
export type CameraInput = z.input<typeof camera>;

/**
 * Any scope may layer independent camera windows. Each entry becomes its own
 * nested transform, so a zoom-out is a reusable effect rather than something a
 * template bakes in: stack it with a pan, or with `overlay.motion`, and no
 * layer overwrites another.
 */
export const sceneCamera = z.union([camera, z.array(camera).min(1).max(8)]);
export type SceneCameraSpec = z.infer<typeof sceneCamera>;

/**
 * OBJECT motion for one overlay: the ELEMENT drifts, no viewport is moved, so
 * nothing is cropped and nothing is zoomed. The counterpart of `camera` at
 * overlay scope, and the reason both exist: `camera.preset: "handheld"` has to
 * zoom the region by 5x `amount` to stop its drift from exposing frame edges,
 * which changes how big a card reads and is meaningless for a transparent
 * cutout that has no edges to protect.
 *
 * Renderer-provided, so it works on EVERY template rather than being one
 * template's prop, and it is its own transform layer, so it STACKS: a card can
 * pull out and drift in the same window without either move overwriting the
 * other. Templates may declare a `defaultMotion` they ship with; this field
 * overrides it.
 *
 * Amplitudes are percentages of the overlay's REGION box, not of whatever box
 * a given template chose internally, so the same `amount` reads the same on a
 * quote card and on a sticker.
 */
export const objectMotion = z.object({
  /**
   * "shake" is a hand holding it, "wobble" rocks, "float" bobs, and "sway-3d"
   * turns the element through depth, left and right, under a perspective.
   */
  style: z.enum(SHAKE_STYLES).default("shake"),
  /**
   * 0..1 intensity. Unset uses the style's own default, because one number
   * cannot mean the same thing on a hand drift and a turn through depth
   * (`SHAKE_DEFAULT_AMOUNT`: 0.2 for the flat styles, 0.7 for "sway-3d").
   */
  amount: z.number().min(0).max(1).optional(),
  /** Cycles per second of the slowest octave; unset uses the style's tempo. */
  frequency: z.number().min(0.05).max(30).optional(),
  /** Phase offset: two elements with different seeds never move in lockstep. */
  seed: z.number().default(1),
  /**
   * Seconds spent easing the amplitude in at the window's start, so the element
   * begins exactly where layout put it instead of jumping on frame one.
   */
  rampSec: z.number().min(0).max(3).default(0.25),
  /**
   * Seconds spent easing it back out at the window's end, so the element
   * settles instead of being cut mid-swing. Set 0 for motion that should run
   * until the overlay leaves and be carried away by the exit.
   */
  rampOutSec: z.number().min(0).max(3).default(0.4),
  /**
   * When this motion runs, on the overlay's own timeline. Defaults to the whole
   * overlay window. Independent of `camera.time`, which is the point: a card can
   * finish zooming out long before it stops drifting.
   */
  time: timeWindow.optional(),
});
export type ObjectMotion = z.infer<typeof objectMotion>;
export type ObjectMotionInput = z.input<typeof objectMotion>;

/** One motion or a stack of them, e.g. a 3D sway layered over a hand drift. */
export const overlayMotion = z.union([objectMotion, z.array(objectMotion).min(1).max(4)]);
export type OverlayMotionSpec = z.infer<typeof overlayMotion>;

/**
 * Time-windowed base-footage composition. This is editorial layout, not a
 * camera: the source occupies another screen region while overlays remain
 * locked to the composition. Primary use: keep a presenter fully visible in
 * one half while secondary media fills the other half.
 */
export const sourceReframe = z.object({
  time: z.object({
    start: timeValue,
    duration: timeValue,
  }),
  region: rectPct,
  fit: z.enum(["cover", "contain"]).optional(),
  /** CSS object-position, e.g. "center 32%" after inspecting the subject. */
  position: z.string().optional(),
  /** Seconds used to ease into and out of the target region. Zero makes a cut. */
  transitionSec: z.number().min(0).max(2).optional(),
});
export type SourceReframe = z.infer<typeof sourceReframe>;

export const overlay = z.object({
  template: z.string(),
  region: region.optional(), // default: template's preferred region
  /** Uniform visual scale inside the resolved region. */
  scale: z.number().min(0.25).max(2).optional(),
  time: timeWindow.optional(),
  /**
   * Camera over this overlay's region viewport; never its entrance or exit.
   * Accepts a stack, so a `pull-out` settle and a later `pan-right` are two
   * entries rather than two templates.
   */
  camera: sceneCamera.optional(),
  /**
   * Object motion layered on top of whatever the template already does: the
   * element drifts as if held, rocks, bobs or turns through depth. Stacks with
   * `camera`, `enter`, `exit` and `scale`, because each is its own transform
   * layer, and accepts an array to stack motions with each other. Overrides the
   * template's own `defaultMotion`; `style: "none"` turns that default off.
   */
  motion: overlayMotion.optional(),
  /**
   * Text-entrance hint, part of the canonical motion language: "fade-up"
   * rises into place, "blur-in" settles from soft focus, "typewriter" types
   * character by character with tick sfx. Templates that expose their own
   * entrance prop (e.g. quote-card `animateIn`, which adds extensions like
   * "lines"/"words") treat this as the default, not an override; a template
   * without a matching style falls back to its native default.
   */
  reveal: z.enum(["typewriter", "fade-up", "blur-in"]).optional(),
  /**
   * Card-entrance choreography, renderer-provided so it looks identical on
   * every template: "slide-left"/"slide-right" glide in from that edge,
   * "spring" scales up with a spring, "mask" wipes the card visible left to
   * right. Unset keeps only the template's native entrance.
   */
  enter: z.enum(["slide-left", "slide-right", "spring", "mask"]).optional(),
  /**
   * Exit-style hint, canonical counterpart of `reveal`/`enter`: "blur-out"
   * melts away with blur + lift, "fade-down" fades while drifting down,
   * "shrink" scales away toward center, "vanish" pops the element out of
   * existence (fast scale-down + blur + fade, half the duration of the
   * others) for the spoken "make it disappear". Templates that expose their
   * own exit prop (e.g. speaker-card `exit`) treat this as the default, not
   * an override. The renderer gives every template the shared exit motion.
   */
  exit: z.enum(["blur-out", "fade-down", "shrink", "vanish"]).optional(),
  props: z.record(z.unknown()).default({}),
  sound: soundConfig.partial().optional(), // overrides the spec-level sound config
});
export type Overlay = z.infer<typeof overlay>;

export const specSource = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("video"),
    src: z.string(),
    muted: z.boolean().optional(),
    fit: z.enum(["cover", "contain"]).optional(),
    /** Default CSS object-position for the base footage. */
    position: z.string().optional(),
    /** Mirror source footage without reversing overlay text or placement. */
    flipHorizontal: z.boolean().optional(),
    /** Footage-only camera; overlays remain locked to their screen regions. */
    camera: sceneCamera.optional(),
    /** Time-windowed base-footage regions, used for subject-safe recomposition. */
    reframes: z.array(sourceReframe).max(32).optional(),
  }),
  z.object({ type: z.literal("audio"), src: z.string() }),
  z.object({ type: z.literal("none") }),
]);
export type SpecSource = z.infer<typeof specSource>;

export const formats = ["vertical", "horizontal", "landscape", "square"] as const;
export const format = z.enum(formats);
export type Format = z.infer<typeof format>;

export const FORMAT_DIMENSIONS: Record<Format, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
  landscape: { width: 1620, height: 1080 },
  square: { width: 1080, height: 1080 },
};

/**
 * Gain for a music bed when nothing else is stated. Low on purpose: a bed is
 * scenery, and the failure everyone ships is a track at unity drowning a
 * voice-over. Commercial music masters near -14 LUFS and recorded speech
 * usually lands quieter than that, so a bed at 1.0 is not "balanced", it is
 * louder than the person talking.
 */
export const MUSIC_BED_DEFAULT_VOLUME = 0.08;

/**
 * Hard ceiling for a bed that plays under speech. Above this the music stops
 * being a bed, and no edit has ever wanted that by accident. Validation rejects
 * it rather than letting it reach a render, because a mix mistake is invisible
 * in every still frame and only shows up in the one artifact that costs money
 * to produce.
 */
export const MUSIC_BED_MAX_VOLUME_UNDER_SPEECH = 0.3;

/**
 * A music bed under the whole composition. It is not a `source` and not an
 * overlay cue: the source is the thing whose audio carries meaning, and cues
 * belong to the moments that fire them. This is the layer underneath both.
 */
export const specMusic = z.object({
  src: z.string(),
  /**
   * 0..1 linear gain. Measure, do not guess: `ffmpeg -i track -af ebur128`
   * gives the bed's integrated loudness, the same on the speech, and the gain
   * is the difference you want minus the difference you have.
   */
  volume: z.number().min(0).max(1).default(MUSIC_BED_DEFAULT_VOLUME),
  /** Restart the track when it is shorter than the composition. */
  loop: z.boolean().default(false),
  /** Seconds to skip at the head of the track, e.g. past an intro. */
  trimStartSec: z.number().min(0).default(0),
  /** Fade up from silence, so the bed arrives instead of cutting in. */
  fadeInSec: z.number().min(0).max(10).default(1),
  /** Fade to silence before the last frame. */
  fadeOutSec: z.number().min(0).max(10).default(1.5),
});
export type SpecMusic = z.infer<typeof specMusic>;

export const editSpec = z.object({
  version: z.literal(1),
  format: format.default("vertical"),
  fps: z.number().int().min(1).max(120).default(30),
  durationSec: z.number().positive(),
  source: specSource,
  /** Scene-scope camera: source and every overlay move as one composed shot. */
  camera: sceneCamera.optional(),
  sound: soundConfig.partial().optional(), // default for every overlay's cues
  /** Music bed under the whole composition; always quieter than the speech. */
  music: specMusic.optional(),
  overlays: z.array(overlay).min(1),
});
export type EditSpec = z.infer<typeof editSpec>;

export const gradientFill = z.object({
  from: z.string(),
  to: z.string(),
  angle: z.number(),
});
export type GradientFill = z.infer<typeof gradientFill>;

/** Brand theme: the token contract every template consumes. Templates never hardcode style. */
export const brandTheme = z.object({
  name: z.string(),
  colors: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    accent: z.string().optional(),
    onPrimary: z.string(),
    surface: z.string(),
    onSurface: z.string(),
    muted: z.string(),
    background: z.string(),
  }),
  fonts: z.object({
    heading: z.string(),
    body: z.string(),
    /** Optional semantic serif used for marked caption words and editorial accents. */
    serif: z.string().optional(),
  }),
  radius: z.number(), // px at 1080 design width
  logoText: z.string(),
  /** Optional progressive styling. Old solid-color themes remain valid. */
  style: z
    .object({
      backgroundGradient: gradientFill.optional(),
      surfaceGradient: gradientFill.optional(),
      surface: z.enum(["solid", "glass"]).optional(),
      blur: z.number().min(0).max(100).optional(),
      opacity: z.number().min(0).max(1).optional(),
      borderColor: z.string().optional(),
      /** Scales the glass rim's own alphas. 1 keeps the full chrome edge, lower values let it read as a lit edge instead of an outline. */
      borderOpacity: z.number().min(0).max(1).optional(),
    })
    .optional(),
});
export type BrandTheme = z.infer<typeof brandTheme>;

// Spec validation with template cross-checks lives in src/spec/validate.ts
// (validateSpec / parseSpec); this module stays registry-free.
