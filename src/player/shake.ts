/**
 * OBJECT motion, the counterpart of the `handheld` CAMERA preset. Four styles:
 * `shake` (a hand holding it), `wobble` (a rock), `float` (a bob) and
 * `sway-3d` (a slow turn through depth). One engine, because they differ only
 * in which channels their octave stack drives.
 *
 * `camera.preset: "handheld"` moves a region's VIEWPORT, so it must zoom in
 * (5x amount) to keep the drift from exposing frame edges. That is wrong for a
 * cutout sticker: a transparent PNG has no edges to protect, and the zoom
 * changes how big the object reads. Shake moves the ELEMENT itself, so nothing
 * is cropped and nothing is zoomed.
 *
 * Deterministic by construction (layered sines of the window-local second,
 * offset by `seed`): the browser preview and every render worker compute the
 * same transform for the same frame. No randomness, no per-worker state.
 *
 * The layering is an octave stack (see `SHAKE_OCTAVES`), not a single wave:
 * that is the difference between a sticker that vibrates and one that reads as
 * held in a hand.
 */

export const SHAKE_STYLES = [
  "shake",
  "wobble",
  "float",
  "sway-3d",
  "skew-right",
  "skew-left",
  "skew-up",
  "skew-down",
  "none",
] as const;
export type ShakeStyle = (typeof SHAKE_STYLES)[number];

/**
 * Two families, and the split decides which knobs mean anything.
 *
 * PERIODIC styles oscillate for as long as their window lasts. They are shaped
 * by `frequency`, phase-shifted by `seed`, and faded by `rampSec`/`rampOutSec`,
 * because an endless wave has no natural start or end of its own.
 *
 * ONE-SHOT styles traverse their window exactly once, eased at both ends. The
 * window IS the tempo, so `frequency` and `seed` have nothing to act on, and
 * the ramps are deliberately NOT applied: multiplying a single pass by an
 * envelope that starts and ends at zero would drag both ends back to flat and
 * turn the sweep into a there-and-back.
 */
export const PERIODIC_SHAKE_STYLES = ["shake", "wobble", "float", "sway-3d"] as const;
export type PeriodicShakeStyle = (typeof PERIODIC_SHAKE_STYLES)[number];

export const ONE_SHOT_SHAKE_STYLES = [
  "skew-right",
  "skew-left",
  "skew-up",
  "skew-down",
] as const;
export type OneShotShakeStyle = (typeof ONE_SHOT_SHAKE_STYLES)[number];

export const shakeIsOneShot = (style: ShakeStyle): style is OneShotShakeStyle =>
  (ONE_SHOT_SHAKE_STYLES as readonly ShakeStyle[]).includes(style);

export type ShakeConfig = {
  style: ShakeStyle;
  /** 0..1 intensity. Unset uses the style's own default (`SHAKE_DEFAULT_AMOUNT`). */
  amount?: number;
  /** Cycles per second of the slowest octave. Unset uses the style's tempo. */
  frequency?: number;
  /** Phase offset, so two stickers in one frame never shake in lockstep. */
  seed: number;
  /** Seconds spent ramping the amplitude in, so entry has no first-frame jump. */
  rampSec: number;
  /**
   * Seconds spent ramping the amplitude back out, so the motion settles instead
   * of being cut mid-swing. Needs `windowSec` to know where the end is.
   */
  rampOutSec?: number;
  /** Length of this motion's window in seconds; enables the ramp-out. */
  windowSec?: number;
};

/**
 * Per-style tempo in cycles per second of the SLOWEST (dominant) octave, used
 * when `frequency` is unset.
 *
 * `shake` sits below 1Hz because that is where a held object actually drifts.
 * It used to run at 8.5Hz, which put its detuned harmonic at ~19.5Hz: above
 * the Nyquist limit of a 30fps render, so the sticker aliased into a buzz
 * instead of reading as a hand. The tremor a hand does have now lives in the
 * top octave of `SHAKE_OCTAVES.shake`, at a fraction of the amplitude.
 *
 * These are only the DEFAULTS. Every number here is overridable per element
 * through the `shake` prop (`style`, `amount`, `frequency`, `seed`, `rampSec`).
 */
