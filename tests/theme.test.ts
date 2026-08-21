import assert from "node:assert/strict";
import test from "node:test";
import { PRESET_THEMES, surfaceStyle } from "../src/theme/themes";

test("Arctic glass is the first and default preset", () => {
  assert.equal(PRESET_THEMES[0].name, "Arctic Glass");
});

test("Arctic glass keeps dark copy color out of its rim and shadows", () => {
  const arctic = PRESET_THEMES.find((theme) => theme.name === "Arctic Glass");
  assert.ok(arctic);

  const style = surfaceStyle(arctic);
  const material = `${style.background} ${style.boxShadow}`;

  assert.doesNotMatch(material, /23, 24, 43/);
  assert.doesNotMatch(material, /rgba\(0, 0, 0/);
  assert.match(material, /255, 255, 255/);
  assert.match(material, /91, 92, 226, 0\.14/);
});
