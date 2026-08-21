import { z } from "zod/v3";
import { templateSfx } from "../../sound/config";

/**
 * One sample per frame: `[x, y, size]`, all normalized to the frame with a
 * top-left origin. `size` is the face box height, which is what sets how tight
 * the bubble crops; a track that carries only a center forces the template to
 * guess a zoom and the subject breathes as they lean in.
 *
 * Produced by `scripts/face-track.swift`. Tracking is preprocessing, so the
 * track arrives as data and the bubble is the rendering decision.
 */
export const faceTrackPoint = z
  .array(z.number())
  .length(3)
  .describe("[x, y, size] normalized to the frame, top-left origin");

export const faceTrackSchema = z.object({
  timebase: z
    .enum(["composition", "overlay"])
    .default("overlay")
    .describe("Whether sample 0 is the composition's first frame or this overlay's"),
  points: z.array(faceTrackPoint).min(1),
});
export type FaceTrack = z.infer<typeof faceTrackSchema>;

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  .describe("Literal #rgb or #rrggbb");

/**
 * What fills the frame once the footage has stepped aside. A color is the
 * plain case; `media` is the screen recording, demo capture or b-roll the
 * talk is actually about.
 *
 * This is a prop, not a second spec source, and that is the rule rather than a
 * convenience: Edit Spec v1 has exactly one base source, the speaker, and it
 * is the one whose audio survives to delivery. Everything else behind them
 * travels in props.
 */
export const bubbleBackdropMedia = z.object({
  src: z.string().min(1),
  kind: z.enum(["video", "image"]).optional().describe("Inferred from the extension when omitted"),
  fit: z.enum(["cover", "contain"]).default("cover"),
  /** CSS object-position, e.g. "center 20%", to keep the important part visible. */
  position: z.string().optional(),
  muted: z.boolean().default(true).describe("The speaker's audio is the point; this is scenery"),
  /**
   * Restart the plate every N seconds. The caller supplies the length because
   * the renderer cannot probe media while rendering a frame; without it a
   * plate shorter than the talk freezes on its last frame.
   */
  loopSec: z.number().positive().optional(),
  /** 0..1 darkening, so the bubble stays the subject of its own frame. */
  dim: z.number().min(0).max(1).default(0),
});

export const bubbleBackdrop = z.union([
  hexColor,
  z.object({
    color: hexColor.optional().describe("Fill under the media, and the whole backdrop without it"),
    media: bubbleBackdropMedia.optional(),
  }),
]);
export type BubbleBackdrop = z.infer<typeof bubbleBackdrop>;

/**
 * Aperture corner rounding. `"circle"` and `"square"` are the two ends;
 * `{ radiusPct }` is anything between, as a percentage of the aperture side,
 * so 50 is the circle and 0 is the square.
 */
export const bubbleShape = z.union([
  z.enum(["circle", "square"]),
  z.object({ radiusPct: z.number().min(0).max(50) }),
]);
export type BubbleShape = z.infer<typeof bubbleShape>;

export const bubbleShapeRadiusPct = (shape: BubbleShape): number =>
  shape === "circle" ? 50 : shape === "square" ? 0 : shape.radiusPct;

export const faceBubbleSchema = z.object({
  track: faceTrackSchema,
  shape: bubbleShape.default("circle"),
  corner: z
    .enum(["bottom-right", "bottom-left", "top-right", "top-left"])
    .default("bottom-right"),
  /** Bubble diameter as a percentage of frame WIDTH, so it reads the same in any format. */
  sizePct: z.number().min(8).max(70).default(30),
  /** Distance from the frame edges, percentage of frame width. */
  marginPct: z.number().min(0).max(25).default(5),
  /**
   * Crop side as a multiple of the tracked face height. Below ~1.5 the circle
   * cuts the chin and forehead on a head turn; above ~2.5 the face stops being
   * the subject of its own bubble.
   */
  headroom: z.number().min(1).max(4).default(1.9),
  /**
   * Seconds spent travelling from full frame to the corner bubble. `0`, the
   * default, cuts straight to the bubble: the overlay's first frame is already
   * the corner circle, with no full-frame flash before it. Raise it when the
   * collapse itself is the point, such as handing over from a full-frame shot
   * mid-take.
   */
  enterSec: z.number().min(0).max(4).default(0),
  /**
   * Revealed as the footage shrinks. A hex string is shorthand for
   * `{ color }`. Defaults to the theme background.
   */
  backdrop: bubbleBackdrop.optional(),
  ring: z
    .object({
      widthPx: z.number().min(0).max(40).default(0),
      color: z.string().default("#FFFFFF"),
    })
    .optional(),
  shadow: z.boolean().default(true),
  sfx: templateSfx
    .default(false)
    .describe("Silent by default: this is a scene change, not an object arriving."),
});
export type FaceBubbleProps = z.infer<typeof faceBubbleSchema>;
