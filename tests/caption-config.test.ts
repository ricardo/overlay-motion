import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPTION_PRESETS, resolveCaptionConfig } from "../src/templates/caption-classic/presets";
import { captionClassicSchema } from "../src/templates/caption-classic/schema";

const track = { track: { cues: [{ text: "one two three four five six" }] } };
const parse = (props: object) => captionClassicSchema.parse({ ...track, ...props });

test("the default preset caps a cue at four words", () => {
  assert.equal(CAPTION_PRESETS.classic.grouping.maxWords, 4);
  assert.ok(CAPTION_PRESETS.classic.grouping.targetWords <= 4);
  assert.equal(CAPTION_PRESETS.classic.grouping.mode, "explicit");
});

test("the default preset outlines the letters in black", () => {
  const base = CAPTION_PRESETS.classic.styles.base;
  assert.ok((base.strokeWidth ?? 0) > 0);
  assert.equal(base.strokeColorRole, "black");
});

/**
 * The bug this locks: `grouping` used to be the defaulted schema, so overriding
 * one field silently filled the rest from its defaults. `{ maxWords: 4 }` then
 * carried `targetWords: 5` and failed its own "targetWords <= maxWords" check,
 * making the cap impossible to lower without restating the whole block.
 */
test("overriding one grouping field keeps the rest of the preset", () => {
  const config = resolveCaptionConfig(parse({ preset: "editorial", grouping: { maxWords: 4 } }));
  assert.equal(config.grouping.maxWords, 4);
  assert.equal(config.grouping.mode, CAPTION_PRESETS.editorial.grouping.mode);
  assert.equal(
    config.grouping.maxCharactersPerLine,
    CAPTION_PRESETS.editorial.grouping.maxCharactersPerLine,
  );
  // editorial targets 6, which cannot survive a cap of 4.
  assert.equal(config.grouping.targetWords, 4);
});

test("lowering the cap alone is accepted rather than rejected as a conflict", () => {
  assert.doesNotThrow(() => parse({ grouping: { maxWords: 2 } }));
  const config = resolveCaptionConfig(parse({ grouping: { maxWords: 2 } }));
  assert.equal(config.grouping.targetWords, 2);
});

test("case and punctuation default to leaving the transcript alone", () => {
  const config = resolveCaptionConfig(parse({}));
  assert.deepEqual(config.text, { case: "as-spoken", punctuation: "keep" });
});

test("case and punctuation are settable from the spec", () => {
  const config = resolveCaptionConfig(
    parse({ text: { case: "upper", punctuation: "strip" } }),
  );
  assert.deepEqual(config.text, { case: "upper", punctuation: "strip" });

  const partial = resolveCaptionConfig(parse({ text: { case: "upper" } }));
  assert.deepEqual(partial.text, { case: "upper", punctuation: "keep" });
});

test("an unknown case or punctuation value is rejected, not ignored", () => {
  assert.throws(() => parse({ text: { case: "Title" } }));
  assert.throws(() => parse({ text: { punctuation: "none" } }));
});
