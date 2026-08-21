import assert from "node:assert/strict";
import { test } from "node:test";
import { bubbleGeometry, type BubbleInput } from "../src/templates/face-bubble/geometry";
import { bubbleShapeRadiusPct, faceBubbleSchema } from "../src/templates/face-bubble/schema";

const base: BubbleInput = {
  width: 1080,
  height: 1920,
  faceX: 0.45,
  faceY: 0.5,
  faceSize: 0.32,
  progress: 0,
  sizePct: 36,
  marginPct: 6,
  headroom: 1.9,
  corner: "bottom-right",
  radiusPct: 50,
};

test("progress 0 is the untouched frame, so a mid-shot handover has no seam", () => {
  const g = bubbleGeometry(base);
  assert.equal(g.windowX, 0);
  assert.equal(g.windowY, 0);
  assert.equal(g.windowW, base.width);
  assert.equal(g.windowH, base.height);
  assert.equal(g.radiusPct, 0);
  assert.equal(g.planeX, 0);
  assert.equal(g.planeY, 0);
  assert.equal(g.planeW, base.width);
  assert.equal(g.planeH, base.height);
});

test("progress 0 stays the untouched frame wherever the face is", () => {
  for (const [faceX, faceY, faceSize] of [
    [0.05, 0.05, 0.5],
    [0.95, 0.95, 0.12],
    [0.5, 0.5, 0.9],
  ]) {
    const g = bubbleGeometry({ ...base, faceX, faceY, faceSize });
    assert.equal(g.planeX, 0, `planeX for ${faceX}`);
    assert.equal(g.planeY, 0, `planeY for ${faceY}`);
    assert.equal(g.planeW, base.width);
    assert.equal(g.planeH, base.height);
  }
});

