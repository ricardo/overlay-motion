import type { TimeValue, TimeWindow } from "./types";

type Ctx = { fps: number; totalFrames: number };

export const toFrames = (t: TimeValue, ctx: Ctx): number => {
  if (typeof t === "number") return Math.round(t * ctx.fps);
  if (t.endsWith("%")) {
    const pct = parseFloat(t);
    return Math.round((pct / 100) * ctx.totalFrames);
  }
  const sec = parseFloat(t); // "3s" | "-2s"
  const frames = Math.round(sec * ctx.fps);
  return frames < 0 ? ctx.totalFrames + frames : frames;
};

export const resolveWindow = (
  win: TimeWindow | undefined,
  ctx: Ctx
): { from: number; durationInFrames: number; appearFrames: number | null } => {
  const from = win?.start !== undefined ? toFrames(win.start, ctx) : 0;
  const appearFrames = win?.appear !== undefined ? toFrames(win.appear, ctx) : null;
  const durationInFrames =
    win?.duration !== undefined
      ? toFrames(win.duration, ctx)
      : win?.hold !== undefined
        ? (appearFrames ?? 0) + toFrames(win.hold, ctx)
        : Math.max(1, ctx.totalFrames - from);
  return {
    from: Math.max(0, Math.min(from, ctx.totalFrames - 1)),
    durationInFrames: Math.max(1, durationInFrames),
    appearFrames,
  };
};
