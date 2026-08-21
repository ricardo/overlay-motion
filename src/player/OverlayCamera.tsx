import type { ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Camera, SceneCameraSpec } from "../spec/types";
import { resolveWindow } from "../spec/time";
import { cameraRestScale, cameraTransform, composeCameraCss } from "./camera";

/**
 * A delayed overlay pull-out holds its opening crop until motion starts.
 * Otherwise the camera would snap from identity to its zoomed first frame.
 */
export const overlayCameraTransformAtFrame = (
  camera: Camera,
  frame: number,
  from: number,
  durationInFrames: number,
  fps: number,
): string => {
  const restScale = cameraRestScale(camera);
  const rest = restScale === 1 ? "none" : `scale(${restScale})`;
  if (frame < from) {
    return camera.preset === "pull-out"
      ? cameraTransform(camera, 0, durationInFrames, fps)
      : rest;
  }
  if (frame >= from + durationInFrames) return rest;
  return cameraTransform(camera, frame - from, durationInFrames, fps);
};

/**
 * One overlay-scope camera track (preset subset of docs/camera-motion-spec.md).
 * Must render inside the overlay's Sequence: frame and duration are
 * window-local. `pull-out` starts zoomed by `amount` and settles to 1, so
 * pairing its `time.start` with the overlay's `appear` gives the post-entrance
 * zoom-out.
 */
const OverlayCameraTrack = ({
  camera,
  children,
}: {
  camera?: Camera;
  children: ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  if (!camera) return <>{children}</>;

  const { from, durationInFrames: dur } = resolveWindow(camera.time, {
    fps,
    totalFrames: durationInFrames,
  });
  const transform = overlayCameraTransformAtFrame(camera, frame, from, dur, fps);
  const focus = camera.focus ?? { x: 50, y: 50 };

  // Fills the region box and mirrors its flex alignment so templates sized
  // against the region (width: 100%) keep their layout under the transform.
  // Compositor promotion + grayscale AA + geometric glyph placement stop text
  // shimmer while the scale animates (docs/recipe-scaled-text.md); final
  // renders still need --scale=2 + lanczos downscale.
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "inherit",
        alignItems: "inherit",
        transform: composeCameraCss(transform),
        transformOrigin: `${focus.x}% ${focus.y}%`,
        willChange: "transform",
        backfaceVisibility: "hidden",
        WebkitFontSmoothing: "antialiased",
        textRendering: "geometricPrecision",
      }}
    >
      {children}
    </div>
  );
};

/**
 * Overlay-scope camera, one track or a stack of them. Independent tracks nest
 * exactly as they do at scene scope (`SceneCamera`), which is what makes a
 * zoom-out a reusable effect instead of something a template bakes in: layer a
 * `pull-out` settle and a later `pan-right` and neither overwrites the other.
 */
export const OverlayCamera = ({
  camera,
  children,
}: {
  camera?: SceneCameraSpec;
  children: ReactNode;
}) => {
  if (!camera) return <>{children}</>;
  const tracks = Array.isArray(camera) ? camera : [camera];
  return (
    <>
      {tracks.reduceRight<ReactNode>(
        (content, track, index) => (
          <OverlayCameraTrack key={index} camera={track}>
            {content}
          </OverlayCameraTrack>
        ),
        children,
      )}
    </>
  );
};