/** A lerp that lands exactly on its endpoint is not worth asserting to the bit. */
const close = (actual: number, expected: number, label: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} vs ${expected}`);

test("the settled bubble lands in its corner with the requested diameter", () => {
  const g = bubbleGeometry({ ...base, progress: 1 });
  const diameter = (base.sizePct / 100) * base.width;
  const margin = (base.marginPct / 100) * base.width;
  close(g.windowW, diameter, "windowW");
  close(g.windowH, diameter, "windowH");
  close(g.windowX, base.width - margin - diameter, "windowX");
  close(g.windowY, base.height - margin - diameter, "windowY");
  assert.equal(g.radiusPct, 50);

  const topLeft = bubbleGeometry({ ...base, progress: 1, corner: "top-left" });
  close(topLeft.windowX, margin, "top-left windowX");
  close(topLeft.windowY, margin, "top-left windowY");
});

/**
 * The bug this locks: an uncapped, unclamped crop reaches past the source and
 * the missing corner renders as backdrop, so the circle shows a black crescent.
 */
test("the crop never leaves the source, so the bubble is never part backdrop", () => {
  const cases: Array<[number, number, number]> = [
    [0.259, 0.512, 0.324], // the real worst frame of IMG_4563
    [0.02, 0.5, 0.3],
    [0.98, 0.5, 0.3],
    [0.5, 0.02, 0.3],
    [0.5, 0.98, 0.3],
    [0.5, 0.5, 0.95], // asks for a crop far wider than the frame
  ];
  for (const [faceX, faceY, faceSize] of cases) {
    const g = bubbleGeometry({ ...base, progress: 1, faceX, faceY, faceSize });
    const label = `face ${faceX},${faceY} size ${faceSize}`;
    // Source-space rect visible through the aperture.
    const scale = g.planeW / base.width;
    const left = -g.planeX / scale;
    const top = -g.planeY / scale;
    const right = left + g.windowW / scale;
    const bottom = top + g.windowH / scale;
    assert.ok(left >= -1e-6, `${label}: left ${left}`);
    assert.ok(top >= -1e-6, `${label}: top ${top}`);
    assert.ok(right <= base.width + 1e-6, `${label}: right ${right}`);
    assert.ok(bottom <= base.height + 1e-6, `${label}: bottom ${bottom}`);
  }
});

test("the crop stays inside the source through the whole transition", () => {
  for (let step = 0; step <= 20; step += 1) {
    const progress = step / 20;
    const g = bubbleGeometry({ ...base, progress, faceX: 0.259, faceSize: 0.324 });
    const scale = g.planeW / base.width;
    const left = -g.planeX / scale;
    const top = -g.planeY / scale;
    assert.ok(left >= -1e-6, `progress ${progress}: left ${left}`);
    assert.ok(top >= -1e-6, `progress ${progress}: top ${top}`);
    assert.ok(left + g.windowW / scale <= base.width + 1e-6, `progress ${progress}: right`);
    assert.ok(top + g.windowH / scale <= base.height + 1e-6, `progress ${progress}: bottom`);
  }
});

test("a face box larger than the frame caps instead of overscanning", () => {
  const g = bubbleGeometry({ ...base, progress: 1, faceSize: 0.9 });
  assert.equal(g.cropSide, base.width);
});

test("the aperture rounds from square corners to the requested shape", () => {
  // The full frame has square corners, so any rounding has to be arrived at.
  for (const radiusPct of [50, 0, 18]) {
    assert.equal(bubbleGeometry({ ...base, radiusPct, progress: 0 }).radiusPct, 0);
    assert.equal(bubbleGeometry({ ...base, radiusPct, progress: 1 }).radiusPct, radiusPct);
  }
  // A square bubble is square the whole way, never briefly rounded.
  for (let step = 0; step <= 10; step += 1) {
    const g = bubbleGeometry({ ...base, radiusPct: 0, progress: step / 10 });
    assert.equal(g.radiusPct, 0);
  }
});

test("shape names and an explicit radius resolve to the same scale", () => {
  assert.equal(bubbleShapeRadiusPct("circle"), 50);
  assert.equal(bubbleShapeRadiusPct("square"), 0);
  assert.equal(bubbleShapeRadiusPct({ radiusPct: 18 }), 18);
});

test("backdrop accepts a hex shorthand, a color object and background media", () => {
  const withTrack = { track: { points: [[0.5, 0.5, 0.3]] } };
  assert.deepEqual(faceBubbleSchema.parse({ ...withTrack, backdrop: "#000000" }).backdrop, "#000000");

  const media = faceBubbleSchema.parse({
    ...withTrack,
    backdrop: { color: "#101010", media: { src: "/demo/broll-demo.mp4" } },
  }).backdrop;
  assert.equal(typeof media, "object");
  assert.deepEqual(media, {
    color: "#101010",
    media: { src: "/demo/broll-demo.mp4", fit: "cover", muted: true, dim: 0 },
  });

  assert.throws(() => faceBubbleSchema.parse({ ...withTrack, backdrop: "black" }));
});

test("shape defaults to a circle so the plain case needs no prop", () => {
  const p = faceBubbleSchema.parse({ track: { points: [[0.5, 0.5, 0.3]] } });
  assert.equal(p.shape, "circle");
  assert.equal(p.corner, "bottom-right");
});

test("the bubble cuts in by default and the collapse is opt-in", () => {
  const withTrack = { track: { points: [[0.5, 0.5, 0.3]] } };
  assert.equal(faceBubbleSchema.parse(withTrack).enterSec, 0);
  assert.equal(faceBubbleSchema.parse({ ...withTrack, enterSec: 0.8 }).enterSec, 0.8);
  // The old floor made a cut inexpressible, which is how an entrance nobody
  // asked for became the only option.
  assert.equal(faceBubbleSchema.parse({ ...withTrack, enterSec: 0 }).enterSec, 0);
});

test("a cut lands on the finished bubble, with no full-frame first frame", () => {
  // What the component computes when enterSec is 0: progress 1 on frame 0.
  const cut = bubbleGeometry({ ...base, progress: 1 });
  assert.equal(cut.radiusPct, 50);
  assert.ok(cut.windowW < base.width, "the aperture is the bubble, not the frame");
  assert.ok(cut.windowX > 0 && cut.windowY > 0, "and it is already in its corner");
});
