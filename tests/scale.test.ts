import assert from "node:assert/strict";
import { test } from "node:test";
import { compositionRemScale } from "../src/player/scale";

test("template tokens use the short edge across supported aspect ratios", () => {
  assert.equal(compositionRemScale(1080, 1920), 1);
  assert.equal(compositionRemScale(1080, 1080), 1);
  assert.equal(compositionRemScale(1620, 1080), 1);
  assert.equal(compositionRemScale(1920, 1080), 1);
});

test("template tokens still scale for larger and smaller compositions", () => {
  assert.equal(compositionRemScale(2160, 3840), 2);
  assert.equal(compositionRemScale(540, 960), 0.5);
});
