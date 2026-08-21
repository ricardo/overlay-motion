import { Easing } from "remotion";
import type { Camera, CameraEasing, CameraPreset } from "../spec/types";

export const CAMERA_EASINGS: Record<CameraEasing, (t: number) => number> = {
  linear: Easing.linear,
  "ease-in": Easing.in(Easing.quad),
  "ease-out": Easing.out(Easing.quad),
  "ease-in-out": Easing.inOut(Easing.quad),
};

/**
 * Second-exact phase fractions of a camera window, derived from `inSec` /
 * `outSec`. When present the caller passes RAW window progress (no global
 * easing) so a phase's seconds stay seconds; each phase eases internally
 * with smootherstep.
 */
export type CameraPhases = { inFrac?: number; outFrac?: number };

const smootherstep = (p: number) => p * p * p * (p * (p * 6 - 15) + 10);

/** Zoom presets scale; pans translate. Only the first kind can have a resting zoom. */
export const CAMERA_ZOOM_PRESETS = [
  "push-in",
  "push-in-out",
  "push-in-fast-out",
  "pull-out",
] as const;

export const cameraPresetZooms = (
  preset: CameraPreset,
): preset is (typeof CAMERA_ZOOM_PRESETS)[number] =>
  (CAMERA_ZOOM_PRESETS as readonly CameraPreset[]).includes(preset);

/**
 * The scale a zoom camera sits at when it is not moving. `rest` is where the
 * move settles and where every frame outside the window sits, so a camera that
 * opens tight and stays slightly pushed in is one window instead of two
 * meeting at a step.
 */
export const cameraRestScale = (camera: Pick<Camera, "preset" | "rest">): number =>
  cameraPresetZooms(camera.preset) ? 1 + camera.rest : 1;

/**
 * `zoomT` is each preset's own 0..1 shape; the scale it becomes is the caller's
 * business, because that mapping is where `rest` lives.
 */
const zoomScale = (amount: number, rest: number, zoomT: number) =>
  1 + rest + (amount - rest) * Math.max(0, Math.min(1, zoomT));

/** Directional presets: `t` is the eased 0..1 progress through the camera window. */
export const presetTransform = (
  preset: Exclude<CameraPreset, "handheld">,
  amount: number,
  t: number,
  phases?: CameraPhases,
  rest = 0
): string => {
  switch (preset) {
    case "push-in": {
      if (phases?.inFrac !== undefined) {
        // Arrive within inSec, then hold the framing to the window end.
        const zoomT = t < phases.inFrac ? smootherstep(t / phases.inFrac) : 1;
        return `scale(${zoomScale(amount, rest, zoomT)})`;
      }
      return `scale(${zoomScale(amount, rest, t)})`;
    }
    case "push-in-out": {
      // Editorial focus move: approach, briefly hold, then restore framing.
      // Returning inside the same window prevents the following scene from
      // inheriting a zoom or snapping back on a cut.
      const inEnd = phases?.inFrac ?? 0.68;
      const outStart = 1 - (phases?.outFrac ?? 0.2);
      const zoomT =
        t < inEnd
          ? phases
            ? smootherstep(t / inEnd)
            : t / inEnd
          : t < outStart
            ? 1
            : phases
              ? 1 - smootherstep((t - outStart) / (1 - outStart))
              : 1 - (t - outStart) / (1 - outStart);
      return `scale(${zoomScale(amount, rest, zoomT)})`;
    }
    case "push-in-fast-out": {
      // Editorial punch-in: arrive quickly, hold the reframed shot long enough
      // to read, then return quickly before the window closes. Smootherstep's
      // zero velocity and acceleration at both ends prevents a full-frame
      // camera move from reading as a dropped-frame snap.
      const inEnd = phases?.inFrac ?? 0.15;
      const outStart = 1 - (phases?.outFrac ?? 0.15);
      let zoomT: number;
      if (t < inEnd) {
        zoomT = smootherstep(t / inEnd);
      } else if (t < outStart) {
        zoomT = 1;
      } else {
        zoomT = 1 - smootherstep((t - outStart) / (1 - outStart));
      }
      return `scale(${zoomScale(amount, rest, zoomT)})`;
    }
    case "pull-out": {
      if (phases?.outFrac !== undefined) {
        // Return over the first outSec, then hold `rest` (identity by default).
        const zoomT = t < phases.outFrac ? 1 - smootherstep(t / phases.outFrac) : 0;
        return `scale(${zoomScale(amount, rest, zoomT)})`;
      }
      return `scale(${zoomScale(amount, rest, 1 - t)})`;
    }
    case "pan-left":
      return `translateX(${-amount * 100 * t}%)`;
    case "pan-right":
      return `translateX(${amount * 100 * t}%)`;
    case "pan-up":
      return `translateY(${-amount * 100 * t}%)`;
    case "pan-down":
      return `translateY(${amount * 100 * t}%)`;
  }
};

