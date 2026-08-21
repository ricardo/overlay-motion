import type { RectPct, SourceReframe } from "../spec/types";
import { resolveWindow } from "../spec/time";

export type SourceLayout = {
  region: RectPct;
  fit: "cover" | "contain";
  position: string;
};

const FULL_FRAME: RectPct = { x: 0, y: 0, w: 100, h: 100 };
const smoothstep = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

/**
 * Resolves base-footage layout at one composition frame. Reframes are
 * composition-relative. Region eases from/to fullscreen; crop focus switches
 * to the inspected target immediately so the protected subject never drifts
 * out while the box is moving.
 */
export const sourceLayoutAtFrame = ({
  frame,
  fps,
  totalFrames,
  defaultFit,
  defaultPosition,
  reframes = [],
}: {
  frame: number;
  fps: number;
  totalFrames: number;
  defaultFit: "cover" | "contain";
  defaultPosition: string;
  reframes?: SourceReframe[];
}): SourceLayout => {
  const active = reframes
    .map((reframe) => ({ reframe, ...resolveWindow(reframe.time, { fps, totalFrames }) }))
    .find(({ from, durationInFrames }) => frame >= from && frame < from + durationInFrames);

  if (!active) {
    return { region: FULL_FRAME, fit: defaultFit, position: defaultPosition };
  }

  const { reframe, from, durationInFrames } = active;
  const transitionFrames = Math.min(
    Math.round((reframe.transitionSec ?? 0.3) * fps),
    Math.floor(durationInFrames / 2),
  );
  const localFrame = frame - from;
  const enter = transitionFrames === 0 ? 1 : localFrame / transitionFrames;
  const exit =
    transitionFrames === 0 ? 1 : (durationInFrames - 1 - localFrame) / transitionFrames;
  const progress = smoothstep(Math.min(enter, exit));

  return {
    region: {
      x: mix(FULL_FRAME.x, reframe.region.x, progress),
      y: mix(FULL_FRAME.y, reframe.region.y, progress),
      w: mix(FULL_FRAME.w, reframe.region.w, progress),
      h: mix(FULL_FRAME.h, reframe.region.h, progress),
    },
    fit: reframe.fit ?? defaultFit,
    position: reframe.position ?? defaultPosition,
  };
};
