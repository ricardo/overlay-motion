import assert from "node:assert/strict";
import { test } from "node:test";
import { groupCaptionCues } from "../src/templates/caption-classic/grouping";
import type { CaptionGrouping } from "../src/templates/caption-classic/schema";

const grouping: CaptionGrouping = {
  mode: "auto",
  targetWords: 5,
  maxWords: 6,
  maxLines: 2,
  maxCharactersPerLine: 32,
};

test("automatic grouping caps words shown at once", () => {
  const cues = groupCaptionCues(
    [{ text: "one two three four five six seven eight nine ten eleven" }],
    grouping,
  );
  assert.deepEqual(cues.map((cue) => cue.text?.split(/\s+/).length), [5, 6]);
  assert.ok(cues.every((cue) => (cue.text?.split(/\s+/).length ?? 0) <= grouping.maxWords));
});

test("automatic grouping prefers nearby semantic punctuation", () => {
  const cues = groupCaptionCues(
    [{ text: "One small clause, followed by several more useful words today" }],
    grouping,
  );
  assert.equal(cues[0].text, "One small clause,");
});

test("timed grouping preserves marks and derives non-overlapping cue windows", () => {
  const words = [
    { text: "one", start: 0, end: 0.2 },
    { text: "two", start: 0.2, end: 0.4 },
    { text: "three", start: 0.4, end: 0.6, marks: ["buzzword" as const] },
    { text: "four", start: 0.6, end: 0.8 },
    { text: "five", start: 0.9, end: 1.1 },
    { text: "six", start: 1.1, end: 1.3 },
    { text: "seven", start: 1.3, end: 1.4 },
  ];
  const cues = groupCaptionCues([{ start: 0, end: 1.5, words }], {
    ...grouping,
    targetWords: 4,
    maxWords: 4,
  });
  assert.equal(cues.length, 2);
  assert.ok(Math.abs((cues[0].end ?? 0) - 0.85) < 1e-9);
  assert.ok(Math.abs((cues[1].start ?? 0) - 0.85) < 1e-9);
  assert.equal(cues[1].end, 1.5);
  assert.deepEqual(cues[0].words?.[2].marks, ["buzzword"]);
});

test("explicit grouping preserves authored cue boundaries within the cap", () => {
  const cues = groupCaptionCues(
    [{ text: "one two three" }, { text: "four five six" }],
    { ...grouping, mode: "explicit" },
  );
  assert.deepEqual(
    cues.map((cue) => cue.text),
    ["one two three", "four five six"],
  );
});

test("explicit grouping still obeys the cap, cutting as little as it can", () => {
  // A cap that one mode may ignore is not a cap. Explicit keeps the caller's
  // phrasing where it fits and breaks at maxWords, not targetWords, so a long
  // cue takes the fewest cuts; auto regroups to targetWords regardless.
  const text = "one two three four five six seven eight nine";
  const explicit = groupCaptionCues([{ text }], { ...grouping, mode: "explicit" });
  assert.deepEqual(
    explicit.map((cue) => cue.text?.split(/\s+/).length),
    [6, 3],
  );
  assert.ok(explicit.every((cue) => (cue.text?.split(/\s+/).length ?? 0) <= grouping.maxWords));

  const auto = groupCaptionCues([{ text }], { ...grouping, mode: "auto" });
  assert.deepEqual(
    auto.map((cue) => cue.text?.split(/\s+/).length),
    [5, 4],
  );
});
