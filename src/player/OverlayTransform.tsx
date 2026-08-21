import type { ReactNode } from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Sfx } from "../sound/Sfx";
import { useRem } from "./scale";

const EXIT_SEC = 0.9;
const ENTER_SEC = 0.6;

type EnterStyle = "slide-left" | "slide-right" | "spring" | "mask";
type ExitStyle = "blur-out" | "fade-down" | "shrink" | "vanish";

/**
 * Exit length per style. "vanish" is a disappearance, not a departure: at 0.9s
 * a scale-to-nothing reads as a slow deflate, so it runs in half the time.
 */
export const exitSeconds = (exit: ExitStyle | undefined): number =>
  exit === "vanish" ? 0.45 : EXIT_SEC;

/**
 * Region-level sizing plus the canonical enter/exit choreography. Keeping
 * these outside templates means fixed-size and fluid cards obey the same
 * scale and the same motion language: enters are "slide-left",
 * "slide-right", "spring" and "mask"; exits are "blur-out" (blur + lift),
 * "fade-down" (fade + downward drift) and "shrink" (scale away). Unset
 * enter/exit leaves the template's native motion alone.
 */
export const OverlayTransform = ({
  scale = 1,
  enter,
  exit,
  children,
}: {
  scale?: number;
  enter?: EnterStyle;
  exit?: ExitStyle;
  children: ReactNode;
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const rem = useRem();

  const exitFrames = Math.round(exitSeconds(exit) * fps);
  const canExit = Boolean(exit) && durationInFrames > exitFrames * 2;
  const exitT = canExit
    ? interpolate(
        frame,
        [durationInFrames - exitFrames, durationInFrames - 1],
        [0, 1],
        {
          easing: Easing.in(Easing.quad),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        },
      )
    : 0;

  const enterFrames = Math.round(ENTER_SEC * fps);
  const canEnter = Boolean(enter) && durationInFrames > enterFrames;
  const enterT = canEnter
    ? enter === "spring"
      ? spring({ frame, fps, config: { damping: 14, mass: 0.9 } })
      : interpolate(frame, [0, enterFrames], [0, 1], {
          easing: Easing.out(Easing.cubic),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
    : 1;

  let tx = 0;
  let ty = 0;
  let extraScale = 1;
  let opacity = 1;
  let blur = 0;
  let clipPath: string | undefined;

  if (canEnter) {
    const remaining = 1 - enterT;
    if (enter === "slide-left") tx -= remaining * rem(220);
    if (enter === "slide-right") tx += remaining * rem(220);
    if (enter === "spring") extraScale *= 0.82 + 0.18 * enterT;
    if (enter === "mask") clipPath = `inset(0 ${Math.max(0, remaining * 100)}% 0 0)`;
    if (enter !== "mask") opacity *= Math.min(1, enterT * 2);
  }

  if (exitT > 0 && exit === "vanish") {
    // Anticipation then collapse: the element swells a touch, then implodes.
    // Opacity trails the scale (quadratic) so the eye reads "it was pulled
    // away", not "it faded out while shrinking".
    const anticipate = Math.min(exitT / 0.28, 1);
    const collapse = Math.max(0, (exitT - 0.28) / 0.72);
    extraScale *= (1 + 0.1 * anticipate) * (1 - 0.92 * collapse);
    blur = collapse * rem(18);
    opacity *= 1 - collapse * collapse;
  } else if (exitT > 0) {
    opacity *= 1 - exitT;
    if (exit === "blur-out") {
      ty -= exitT * rem(120);
      extraScale *= 1 - exitT * 0.04;
      blur = exitT * rem(26);
    }
    if (exit === "fade-down") ty += exitT * rem(60);
    if (exit === "shrink") extraScale *= 1 - exitT * 0.25;
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        justifyContent: "inherit",
        alignItems: "inherit",
        opacity,
        transform: `translate(${tx}px, ${ty}px) scale(${scale * extraScale}) translateZ(0)`,
        transformOrigin: "center center",
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        clipPath,
        willChange: "transform, filter, opacity",
        backfaceVisibility: "hidden",
      }}
    >
      {canExit && exit === "blur-out" ? (
        <Sfx cue="swoop" at={durationInFrames - exitFrames} volume={0.35} />
      ) : null}
      {canExit && exit === "vanish" ? (
        <Sfx cue="pop" at={durationInFrames - exitFrames} volume={0.45} />
      ) : null}
      {children}
    </div>
  );
};
