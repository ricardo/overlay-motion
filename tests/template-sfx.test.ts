import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  LIBRARY_CUES,
  SFX_NAMES,
  resolveTemplateSfx,
  templateSfx,
} from "../src/sound/config";
import { schemaRows, templatePropsJsonSchema } from "../src/templates/schema-rows";
import { TEMPLATES } from "../src/templates/registry";
import { stickerDef } from "../src/templates/sticker";

const parse = (sfx: unknown) => stickerDef.schema.parse({ src: "mark.png", sfx });

test("a template sound prop names the cue instead of toggling it", () => {
  assert.equal(parse("ding").sfx, "ding");
  assert.equal(parse("/sfx/library/my-stamp.wav").sfx, "/sfx/library/my-stamp.wav");
  assert.equal(parse(false).sfx, false);
  // Omitted keeps the template's own cue, so silence stays an explicit choice.
  assert.equal(stickerDef.schema.parse({ src: "mark.png" }).sfx, "pop");
});

test("`true` is rejected: a boolean cannot name a sound", () => {
  assert.throws(() => parse(""));
  // The message has to carry the migration, since `true` is what every spec
  // written against the old boolean prop says.
  assert.throws(() => parse(true), /false to silence it.*`true` is not a sound/s);
});

test("cue names play from the pack, anything else travels as its own source", () => {
  assert.equal(resolveTemplateSfx(false), null);
  assert.deepEqual(resolveTemplateSfx("ding"), { cue: "ding" });
  // Both fields: `Sfx` keys the `sound.sounds` lookup on the cue, so a custom
  // path stays remappable exactly like a premade name.
  assert.deepEqual(resolveTemplateSfx("/sfx/custom.wav"), {
    cue: "/sfx/custom.wav",
    src: "/sfx/custom.wav",
  });
  assert.equal(templateSfx.parse("whoosh"), "whoosh");
});

test("the storefront publishes what a prop does, not just its type", () => {
  const rows = schemaRows(stickerDef.schema);
  const sfx = rows.find((row) => row.name === "sfx");
  assert.equal(sfx?.type, "false | cue name | file path");
  assert.equal(sfx?.default, '"pop"');
  assert.match(sfx?.description ?? "", /`false` is silence/);
  assert.ok(sfx?.values?.includes("ding"), "the full cue list reaches the page");

  const shadow = rows.find((row) => row.name === "shadow");
  assert.equal(shadow?.default, '"drop"');
  assert.deepEqual(shadow?.values, ["none", "soft", "drop"]);
  assert.ok(shadow?.description, "every sticker prop documents itself");
  assert.ok(rows.every((row) => row.name === "alt" || row.description));
});

test("no template hides a sound behind a boolean", () => {
  const soundish = /sfx|sound/i;
  const offenders = TEMPLATES.flatMap((template) =>
    schemaRows(template.schema)
      .filter((row) => soundish.test(row.name))
      .filter((row) => row.type !== "false | cue name | file path")
      .map((row) => `${template.slug}.${row.name}: ${row.type}`),
  );
  assert.deepEqual(offenders, [], "every sound prop names its cue");
});

test("every sound prop documents itself and defaults to a real cue", () => {
  for (const template of TEMPLATES) {
    for (const row of schemaRows(template.schema)) {
      if (row.type !== "false | cue name | file path") continue;
      assert.ok(row.description, `${template.slug}.${row.name} needs a description`);
      assert.ok(row.default !== undefined, `${template.slug}.${row.name} needs a default`);
      const value = JSON.parse(row.default) as string | false;
      if (value === false) continue;
      assert.ok(
        resolveTemplateSfx(value),
        `${template.slug}.${row.name} default must resolve to a cue`,
      );
    }
  }
});

test("library cues point at files that ship", () => {
  for (const [cue, src] of Object.entries(LIBRARY_CUES)) {
    assert.deepEqual(resolveTemplateSfx(cue), { cue, src }, `${cue} keeps its name`);
    assert.ok(
      existsSync(join(import.meta.dirname, "..", "public", src)),
      `${cue} -> ${src} is missing from public/`,
    );
  }
});

test("agents get the machine-readable cue list", () => {
  const sfx = templatePropsJsonSchema(stickerDef.schema).properties?.sfx;
  const enumOption = sfx?.anyOf?.find((option) => option.enum);
  assert.deepEqual(enumOption?.enum, [...SFX_NAMES]);
  assert.equal(sfx?.default, "pop");
  assert.ok(sfx?.description);
});
