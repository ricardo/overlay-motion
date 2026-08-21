import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  Easing,
  Img,
  interpolate,
  Loop,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useBrand } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { useOverlayTiming } from "../../player/motion";
import { resolveSrc } from "../../player/resolve-src";
import type { TemplateDef } from "../types";
import { bubbleGeometry } from "./geometry";
import { bubbleShapeRadiusPct, faceBubbleSchema } from "./schema";

/**
 * The base footage sits in a circular talking-head bubble in a corner, the
 * webcam-recorder look, and a face track keeps the speaker centered inside it
 * for the rest of the shot. By default it cuts straight there.
 *
 * `enterSec` buys the collapse from full frame instead, and it is one
 * interpolation of a single window rectangle rather than a crossfade between
 * two shots: the same pixels travel, so there is no moment where the speaker is
 * duplicated or missing. At progress 0 the window is exactly the frame at scale
 * 1, which is what lets the spec hand over from the base source layer mid-shot
 * without a visible seam. That handoff is the only reason to animate the
 * entrance; without a full-frame shot to hand over from, the move is a stall
 * before the talk.
 */
const FaceBubble = (raw: Record<string, unknown> & { children?: ReactNode }) => {
  const p = useMemo(() => faceBubbleSchema.parse(raw), [raw]);
  const brand = useBrand();
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const timing = useOverlayTiming();

  // The renderer mounts this template `leadFrames` before its window so the
  // video element it holds is warm the moment it is first painted. Those frames
  // are not ours: the base source layer is still the shot, and anything drawn
  // here would sit on top of it.
  const local = frame - timing.leadFrames;
  const inLead = local < 0;

  const sampleIndex =
    p.track.timebase === "composition"
      ? local + timing.startFrame
      : local;
  const point =
    p.track.points[Math.min(Math.max(sampleIndex, 0), p.track.points.length - 1)];
  const [faceX, faceY, faceSize] = point as [number, number, number];

  const enterFrames = Math.round(p.enterSec * fps);
  // A cut has to be a cut. Interpolating over a single frame would still put
  // progress 0, the full frame, on screen before the bubble, which reads as a
  // flash rather than an edit.
  const progress =
    enterFrames <= 0
      ? 1
      : interpolate(local, [0, enterFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          // Symmetric ease: the shrink should not read as a snap at either end.
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        });

  const geometry = bubbleGeometry({
    width,
    height,
    faceX,
    faceY,
    faceSize,
    progress,
    sizePct: p.sizePct,
    marginPct: p.marginPct,
    headroom: p.headroom,
    corner: p.corner,
    radiusPct: bubbleShapeRadiusPct(p.shape),
  });
  const { windowX, windowY, windowW, windowH, planeX, planeY, planeW, planeH } = geometry;

  const ringWidth = p.ring?.widthPx ?? 0;
  const backdrop = typeof p.backdrop === "string" ? { color: p.backdrop } : p.backdrop;
  const backdropColor = backdrop?.color;
  const backdropMedia = backdrop && "media" in backdrop ? backdrop.media : undefined;
  const backdropKind =
    backdropMedia?.kind ??
    (backdropMedia && /\.(png|jpe?g|webp|gif|avif)$/i.test(backdropMedia.src)
      ? "image"
      : "video");

  // During the lead the children still render, invisible: unmounting them is
  // the very thing that would leave a cold video element behind.
  if (inLead) {
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: 0 }}>
        {raw.children}
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {/* `at` is the overlay start, not the Sequence start: the lead is not ours. */}
      <PropSfx sfx={p.sfx} at={timing.leadFrames} volume={0.3} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: backdropColor ?? brand.colors.background,
        }}
      />
      {backdropMedia ? (
        // Full opacity from the overlay's first frame. A ramp was tried here so
        // the gap the collapse opens at the top edge would show flat backdrop
        // instead of the plate's first pixels; it was rejected on sight. The
        // plate is either behind the shot or it is not, and fading it in reads
        // as the plate arriving late rather than as the speaker stepping aside.
        <div style={{ position: "absolute", inset: 0 }}>
          {backdropKind === "video" ? (
            <Loop
              durationInFrames={
                backdropMedia.loopSec
                  ? Math.max(1, Math.round(backdropMedia.loopSec * fps))
                  : Number.MAX_SAFE_INTEGER
              }
              layout="none"
            >
              <OffthreadVideo
                src={resolveSrc(backdropMedia.src)}
                muted={backdropMedia.muted}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: backdropMedia.fit,
                  objectPosition: backdropMedia.position,
                }}
              />
            </Loop>
          ) : (
            <Img
              src={resolveSrc(backdropMedia.src)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: backdropMedia.fit,
                objectPosition: backdropMedia.position,
              }}
            />
          )}
          {backdropMedia.dim > 0 ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: `rgba(0,0,0,${backdropMedia.dim})`,
              }}
            />
          ) : null}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: windowX,
          top: windowY,
          width: windowW,
          height: windowH,
          // Square at progress 1, so 50% is a circle rather than an ellipse.
          borderRadius: `${geometry.radiusPct}%`,
          overflow: "hidden",
          boxShadow:
            p.shadow && progress > 0
              ? `0 ${0.02 * height * progress}px ${0.05 * height * progress}px rgba(0,0,0,${0.45 * progress})`
              : undefined,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: planeX,
            top: planeY,
            width: planeW,
            height: planeH,
          }}
        >
          {raw.children}
        </div>
      </div>
      {ringWidth > 0 && progress > 0 ? (
        <div
          style={{
            position: "absolute",
            left: windowX,
            top: windowY,
            width: windowW,
            height: windowH,
            borderRadius: `${geometry.radiusPct}%`,
            // Drawn as a sibling so the ring is not clipped by the same
            // overflow that makes the aperture.
            boxShadow: `inset 0 0 0 ${ringWidth * progress}px ${p.ring?.color ?? "#FFFFFF"}`,
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
};

export const faceBubbleDef: TemplateDef = {
  slug: "face-bubble",
  title: "Face Bubble",
  tier: "free",
  category: "Social",
  description:
    "Put the footage in a circular talking-head bubble in a corner, the webcam-recorder look, with a face track keeping the speaker centered inside it. It cuts straight to the bubble; set enterSec when you want it to collapse in from full frame instead, handing over mid-shot to whatever the video is about.",
  sourceContract: "wraps-video",
  // Geometry is computed against the composition, so the aperture must start
  // as the whole frame.
  regions: ["fullscreen"],
  schema: faceBubbleSchema,
  demoProps: {
    track: {
      timebase: "overlay",
      points: Array.from({ length: 180 }, (_, i) => [
        0.5 + 0.05 * Math.sin(i / 26),
        0.46 + 0.03 * Math.cos(i / 31),
        0.3,
      ]),
    },
    corner: "bottom-right",
    sizePct: 30,
    ring: { widthPx: 6, color: "#FFFFFF" },
  },
  demoDurationSec: 6,
  component: FaceBubble,
};
