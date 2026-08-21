/**
 * Bubble geometry: one interpolation from "the whole frame at scale 1" to "a
 * circular crop of the tracked face in a corner". Kept out of the component so
 * the two properties that matter are testable without a renderer:
 *
 * 1. at progress 0 the result is the untouched frame, which is what lets a
 *    spec hand over from the base source layer mid-shot with nothing to see;
 * 2. the crop never leaves the source, so the bubble is never part backdrop.
 */

export type BubbleInput = {
  /** Composition size in px. */
  width: number;
  height: number;
  /** Tracked face: center and box height, normalized, top-left origin. */
  faceX: number;
  faceY: number;
  faceSize: number;
  /** 0 = full frame, 1 = settled bubble. */
  progress: number;
  /** Bubble diameter as a percentage of width. */
  sizePct: number;
  /** Edge distance as a percentage of width. */
  marginPct: number;
  /** Crop side as a multiple of the face box height. */
  headroom: number;
  corner: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /** Settled aperture rounding: 50 is a circle, 0 a square. */
  radiusPct: number;
};

export type BubbleGeometry = {
  windowX: number;
  windowY: number;
  windowW: number;
  windowH: number;
  radiusPct: number;
  planeX: number;
  planeY: number;
  planeW: number;
  planeH: number;
  /** Source-space side of the visible crop once settled, after cap and clamp. */
  cropSide: number;
};

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

export const bubbleGeometry = (input: BubbleInput): BubbleGeometry => {
  const { width, height, progress: p } = input;
  const diameter = (input.sizePct / 100) * width;
  const margin = (input.marginPct / 100) * width;
  const toRight = input.corner.endsWith("right");
  const toBottom = input.corner.startsWith("bottom");

  const windowW = lerp(width, diameter, p);
  const windowH = lerp(height, diameter, p);
  const windowX = lerp(0, toRight ? width - margin - diameter : margin, p);
  const windowY = lerp(0, toBottom ? height - margin - diameter : margin, p);

  // Cap: a close subject in a portrait frame asks for a crop wider than the
  // frame. Clamp: an off-center subject asks for one that starts past an edge.
  // Either way the shortfall would render as backdrop inside the circle.
  const cropSide = Math.min(
    Math.max(input.faceSize * height * input.headroom, 1),
    width,
    height,
  );
  const half = cropSide / 2;
  const anchorX = lerp(0.5, clamp(input.faceX * width, half, width - half) / width, p);
  const anchorY = lerp(0.5, clamp(input.faceY * height, half, height - half) / height, p);

  const scale = lerp(1, diameter / cropSide, p);
  const planeW = width * scale;
  const planeH = height * scale;

  return {
    windowX,
    windowY,
    windowW,
    windowH,
    // Rounding grows with the move: the full frame has square corners, so a
    // bubble that is round at rest has to arrive there rather than start there.
    radiusPct: lerp(0, input.radiusPct, p),
    planeX: windowW / 2 - anchorX * planeW,
    planeY: windowH / 2 - anchorY * planeH,
    planeW,
    planeH,
    cropSide,
  };
};
