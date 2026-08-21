import type { CaptionAppearance } from "./schema";

export type CaptionAppearanceState = {
  opacity: number;
  translateY: number;
  scale: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;

/** Pure, frame-independent appearance resolver for cue and per-word animation. */
export const captionAppearanceAt = ({
  mode,
  nowSec,
  startSec,
  durationSec,
  distance,
}: {
  mode: CaptionAppearance["mode"];
  nowSec: number;
  startSec: number;
  durationSec: number;
  distance: number;
}): CaptionAppearanceState => {
  if (mode === "instant") return { opacity: 1, translateY: 0, scale: 1 };

  const linear = clamp01((nowSec - startSec) / Math.max(durationSec, Number.EPSILON));
  const eased = easeOutCubic(linear);
  if (mode === "fade") return { opacity: linear, translateY: 0, scale: 1 };
  if (mode === "pop") {
    return {
      opacity: clamp01(linear * 2),
      translateY: 0,
      scale: 0.82 + eased * 0.18,
    };
  }
  return {
    opacity: linear,
    translateY: (1 - eased) * distance,
    scale: mode === "word-by-word" ? 0.96 + eased * 0.04 : 1,
  };
};
