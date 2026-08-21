/**
 * Shared math for `reveal: "typewriter"`: linear character progress plus the
 * frames where tick sfx fire. Progress is deliberately linear — easing a
 * typewriter reads as lag, not style.
 */

export type TypewriterWindow = {
  /** First frame of typing, relative to the overlay window. */
  startFrame: number;
  /** How many frames the full text takes to type. */
  typingFrames: number;
  totalChars: number;
};

export const typewriterChars = (frame: number, w: TypewriterWindow): number => {
  const t = (frame - w.startFrame) / Math.max(1, w.typingFrames);
  return Math.max(0, Math.min(w.totalChars, Math.floor(t * w.totalChars)));
};

/** Ticks per second cap: denser than this reads as a buzz, not typing. */
const MAX_TICKS_PER_SEC = 12;

export const typewriterTickFrames = (w: TypewriterWindow, fps: number): number[] => {
  const count = Math.min(
    w.totalChars,
    Math.max(1, Math.floor((w.typingFrames / fps) * MAX_TICKS_PER_SEC))
  );
  return Array.from({ length: count }, (_, i) =>
    Math.round(w.startFrame + (i * w.typingFrames) / count)
  );
};

/** Cumulative char offsets for a list of text chunks (lines or paragraphs). */
export const charOffsets = (chunks: string[]): number[] => {
  const out: number[] = [];
  let n = 0;
  for (const c of chunks) {
    out.push(n);
    n += c.length;
  }
  return out;
};
