import assert from "node:assert/strict";
import { test } from "node:test";
import { cameraTransform } from "../src/player/camera";
import { overlayCameraTransformAtFrame } from "../src/player/OverlayCamera";
import { camera } from "../src/spec/types";

test("camera presets parse with deterministic defaults", () => {
  const parsed = camera.parse({ preset: "push-in", time: { start: "2s", duration: "3s" } });
  assert.equal(parsed.amount, 0.06);
  assert.equal(parsed.easing, "ease-in-out");
  assert.equal(cameraTransform(parsed, 0, 90, 30), "scale(1)");
});

test("push-in-fast-out punches in, holds, then restores", () => {
  const parsed = camera.parse({
    preset: "push-in-fast-out",
    amount: 0.4,
    easing: "linear",
  });
  assert.equal(cameraTransform(parsed, 0, 100, 100), "scale(1)");
  assert.equal(cameraTransform(parsed, 15, 100, 100), "scale(1.4)");
  assert.equal(cameraTransform(parsed, 50, 100, 100), "scale(1.4)");
  assert.equal(cameraTransform(parsed, 85, 100, 100), "scale(1.4)");
  assert.equal(cameraTransform(parsed, 100, 100, 100), "scale(1)");
});

test("push-in-fast-out has one monotonic arrival and one monotonic return", () => {
  const parsed = camera.parse({
    preset: "push-in-fast-out",
    amount: 0.3,
    easing: "linear",
  });
  const scaleAt = (frame: number) =>
    Number(cameraTransform(parsed, frame, 100, 100).match(/scale\(([^)]+)\)/)![1]);
  const scales = Array.from({ length: 101 }, (_, frame) => scaleAt(frame));

  for (let frame = 1; frame <= 15; frame += 1) {
    assert.ok(scales[frame] >= scales[frame - 1], `arrival reversed at frame ${frame}`);
  }
  for (let frame = 16; frame <= 85; frame += 1) {
    assert.equal(scales[frame], 1.3, `hold drifted at frame ${frame}`);
  }
  for (let frame = 86; frame <= 100; frame += 1) {
    assert.ok(scales[frame] <= scales[frame - 1], `return reversed at frame ${frame}`);
  }
});

test("delayed overlay pull-out holds its opening zoom before motion starts", () => {
  const parsed = camera.parse({
    preset: "pull-out",
    amount: 0.1,
    easing: "linear",
  });
  const from = 4 * 60;
  const duration = 11 * 60;

  assert.equal(overlayCameraTransformAtFrame(parsed, 0, from, duration, 60), "scale(1.1)");
  assert.equal(
    overlayCameraTransformAtFrame(parsed, from - 1, from, duration, 60),
    "scale(1.1)",
  );
  assert.equal(overlayCameraTransformAtFrame(parsed, from, from, duration, 60), "scale(1.1)");
  assert.equal(
    overlayCameraTransformAtFrame(parsed, from + duration, from, duration, 60),
    "none",
  );
});
