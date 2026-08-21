import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { Camera, SceneCameraSpec } from "../spec/types";
import { resolveWindow } from "../spec/time";
import { cameraRestScale, cameraTransform, composeCameraCss } from "./camera";

/**
 * Scene-scope camera (`spec.camera`, docs/camera-motion-spec.md): source and
 * every overlay move as one composed shot. Handheld here is the classic
 * "someone is holding the phone" feel over the whole edit; overlays shake
 * with the footage instead of floating detached from it.
 */
const SceneCameraTrack = ({
  camera,
  children,
}: {
  camera: Camera;
  children: ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { from, durationInFrames: dur } = resolveWindow(camera.time, {
    fps,
    totalFrames: durationInFrames,
  });
  const active = frame >= from && frame < from + dur;
  // Outside the window the camera sits at its resting zoom, which is identity
  // unless `rest` says otherwise. Never the string "none" when a rest exists:
  // that is what made "settle into a slight push and stay there" impossible.
  const restScale = cameraRestScale(camera);
  const transform = active
    ? cameraTransform(camera, frame - from, dur, fps)
    : restScale === 1
      ? "none"
      : `scale(${restScale})`;
  const focus = camera.focus ?? { x: 50, y: 50 };

  return (
    <AbsoluteFill
      style={{
        transform: composeCameraCss(transform),
        transformOrigin: `${focus.x}% ${focus.y}%`,
        willChange: "transform",
        backfaceVisibility: "hidden",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Independent scene tracks nest, allowing separate non-overlapping moves. */
export const SceneCamera = ({
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
          <SceneCameraTrack key={index} camera={track}>
            {content}
          </SceneCameraTrack>
        ),
        children,
      )}
    </>
  );
};
