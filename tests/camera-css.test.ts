import assert from "node:assert/strict";
import { test } from "node:test";
import { cameraRestScale, composeCameraCss, presetTransform } from "../src/player/camera";

// "none" cannot combine with other transform functions; an invalid inline
// transform assignment silently keeps the element's previous transform, so a
// render worker that painted mid-zoom frames stays zoomed for every later
// frame it renders. The composed value must be valid CSS in both states.
test("inactive camera composes a valid identity transform", () => {
  assert.equal(composeCameraCss("none"), "translateZ(0)");
});

test("active camera keeps its transform plus the GPU hint", () => {
  assert.equal(composeCameraCss("scale(1.2)"), "scale(1.2) translateZ(0)");
});

const scaleOf = (css: string) => Number(/scale\(([\d.]+)\)/.exec(css)![1]);

// The gap this closes: every camera used to return to identity, so "open tight
// on the face, then sit at a slight push for the rest of the video" needed two
// windows meeting at a visible step.
test("a pull-out settles at its resting zoom, not at identity", () => {
  const camera = { preset: "pull-out" as const, amount: 0.375, rest: 0.1 };
  assert.equal(scaleOf(presetTransform("pull-out", 0.375, 0, undefined, 0.1)).toFixed(3), "1.375");
  assert.equal(scaleOf(presetTransform("pull-out", 0.375, 1, undefined, 0.1)).toFixed(3), "1.100");
  // And the frames outside the window sit at the same place, so there is
  // nothing to snap back from.
  assert.equal(cameraRestScale(camera).toFixed(3), "1.100");
});

test("rest defaults to identity, so existing specs are untouched", () => {
  assert.equal(scaleOf(presetTransform("pull-out", 0.25, 1)), 1);
  assert.equal(cameraRestScale({ preset: "pull-out", rest: 0 }), 1);
  assert.equal(cameraRestScale({ preset: "pan-left", rest: 0.4 }), 1);
});

test("a push-in with a rest starts from the rest and arrives at amount", () => {
  assert.equal(scaleOf(presetTransform("push-in", 0.3, 0, undefined, 0.1)).toFixed(3), "1.100");
  assert.equal(scaleOf(presetTransform("push-in", 0.3, 1, undefined, 0.1)).toFixed(3), "1.300");
});
