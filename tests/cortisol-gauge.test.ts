import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cortisolGaugeDef,
  cortisolNeedleAngle,
  cortisolValueAtFrame,
} from "../src/templates/cortisol-gauge";

test("cortisol gauge publishes configurable content, motion, and palette", () => {
  const parsed = cortisolGaugeDef.schema.parse({
    title: "STRESS LEVEL",
    lowLabel: "CALM",
    startValue: 92,
    endValue: 18,
    sweepSeconds: 1.5,
    showValue: true,
    valueSuffix: "%",
    lowColor: "#12AB34",
  }) as Record<string, unknown>;

  assert.equal(parsed.title, "STRESS LEVEL");
  assert.equal(parsed.lowLabel, "CALM");
  assert.equal(parsed.startValue, 92);
  assert.equal(parsed.endValue, 18);
  assert.equal(parsed.showValue, true);
  assert.equal(parsed.valueSuffix, "%");
  assert.equal(parsed.lowColor, "#12AB34");
  assert.equal(parsed.highColor, "#FE0002");
  assert.throws(() => cortisolGaugeDef.schema.parse({ lowColor: "green" }));
});

test("cortisol gauge holds, overshoots, then settles on its target", () => {
  const input = {
    fps: 60,
    startValue: 70,
    endValue: 10,
    delaySeconds: 0.5,
    sweepSeconds: 2,
    settleSeconds: 0.5,
    overshoot: 2,
    elasticBounces: 2,
  };

  assert.equal(cortisolValueAtFrame({ ...input, frame: 30 }), 70);
  assert.equal(cortisolValueAtFrame({ ...input, frame: 150 }), 8);
  assert.equal(cortisolValueAtFrame({ ...input, frame: 180 }), 10);
});

test("cortisol gauge maps low, middle, and high readings across the dial", () => {
  assert.equal(cortisolNeedleAngle(10), 0);
  assert.equal(cortisolNeedleAngle(50), 72);
  assert.equal(cortisolNeedleAngle(90), 144);
});