export const SHAKE_BASE_FREQUENCY: Record<PeriodicShakeStyle, number> = {
  shake: 0.65,
  wobble: 1.6,
  float: 0.5,
  // A turn through depth reads as poise, and poise is slow: one full
  // left-right-left cycle takes just under four seconds.
  "sway-3d": 0.26,
};

/**
 * Which axis a one-shot sweep turns about, and which way it ends up facing.
 * Every style starts at the opposite extreme and passes through flat, so a
 * pair chains without a seam: `skew-right` over the first half of a window and
 * `skew-left` over the second is one continuous move, because the first ends
 * exactly where the second starts.
 *
 * Naming is by the face, not by an edge. CSS `rotateY(+θ)` pushes the RIGHT
 * edge away and brings the left one forward, which aims the card's face to the
 * right: that is `skew-right`. `rotateX(+θ)` brings the bottom edge forward
 * and pushes the top away, aiming the face upward: `skew-up`.
 */
const ONE_SHOT_SWEEP: Record<OneShotShakeStyle, { axis: "y" | "x"; facing: 1 | -1 }> = {
  "skew-right": { axis: "y", facing: 1 },
  "skew-left": { axis: "y", facing: -1 },
  "skew-up": { axis: "x", facing: 1 },
  "skew-down": { axis: "x", facing: -1 },
};

/**
 * Per-style default intensity. One shared number cannot serve both families:
 * 0.2 is "alive but calm" for a hand drift and invisible for a turn through
 * depth, where the whole effect is that you can see the card change facing.
 * Callers still override with `amount`; this is only what you get for free.
 */
export const SHAKE_DEFAULT_AMOUNT: Record<Exclude<ShakeStyle, "none">, number> = {
  shake: 0.2,
  wobble: 0.2,
  float: 0.2,
  "sway-3d": 0.7,
  // Well under the oscillating styles, and deliberately so. A sweep HOLDS its
  // end pose instead of passing through it, so whatever angle it lands on is
  // the angle the viewer reads the card at. 0.175 lands near 10deg: enough
  // perspective to see the card is a plane in space, little enough that a
  // paragraph on it still reads as flat type. The ceilings above stay high so
  // `amount: 1` can still reach a poster-grade turn when that is the point.
  "skew-right": 0.175,
  "skew-left": 0.175,
  "skew-up": 0.175,
  "skew-down": 0.175,
};

/** One layered sine: frequency multiple of the base, weight, phase from seed. */
type Octave = readonly [
  frequencyMultiple: number,
  weight: number,
  seedMultiple: number,
  phaseOffset: number,
];

type OctaveProfile = {
  x: readonly Octave[];
  y: readonly Octave[];
  rotate: readonly Octave[];
  scale: readonly Octave[];
  /** Out-of-plane channels; present only on the 3D styles. */
  rotateY?: readonly Octave[];
  rotateX?: readonly Octave[];
};

/**
 * The octave stack per style. The weight column is the whole design: one wave
 * is a metronome, two are a wobble, and a HAND is broadband. `shake` therefore
 * stacks a slow drift that carries the move, a mid correction that breaks its
 * symmetry, and a fine tremor that keeps the edges alive, each at a fraction of
 * the last, which is what reads as "someone is holding this" rather than
 * "this is vibrating". `wobble` and `float` are single-tempo by intent and keep
 * their original two-wave stacks.
 *
 * Frequency multiples are mutually irrational-ish, so the stack never visibly
 * loops, and the top one stays well under the Nyquist limit of a 30fps render.
 * Per-axis weights sum to 1.5 on x/y and 1 on rotate: that is exactly the bound
 * `shakePeak` promises callers.
 */
