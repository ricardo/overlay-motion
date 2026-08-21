import assert from "node:assert/strict";
import { test } from "node:test";
import { captionAppearanceAt } from "../src/templates/caption-classic/appearance";

test("instant captions are fully visible immediately", () => {
  assert.deepEqual(
    captionAppearanceAt({
      mode: "instant",
      nowSec: 0,
      startSec: 1,
      durationSec: 0.2,
      distance: 18,
    }),
    { opacity: 1, translateY: 0, scale: 1 },
  );
});

test("fade-up captions arrive from below and settle", () => {
  const start = captionAppearanceAt({
    mode: "fade-up",
    nowSec: 1,
    startSec: 1,
    durationSec: 0.2,
    distance: 18,
  });
  const end = captionAppearanceAt({
    mode: "fade-up",
    nowSec: 1.2,
    startSec: 1,
    durationSec: 0.2,
    distance: 18,
  });
  assert.deepEqual(start, { opacity: 0, translateY: 18, scale: 1 });
  assert.ok(end.opacity > 0.999);
  assert.ok(end.translateY < 0.001);
});

test("word-by-word appearance hides future words", () => {
  const state = captionAppearanceAt({
    mode: "word-by-word",
    nowSec: 0.8,
    startSec: 1,
    durationSec: 0.15,
    distance: 12,
  });
  assert.equal(state.opacity, 0);
  assert.equal(state.translateY, 12);
});
