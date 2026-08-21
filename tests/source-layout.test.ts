import assert from "node:assert/strict";
import { test } from "node:test";
import { sourceLayoutAtFrame } from "../src/player/source-layout";

const args = {
  fps: 30,
  totalFrames: 300,
  defaultFit: "cover" as const,
  defaultPosition: "center",
  reframes: [
    {
      time: { start: "2s" as const, duration: "4s" as const },
      region: { x: 4, y: 8, w: 44, h: 84 },
      position: "60% center",
      transitionSec: 0.3,
    },
  ],
};

test("source is fullscreen outside a reframe window", () => {
  assert.deepEqual(sourceLayoutAtFrame({ ...args, frame: 30 }), {
    region: { x: 0, y: 0, w: 100, h: 100 },
    fit: "cover",
    position: "center",
  });
});

test("source occupies the inspected safe region in the middle", () => {
  assert.deepEqual(sourceLayoutAtFrame({ ...args, frame: 120 }), {
    region: { x: 4, y: 8, w: 44, h: 84 },
    fit: "cover",
    position: "60% center",
  });
});

test("source layout eases at the boundary", () => {
  const first = sourceLayoutAtFrame({ ...args, frame: 60 });
  const next = sourceLayoutAtFrame({ ...args, frame: 64 });
  assert.deepEqual(first.region, { x: 0, y: 0, w: 100, h: 100 });
  assert.ok(next.region.x > 0 && next.region.x < 4);
  assert.ok(next.region.w < 100 && next.region.w > 44);
});