const SHAKE_OCTAVES: Record<PeriodicShakeStyle, OctaveProfile> = {
  shake: {
    x: [
      [1, 0.95, 0.31, 0],
      [2.37, 0.45, 1.7, 0.13],
      [3.71, 0.1, 0.94, 0.61],
    ],
    y: [
      [0.83, 0.95, 0.41, 0.2],
      [2.11, 0.45, 1.1, 0.37],
      [3.29, 0.1, 1.43, 0.29],
    ],
    rotate: [
      [0.71, 0.8, 0.77, 0.5],
      [2.29, 0.2, 1.31, 0.11],
    ],
    scale: [[0.43, 1, 0.23, 0.8]],
  },
  wobble: {
    x: [
      [1, 1, 0.31, 0],
      [2.3, 0.5, 1.7, 0.13],
    ],
    y: [
      [0.87, 1, 0.41, 0.2],
      [1.9, 0.5, 1.1, 0.37],
    ],
    rotate: [[0.61, 1, 0.77, 0.5]],
    scale: [[0.5, 1, 0.23, 0.8]],
  },
  float: {
    x: [
      [1, 1, 0.31, 0],
      [2.3, 0.5, 1.7, 0.13],
    ],
    y: [
      [0.87, 1, 0.41, 0.2],
      [1.9, 0.5, 1.1, 0.37],
    ],
    rotate: [[0.61, 1, 0.77, 0.5]],
    scale: [[0.5, 1, 0.23, 0.8]],
  },
  // The turn is the effect, so `rotateY` carries almost all the weight and
  // everything else exists to stop it reading as a mechanism: a slower
  // `rotateX` keeps the card from pivoting on a perfectly level axis, and the
  // small `x` drift follows the turn so the card travels rather than spinning
  // in place. In-plane `rotate` stays at zero, otherwise a 2D roll fights the
  // depth cue and the whole thing reads as a wobble again.
  "sway-3d": {
    x: [
      [1, 1, 0.29, 0],
      [2.17, 0.5, 1.13, 0.41],
    ],
    y: [
      [0.47, 1, 0.53, 0.19],
      [1.31, 0.5, 0.91, 0.63],
    ],
    rotate: [],
    scale: [[0.37, 1, 0.23, 0.8]],
    rotateY: [
      [1, 0.85, 0.29, 0],
      [2.17, 0.15, 1.13, 0.41],
    ],
    rotateX: [[0.61, 1, 0.83, 0.27]],
  },
};

/**
 * Fastest sine a style can put on screen at its default tempo. Sampling theory,
 * not trivia: anything at or above half the render fps aliases, and an aliased
 * sticker looks like a rendering bug rather than motion.
 */
export const shakeTopFrequency = (style: PeriodicShakeStyle): number => {
  const profile = SHAKE_OCTAVES[style];
  const multiples = [
    ...profile.x,
    ...profile.y,
    ...profile.rotate,
    ...profile.scale,
    ...(profile.rotateY ?? []),
    ...(profile.rotateX ?? []),
  ].map(([multiple]) => multiple);
  return SHAKE_BASE_FREQUENCY[style] * Math.max(...multiples);
};

/**
 * Viewing distance for the styles that leave the plane, in 1080px design units
 * (the caller scales it with `useRem`, so the projection is identical at every
 * render resolution). `null` means the style is flat and must NOT be given a
 * perspective: an unnecessary 3D context forces Chromium to rasterize the
 * subtree on its own layer, which costs memory and softens text for nothing.
 *
 * 1400 is deliberately far. Closer values exaggerate the near edge of a card
 * until a modest turn looks like a slammed door.
 */
export const SHAKE_PERSPECTIVE: Record<Exclude<ShakeStyle, "none">, number | null> = {
  shake: null,
  wobble: null,
  float: null,
  "sway-3d": 1400,
  // Half the viewing distance of `sway-3d`, and that is the effect: keystoning
  // comes from how CLOSE the camera is, not only from the angle. At 1400 a
  // turned card reads as a gently tilted rectangle; at 700 the near edge grows
  // and the far edge shrinks until the silhouette is visibly a trapezoid.
  "skew-right": 700,
  "skew-left": 700,
  "skew-up": 700,
  "skew-down": 700,
};

const TAU = Math.PI * 2;
const wave = (tSec: number, frequency: number, phase: number) =>
  Math.sin(TAU * (tSec * frequency + phase));
const smootherstep = (p: number) => p * p * p * (p * (p * 6 - 15) + 10);

/**
 * Amplitude envelope: 0 at the element's first frame, 1 after `rampSec`, and
 * back to 0 over the last `rampOutSec` of a `windowSec`-long window.
 *
 * The ramp-out needs the window length because the motion is an infinite wave
 * with no natural end; without it a card is cut off mid-swing, which reads as
 * a dropped frame. Ramps that overlap (in + out longer than the window) simply
 * damp the peak instead of erroring: a short window should look calm, not
 * broken.
 */