const TAU = Math.PI * 2;
const wave = (tSec: number, frequency: number, phase: number) =>
  Math.sin(TAU * (tSec * frequency + phase));

/**
 * Handheld: layered sine drift on position plus a slow zoom breath and a
 * slight roll. Deterministic (same second, same seed, same transform), so
 * browser preview and server render match. The 5x-`amount` base zoom keeps
 * the drift and roll from exposing frame edges. `tSec` is seconds inside the
 * camera window; easing does not apply, the wobble runs the whole window.
 */
export const handheldTransform = (
  tSec: number,
  camera: Pick<Camera, "amount" | "frequency" | "seed">
): string => {
  const { amount, frequency, seed } = camera;
  const zoom =
    1 + amount * 5 + wave(tSec, frequency * 0.14, seed * 0.17 + 0.2) * amount * 0.6;
  const x =
    (wave(tSec, frequency * 0.19, seed * 0.31) +
      0.45 * wave(tSec, frequency * 0.43, seed * 0.53 + 0.12)) *
    amount *
    100;
  const y =
    (wave(tSec, frequency * 0.16, seed * 0.41 + 0.35) +
      0.45 * wave(tSec, frequency * 0.37, seed * 0.7)) *
    amount *
    100;
  const roll = wave(tSec, frequency * 0.17, seed * 0.23 + 0.6) * amount * 28;
  return `translate(${x.toFixed(4)}%, ${y.toFixed(4)}%) rotate(${roll.toFixed(
    4
  )}deg) scale(${zoom.toFixed(5)})`;
};

/**
 * Compose a camera transform with the GPU-promotion hint, always yielding
 * VALID CSS. `"none"` cannot be combined with other transform functions:
 * `transform: "none translateZ(0)"` is invalid, and assigning an invalid
 * value to an element's style leaves the PREVIOUS value in place. In a
 * multi-worker Chromium render each worker then keeps the last zoom it
 * painted inside the camera window for every later frame it renders, and
 * because workers render interleaved frames with different residual zooms,
 * the delivered video pulses at worker-count period for the rest of the
 * timeline. Field-verified: 6-frame-period zoom pulsing after a
 * push-in-fast-out window, gone once inactive frames emit a valid identity.
 */
export const composeCameraCss = (transform: string): string =>
  transform === "none" ? "translateZ(0)" : `${transform} translateZ(0)`;

/** One camera track resolved against its window: local frame in, transform out. */
export const cameraTransform = (
  camera: Camera,
  localFrame: number,
  windowFrames: number,
  fps: number
): string => {
  if (camera.preset === "handheld") {
    const clamped = Math.min(Math.max(localFrame, 0), windowFrames);
    return handheldTransform(clamped / fps, camera);
  }
  const progress = Math.min(Math.max(localFrame / Math.max(windowFrames, 1), 0), 1);
  if (camera.inSec !== undefined || camera.outSec !== undefined) {
    // Second-exact phases: raw progress (seconds stay seconds), phases ease
    // internally with smootherstep instead of the global easing curve.
    const windowSec = Math.max(windowFrames, 1) / fps;
    const phases: CameraPhases = {
      inFrac: camera.inSec !== undefined ? Math.min(camera.inSec / windowSec, 1) : undefined,
      outFrac: camera.outSec !== undefined ? Math.min(camera.outSec / windowSec, 1) : undefined,
    };
    return presetTransform(camera.preset, camera.amount, progress, phases, camera.rest);
  }
  return presetTransform(
    camera.preset,
    camera.amount,
    CAMERA_EASINGS[camera.easing](progress),
    undefined,
    camera.rest,
  );
};
