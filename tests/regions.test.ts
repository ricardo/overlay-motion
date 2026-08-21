import assert from "node:assert/strict";
import test from "node:test";
import { resolveRegion } from "../src/spec/regions";

test("caption-zone defaults slightly above lower platform controls", () => {
  assert.deepEqual(resolveRegion("caption-zone", "center"), {
    x: 6,
    y: 65,
    w: 88,
    h: 20,
    justify: "center",
    align: "center",
  });
});