export const shakeEnvelope = (
  tSec: number,
  rampSec: number,
  windowSec?: number,
  rampOutSec = 0,
): number => {
  const rampIn = rampSec <= 0 ? 1 : smootherstep(Math.min(Math.max(tSec / rampSec, 0), 1));
  if (!windowSec || rampOutSec <= 0) return rampIn;
  const remaining = windowSec - tSec;
  const rampOut = smootherstep(Math.min(Math.max(remaining / rampOutSec, 0), 1));
  return rampIn * rampOut;
};

/**
 * Per-style amplitude ceilings, reached at `amount: 1`. Translations are
 * percentages of the element's own box (so a sticker shakes proportionally at
 * any size), rotation is degrees, `scale` is the peak breath.
 */
const AMPLITUDE: Record<
  Exclude<ShakeStyle, "none">,
  { x: number; y: number; rotate: number; scale: number; rotateY: number; rotateX: number }
> = {
  // Wider travel than the old buzz: at ~1Hz the same displacement reads as a
  // slow drift, so the sticker needs more of it to stay visibly alive.
  shake: { x: 7, y: 5, rotate: 5, scale: 0.02, rotateY: 0, rotateX: 0 },
  wobble: { x: 2.5, y: 2, rotate: 9, scale: 0.03, rotateY: 0, rotateX: 0 },
  float: { x: 3, y: 5, rotate: 2.5, scale: 0.015, rotateY: 0, rotateX: 0 },
  // 24deg is the ceiling at `amount: 1`; the 0.7 default lands near 17deg each
  // way, which is a turn you read as a turn. Past roughly 30deg a text card's
  // far edge foreshortens enough that the last words on the line get visibly
  // harder to read, which is the real limit here, not taste.
  "sway-3d": { x: 3, y: 2, rotate: 0, scale: 0.015, rotateY: 24, rotateX: 5 },
  // A single sweep carries far more than an oscillation: the eye follows it
  // once and it never comes back for a second pass, so the pose at each end is
  // a deliberate keystone rather than a tilt. The horizontal-axis pair turns
  // less than the vertical one because foreshortening across LINES of text
  // costs more legibility than foreshortening along them.
  "skew-right": { x: 3, y: 1, rotate: 0, scale: 0.02, rotateY: 55, rotateX: 0 },
  "skew-left": { x: 3, y: 1, rotate: 0, scale: 0.02, rotateY: 55, rotateX: 0 },
  "skew-up": { x: 1, y: 3, rotate: 0, scale: 0.02, rotateY: 0, rotateX: 45 },
  "skew-down": { x: 1, y: 3, rotate: 0, scale: 0.02, rotateY: 0, rotateX: 45 },
};

/**
 * `tSec` is seconds since the element appeared (element-local, not composition
 * time), so the ramp always starts at the entrance. Returns a CSS transform, or
 * `"none"` when the style is off. Callers compose it; never emit `"none"`
 * alongside other functions (see `composeCameraCss`).
 */
/**
 * A one-shot sweep: the element starts turned one way, passes through flat and
 * ends turned the other, once, over `windowSec`.
 *
 * `smootherstep` is doing the work at both ends. Its derivative is zero at 0
 * and 1, so the sweep starts and stops without a velocity step, which is why
 * this family needs no ramp envelope and must not be given one.
 */
