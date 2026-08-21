import { createContext, useContext } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Spec-driven overlay timing (`time.appear` / `time.hold`) and entrance/exit
 * style (`reveal` / `exit`). SpecRenderer provides it per overlay; templates
 * read `appearFrames` to fit their whole entrance choreography inside the
 * requested appear window, `reveal` as the spec's entrance-style hint and
 * `exit` as the exit-style hint (template props may override both). `null`
 * means the spec didn't ask, so the template keeps its own defaults.
 */
export type OverlayTiming = {
  appearFrames: number | null;
  reveal: "typewriter" | "fade-up" | "blur-in" | null;
  exit: "blur-out" | "fade-down" | "shrink" | "vanish" | null;
  /** Absolute composition start and resolved window length for track timebases. */
  startFrame: number;
  durationFrames: number | null;
  /**
   * Frames this overlay's Sequence was mounted BEFORE `startFrame`, so a
   * template that wraps the base footage has a warm video element by the time
   * it is first painted. The renderer only asks for this on `wraps-video`
   * templates; everything else gets 0 and can ignore it.
   *
   * A template that receives a non-zero lead owns those frames: it must draw
   * nothing during them, because the base source layer is still the shot.
   */
  leadFrames: number;
};

const OverlayTimingContext = createContext<OverlayTiming>({
  appearFrames: null,
  reveal: null,
  exit: null,
  startFrame: 0,
  durationFrames: null,
  leadFrames: 0,
});

export const OverlayTimingProvider = OverlayTimingContext.Provider;

export const useOverlayTiming = () => useContext(OverlayTimingContext);

/**
 * Every template owns its motion. This hook gives a shared entrance/exit
 * envelope relative to the overlay's Sequence window, so any template
 * placed with any `time` enters and leaves cleanly.
 */
export const useInOut = (exitSec = 0.35) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const exitFrames = Math.round(exitSec * fps);
  const exit =
    durationInFrames > exitFrames * 2
      ? interpolate(
          frame,
          [durationInFrames - exitFrames, durationInFrames - 1],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        )
      : 1;
  return { frame, fps, durationInFrames, enter, exit };
};

/**
 * Springy pop for staggered items. `delay` in frames. Pure function, safe
 * inside loops (unlike a hook): grab frame/fps once, call this per item.
 */
export const pop = (
  frame: number,
  fps: number,
  delay: number,
  config?: { damping?: number; stiffness?: number }
) =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: config?.damping ?? 14, stiffness: config?.stiffness ?? 120 },
  });

/** Hook flavor of `pop` for single top-level uses. */
export const usePop = (delay: number, config?: { damping?: number; stiffness?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return pop(frame, fps, delay, config);
};
