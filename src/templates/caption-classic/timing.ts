import type { CaptionCue, CaptionWordMark } from "./schema";

export type CaptionWordCue = {
  text: string;
  start: number;
  end: number;
  marks?: CaptionWordMark[];
};
export type CaptionLineCue = CaptionCue;

export type ActiveCaption = {
  lineIndex: number;
  words: Array<{ text: string; marks?: CaptionWordMark[] }>;
  activeWord: number | null;
};

/** Pure timing resolver shared by preview/render and unit tests. */
export const activeCaptionAt = ({
  lines,
  nowSec,
  durationSec,
  highlightDuringGaps = true,
}: {
  lines: CaptionLineCue[];
  nowSec: number;
  durationSec: number;
  highlightDuringGaps?: boolean;
}): ActiveCaption | null => {
  const hasPhraseTiming = lines.some(
    (line) => line.start !== undefined && line.end !== undefined,
  );
  const lineIndex = hasPhraseTiming
    ? lines.findIndex(
        (line) =>
          line.start !== undefined &&
          line.end !== undefined &&
          nowSec >= line.start &&
          nowSec < line.end,
      )
    : Math.min(
        lines.length - 1,
        Math.floor(nowSec / Math.max(durationSec / lines.length, Number.EPSILON)),
      );

  // Explicit phrase windows intentionally allow silent gaps.
  if (lineIndex < 0) return null;

  const line = lines[lineIndex];
  const words =
    line.words ??
    (line.text ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((text) => ({ text }));
  if (!line.words) {
    const lineStart = hasPhraseTiming
      ? (line.start ?? 0)
      : lineIndex * (durationSec / lines.length);
    const lineDuration = hasPhraseTiming
      ? Math.max((line.end ?? durationSec) - lineStart, Number.EPSILON)
      : durationSec / lines.length;
    return {
      lineIndex,
      words,
      activeWord: Math.min(
        words.length - 1,
        Math.floor(((nowSec - lineStart) / lineDuration) * words.length),
      ),
    };
  }

  const speaking = line.words.findIndex(
    (word) => nowSec >= word.start && nowSec < word.end,
  );
  if (speaking >= 0) return { lineIndex, words, activeWord: speaking };
  if (!highlightDuringGaps) return { lineIndex, words, activeWord: null };

  const lastStarted = line.words.reduce(
    (result, word, index) => (nowSec >= word.start ? index : result),
    0,
  );
  return { lineIndex, words, activeWord: lastStarted };
};