const oneShotTransform = (
  tSec: number,
  style: OneShotShakeStyle,
  amount: number,
  windowSec: number | undefined,
): string => {
  const a = AMPLITUDE[style];
  // Without a window a sweep has no span to traverse, so it holds its opening
  // pose rather than guessing. `OverlayMotion` always supplies one.
  const { axis, facing } = ONE_SHOT_SWEEP[style];
  const progress = windowSec && windowSec > 0 ? Math.min(Math.max(tSec / windowSec, 0), 1) : 0;
  const eased = smootherstep(progress);
  // `travel` runs -1 to +1, landing on the pose the style is named for. `arc`
  // runs 0 to 1 to 0: channels riding it swell at the midpoint and return,
  // which is what keeps the pass from reading as a flat slide.
  const travel = facing * (2 * eased - 1);
  const arc = Math.sin(Math.PI * eased);

  // Only the named axis turns. Adding a second rotation would round the sweep
  // into a tumble and destroy the clean trapezoid the pose exists for.
  const rotateY = axis === "y" ? a.rotateY * travel * amount : 0;
  const rotateX = axis === "x" ? a.rotateX * travel * amount : 0;
  // The card travels along the axis it turns about, so the move reads as one
  // gesture; the cross axis only gets the small mid-sweep arc.
  const x = (axis === "y" ? a.x * travel : a.x * arc) * amount;
  const y = (axis === "x" ? a.y * travel : a.y * arc) * amount;
  const scale = 1 + a.scale * arc * amount;

  return `translate(${x.toFixed(4)}%, ${y.toFixed(4)}%) rotateY(${rotateY.toFixed(
    4,
  )}deg) rotateX(${rotateX.toFixed(4)}deg) scale(${scale.toFixed(5)})`;
};

export const shakeTransform = (tSec: number, shake: ShakeConfig): string => {
  if (shake.style === "none") return "none";
  const style = shake.style;
  const amount = shake.amount ?? SHAKE_DEFAULT_AMOUNT[style];
  if (amount <= 0) return "none";
  if (shakeIsOneShot(style)) {
    return oneShotTransform(tSec, style, amount, shake.windowSec);
  }
  const f = shake.frequency ?? SHAKE_BASE_FREQUENCY[style];
  const a = AMPLITUDE[style];
  const gain =
    amount * shakeEnvelope(tSec, shake.rampSec, shake.windowSec, shake.rampOutSec);
  const s = shake.seed;
  const octaves = SHAKE_OCTAVES[style];

  const stack = (layers: readonly Octave[] = []) =>
    layers.reduce(
      (sum, [multiple, weight, seedMultiple, phaseOffset]) =>
        sum + weight * wave(tSec, f * multiple, s * seedMultiple + phaseOffset),
      0,
    );

  const x = stack(octaves.x) * a.x * gain;
  const y = stack(octaves.y) * a.y * gain;
  const scale = 1 + stack(octaves.scale) * a.scale * gain;

  // Two fixed output shapes rather than a variable list of functions: a caller
  // (and a test) can parse either one without guessing which channels a style
  // happened to use, and the browser never has to reinterpret a changing
  // transform list mid-window.
  if (SHAKE_PERSPECTIVE[style] !== null) {
    const rotateY = stack(octaves.rotateY) * a.rotateY * gain;
    const rotateX = stack(octaves.rotateX) * a.rotateX * gain;
    return `translate(${x.toFixed(4)}%, ${y.toFixed(4)}%) rotateY(${rotateY.toFixed(
      4,
    )}deg) rotateX(${rotateX.toFixed(4)}deg) scale(${scale.toFixed(5)})`;
  }

  const rotate = stack(octaves.rotate) * a.rotate * gain;
  return `translate(${x.toFixed(4)}%, ${y.toFixed(4)}%) rotate(${rotate.toFixed(
    4,
  )}deg) scale(${scale.toFixed(5)})`;
};

/** Sum of an axis' octave weights: the most its stack can reach in one frame. */
const stackCeiling = (layers: readonly Octave[]) =>
  layers.reduce((sum, [, weight]) => sum + weight, 0);

/**
 * Peak displacement of a style at full gain; used by tests and layout safety.
 * Derived from the octave weights rather than hardcoded, so retuning a stack
 * can never silently invalidate the bound callers lay out against.
 */
export const shakePeak = (style: Exclude<ShakeStyle, "none">, amount: number) => {
  const a = AMPLITUDE[style];
  // A one-shot channel is driven by a single normalized curve, so its ceiling
  // is the amplitude itself; a periodic one sums its octave weights.
  const ceiling = (channel: keyof OctaveProfile) =>
    shakeIsOneShot(style) ? 1 : stackCeiling(SHAKE_OCTAVES[style][channel] ?? []);
  return {
    x: a.x * ceiling("x") * amount,
    y: a.y * ceiling("y") * amount,
    rotate: a.rotate * ceiling("rotate") * amount,
    rotateY: a.rotateY * ceiling("rotateY") * amount,
    rotateX: a.rotateX * ceiling("rotateX") * amount,
  };
};
