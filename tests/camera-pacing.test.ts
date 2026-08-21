import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSpec } from "../src/spec/validate";

const baseSpec = {
  version: 1 as const,
  format: "vertical" as const,
  fps: 30,
  durationSec: 10,
  source: { type: "video" as const, src: "input.mp4" },
  overlays: [
    {
      template: "caption-classic",
      time: { start: "0s", duration: "10s" },
      props: { lines: [{ text: "Camera pacing" }] },
    },
  ],
};

test("rejects overlapping camera windows in the same scope", () => {
  const result = validateSpec({
    ...baseSpec,
    camera: [
      { preset: "push-in", time: { start: "1s", duration: "4s" } },
      { preset: "pull-out", time: { start: "3s", duration: "3s" } },
    ],
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /may not overlap/i);
  }
});

test("rejects unreadably short punch-in and return windows", () => {
  const result = validateSpec({
    ...baseSpec,
    camera: { preset: "push-in-fast-out", time: { start: "1s", duration: "2s" } },
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /at least 3 seconds/i);
  }
});

test("accepts separated deliberate camera windows", () => {
  const result = validateSpec({
    ...baseSpec,
    camera: [
      { preset: "push-in-fast-out", time: { start: "0s", duration: "3s" } },
      { preset: "push-in", time: { start: "5s", duration: "3s" } },
    ],
  });

  assert.equal(result.success, true);
});

test("accepts second-exact phases on zoom presets", () => {
  const result = validateSpec({
    ...baseSpec,
    camera: {
      preset: "push-in-fast-out",
      time: { start: "1s", duration: "8s" },
      inSec: 1.5,
      outSec: 1.5,
    },
  });

  assert.equal(result.success, true);
});

test("rejects phases that leave no hold inside the window", () => {
  const result = validateSpec({
    ...baseSpec,
    camera: {
      preset: "push-in-fast-out",
      time: { start: "1s", duration: "4s" },
      inSec: 3,
      outSec: 2,
    },
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.issues.map((issue) => issue.message).join("\n"), /exceed/i);
  }
});

test("rejects phases on pans and the phase a preset does not have", () => {
  const pan = validateSpec({
    ...baseSpec,
    camera: { preset: "pan-left", time: { start: "1s", duration: "4s" }, inSec: 1 },
  });
  assert.equal(pan.success, false);

  const pushOut = validateSpec({
    ...baseSpec,
    camera: { preset: "push-in", time: { start: "1s", duration: "4s" }, outSec: 1 },
  });
  assert.equal(pushOut.success, false);
  if (!pushOut.success) {
    assert.match(
      pushOut.error.issues.map((issue) => issue.message).join("\n"),
      /no return phase/i
    );
  }
});
