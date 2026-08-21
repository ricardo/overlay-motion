import { useVideoConfig } from "remotion";

/**
 * Templates use a 1080px design edge. Scaling from width alone makes every
 * fixed token 1.78x larger in 16:9, which can push otherwise valid cards past
 * the top and bottom of the composition. The short edge keeps typography,
 * padding and fixed-size surfaces inside every supported aspect ratio while
 * percentage-based layout can still use the full frame.
 */
export const compositionRemScale = (width: number, height: number) =>
  Math.min(width, height) / 1080;

export const useRem = () => {
  const { width, height } = useVideoConfig();
  const k = compositionRemScale(width, height);
  return (px: number) => px * k;
};

/** Explicit semantic alias retained for compact/corner template variants. */
export const useShortEdgeRem = useRem;
