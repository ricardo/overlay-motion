import type { ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { ObjectMotion, OverlayMotionSpec } from "../spec/types";
import { resolveWindow } from "../spec/time";
import { composeCameraCss } from "./camera";
import { useRem } from "./scale";
import { SHAKE_PERSPECTIVE, shakeTransform } from "./shake";

/**
 * One object-motion track. Renders inside the overlay's Sequence, so
 * `useCurrentFrame` is already window-local; subtracting the track's own
 * `time.start` makes the ramp start when the MOTION starts, not when the
 * overlay did.
 */
const OverlayMotionTrack = ({
  motion,
  children,
}: {
  motion: ObjectMotion;
  children: ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const rem = useRem();

  const { from, durationInFrames: dur } = resolveWindow(motion.time, {
    fps,
    totalFrames: durationInFrames,
  });
  const active = frame >= from && frame < from + dur;
  const transform = active
    ? shakeTransform((frame - from) / fps, { ...motion, windowSec: dur / fps })
    : "none";

  const perspective = SHAKE_PERSPECTIVE[motion.style === "none" ? "shake" : motion.style];
  const is3d = motion.style !== "none" && perspective !== null;

  // `perspective()` INSIDE the transform, never the `perspective` CSS property.
  // The property applies to an element's CHILDREN, so setting it here alongside
  // the rotation would leave this element's own rotateY unprojected: the card
  // would squash horizontally like a closing blind instead of keystoning, near
  // edge and far edge exactly the same height. It must also come first in the
  // list, because it only projects the functions that follow it.
  //
  // Scaled through `rem` so the projection is identical at 1080p and 4K, like
  // every other fixed length here, and only on styles that leave the plane: a
  // 3D context on a flat style costs a compositor layer and softens text for
  // no visual gain.
  const projected =
    is3d && transform !== "none"
      ? `perspective(${rem(perspective as number)}px) ${transform}`
      : transform;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "inherit",
        alignItems: "inherit",
        // Fills the region box and mirrors its flex alignment, so templates
        // sized against the region keep their layout under the transform, and
        // percentages resolve against the REGION: that is what makes one
        // `amount` mean the same thing on every template.
        transform: composeCameraCss(projected),
        transformOrigin: "center center",
        willChange: "transform",
        backfaceVisibility: "hidden",
        // A turned card is resampled, so text needs the same treatment an
        // animated scale needs (docs/recipe-scaled-text.md).
        ...(is3d
          ? { WebkitFontSmoothing: "antialiased" as const, textRendering: "geometricPrecision" as const }
          : {}),
      }}
    >
      {children}
    </div>
  );
};

/**
 * Overlay-scope OBJECT motion (`overlay.motion`): moves the ELEMENT, never a
 * viewport, so nothing is cropped and nothing is zoomed (`src/player/shake.ts`
 * explains why that distinction is not cosmetic).
 *
 * A layer of its own rather than a prop inside any template, and that is the
 * whole point: `OverlayTransform` (scale/enter/exit), `OverlayCamera` (region
 * viewport) and this one are nested DOM nodes, so a card can pull out and turn
 * through depth in the same window. Concatenating the transforms into one
 * string instead would make every new effect fight the last one, which is also
 * why stacked motions nest rather than being summed.
 */
export const OverlayMotion = ({
  motion,
  children,
}: {
  motion?: OverlayMotionSpec;
  children: ReactNode;
}) => {
  if (!motion) return <>{children}</>;
  const tracks = Array.isArray(motion) ? motion : [motion];
  return (
    <>
      {tracks.reduceRight<ReactNode>(
        (content, track, index) => (
          <OverlayMotionTrack key={index} motion={track}>
            {content}
          </OverlayMotionTrack>
        ),
        children,
      )}
    </>
  );
};
