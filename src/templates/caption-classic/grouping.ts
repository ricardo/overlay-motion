import type { CaptionCue, CaptionGrouping } from "./schema";

const wordsFromCue = (cue: CaptionCue) =>
  cue.words ??
  (cue.text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text }));

const normalizedCue = (cue: CaptionCue): CaptionCue => {
  const words = wordsFromCue(cue);
  if (cue.words) {
    return {
      ...cue,
      text: cue.text ?? words.map((word) => word.text).join(" "),
      start: cue.start ?? cue.words[0].start,
      end: cue.end ?? cue.words[cue.words.length - 1].end,
    };
  }
  return { ...cue, text: cue.text ?? words.map((word) => word.text).join(" ") };
};

const endsSemanticUnit = (text: string) => /[.!?;:,][\"'”’)]*$/.test(text);

const groupEnd = (
  words: Array<{ text: string }>,
  start: number,
  grouping: CaptionGrouping,
) => {
  const remaining = words.length - start;
  if (remaining <= grouping.maxWords) return words.length;

  const characterLimit = grouping.maxLines * grouping.maxCharactersPerLine;
  let hardEnd = start;
  let characters = 0;
  while (hardEnd < words.length && hardEnd - start < grouping.maxWords) {
    const nextCharacters = characters + (hardEnd === start ? 0 : 1) + words[hardEnd].text.length;
    if (hardEnd > start && nextCharacters > characterLimit) break;
    characters = nextCharacters;
    hardEnd += 1;
  }
  if (hardEnd === start) hardEnd += 1;

  const targetEnd = Math.min(start + grouping.targetWords, hardEnd);
  for (let end = Math.max(start + 1, targetEnd - 2); end <= hardEnd; end += 1) {
    if (endsSemanticUnit(words[end - 1].text)) return end;
  }
  return targetEnd;
};

const splitCue = (rawCue: CaptionCue, grouping: CaptionGrouping): CaptionCue[] => {
  const cue = normalizedCue(rawCue);
  const words = wordsFromCue(cue);
  if (words.length <= grouping.maxWords) return [cue];

  const result: CaptionCue[] = [];
  let startIndex = 0;
  while (startIndex < words.length) {
    const endIndex = groupEnd(words, startIndex, grouping);
    const chunk = words.slice(startIndex, endIndex);
    const isFirst = startIndex === 0;
    const isLast = endIndex === words.length;
    const timedWords = cue.words?.slice(startIndex, endIndex);
    const next: CaptionCue = {
      text: chunk.map((word) => word.text).join(" "),
      ...(timedWords ? { words: timedWords } : {}),
    };

    if (timedWords) {
      const boundaryBefore = isFirst
        ? undefined
        : (cue.words![startIndex - 1].end + cue.words![startIndex].start) / 2;
      const boundaryAfter = isLast
        ? undefined
        : (cue.words![endIndex - 1].end + cue.words![endIndex].start) / 2;
      next.start = isFirst ? (cue.start ?? timedWords[0].start) : boundaryBefore;
      next.end = isLast
        ? (cue.end ?? timedWords[timedWords.length - 1].end)
        : boundaryAfter;
    } else if (cue.start !== undefined && cue.end !== undefined) {
      const duration = cue.end - cue.start;
      next.start = cue.start + duration * (startIndex / words.length);
      next.end = cue.start + duration * (endIndex / words.length);
    }

    result.push(next);
    startIndex = endIndex;
  }
  return result;
};

export const groupCaptionCues = (
  cues: CaptionCue[],
  grouping: CaptionGrouping,
): CaptionCue[] => {
  const normalized = cues.map(normalizedCue);
  // `explicit` means the caller's phrasing is respected, not that the
  // readability cap is waived: a cap that only applies in one mode is not a
  // cap. The difference is how a too-long cue is broken. Explicit splits as
  // few times as it can, so cues that already fit are untouched and the rest
  // stay as close to the caller's phrasing as the cap allows. Auto regroups to
  // targetWords and ignores where the caller drew the lines.
  const effective =
    grouping.mode === "explicit"
      ? { ...grouping, targetWords: grouping.maxWords }
      : grouping;
  return normalized.flatMap((cue) => splitCue(cue, effective));
};
