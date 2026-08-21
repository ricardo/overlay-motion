import assert from "node:assert/strict";
import { test } from "node:test";
import { schemaRows, templatePropsJsonSchema } from "../src/templates/schema-rows";
import { captionClassicDef } from "../src/templates/caption-classic";
import { CAPTION_PRESETS } from "../src/templates/caption-classic/presets";
import { blurFocusTextDef } from "../src/templates/blur-focus-text";
import { TEMPLATE_SLUGS } from "../src/templates/catalog";
import { logoStingDef } from "../src/templates/logo-sting";
import { quoteCardDef } from "../src/templates/quote-card";
import { stickerDef } from "../src/templates/sticker";
import { tweetCardDef } from "../src/templates/tweet-card";
import { TEMPLATES } from "../src/templates/registry";
import { PRESET_THEMES } from "../src/theme/themes";
import { parsedMetadata } from "../remotion/Root";

test("lightweight route catalog stays aligned with template registry", () => {
  assert.deepEqual(TEMPLATE_SLUGS, TEMPLATES.map((template) => template.slug));
});

test("schema documentation unwraps refined caption word objects", () => {
  const lines = schemaRows(captionClassicDef.schema).find((row) => row.name === "lines");
  assert.deepEqual(lines, {
    name: "lines",
    type: "list of { text, start, end, words }",
    required: false,
  });
});

test("caption schema publishes nested track, highlight and word-mark controls", () => {
  const schema = templatePropsJsonSchema(captionClassicDef.schema);
  const properties = schema.properties!;
  assert.deepEqual(properties.preset.enum, [
    "classic",
    "minimal",
    "editorial",
    "punch",
    "extruded",
  ]);
  assert.deepEqual(properties.highlight.properties?.mode.enum, ["word", "none"]);
  assert.deepEqual(properties.appearance.properties?.mode.enum, [
    "instant",
    "fade",
    "fade-up",
    "pop",
    "word-by-word",
  ]);
  // Marks are open ended, but the published contract still has to NAME the
  // built-ins, otherwise an agent reading the schema has no way to learn
  // they exist. The enum branch is that documentation.
  const marks = properties.track.properties?.cues.items?.properties?.words.items?.properties?.marks
    .items as { anyOf?: { enum?: string[]; minLength?: number }[] };
  assert.deepEqual(marks.anyOf?.[0]?.enum, ["buzzword", "emphasis"]);
  assert.equal(marks.anyOf?.[1]?.minLength, 1);
});

test("classic preset pads only the highlighted word", () => {
  assert.equal(CAPTION_PRESETS.classic.styles.base.paddingX, 0);
  assert.equal(CAPTION_PRESETS.classic.styles.base.paddingY, 0);
  assert.equal(CAPTION_PRESETS.classic.styles.active.paddingX, 14);
  assert.equal(CAPTION_PRESETS.classic.styles.active.paddingY, 2);
  assert.equal(CAPTION_PRESETS.classic.highlight.badgeMarginX, 6);
  assert.equal(CAPTION_PRESETS.minimal.highlight.badgeMarginX, 0);
});

test("punch preset outlines one word at a time with a connected silhouette shadow", () => {
  const punch = CAPTION_PRESETS.punch;
  assert.equal(punch.grouping.maxWords, 1);
  assert.equal(punch.highlight.mode, "none");
  assert.equal(punch.styles.base.strokeWidth, 8);
  assert.equal(punch.styles.base.textShadow, undefined);
  assert.deepEqual(punch.styles.base.dropShadow, {
    x: 3,
    y: 5,
    blur: 1,
    color: "black",
    opacity: 0.95,
  });
  // Animated scale on stroked glyphs shimmers in Chromium; the cadence carries it.
  assert.equal(punch.appearance.mode, "instant");
});

test("caption colors take brand tokens or hex literals, nothing else", () => {
  const parseColor = (color: string) =>
    captionClassicDef.schema.parse({
      lines: [{ text: "hello" }],
      styles: { base: { colorRole: color } },
    }) as { styles?: { base?: { colorRole?: string } } };
  assert.equal(parseColor("accent").styles?.base?.colorRole, "accent");
  assert.equal(parseColor("#FFDE00").styles?.base?.colorRole, "#FFDE00");
  assert.throws(() => parseColor("chartreuse"));
});

test("extruded preset gets its depth from the extrusion, not a shadow", () => {
  const base = CAPTION_PRESETS.extruded.styles.base;
  assert.equal(CAPTION_PRESETS.extruded.grouping.maxWords, 1);
  // y is the run that reads as "too far": past ~18 the extrusion hangs below
  // the baseline far enough to look like a second, blurred line of type.
  assert.deepEqual(base.extrude, { x: 14, y: 16, color: "black" });
  assert.equal(base.textShadow, undefined);
  assert.equal(base.strokeWidth, 10);
  assert.equal(base.fontWeight, 700);
});

test("dropShadow and textShadow are separate knobs", () => {
  const parsed = captionClassicDef.schema.parse({
    lines: [{ text: "hello" }],
    styles: { base: { dropShadow: { x: 2, y: 2 } } },
  }) as { styles?: { base?: { dropShadow?: unknown; textShadow?: unknown } } };
  assert.deepEqual(parsed.styles?.base?.dropShadow, {
    x: 2,
    y: 2,
    blur: 0,
    color: "black",
    opacity: 1,
  });
  assert.equal(parsed.styles?.base?.textShadow, undefined);
});

test("a literal fontFamily overrides the theme role, and presets stay on roles", () => {
  const parsed = captionClassicDef.schema.parse({
    lines: [{ text: "hello" }],
    styles: { base: { fontRole: "body", fontFamily: "'Arial Rounded MT Bold', sans-serif" } },
  }) as { styles?: { base?: { fontFamily?: unknown; fontRole?: unknown } } };
  assert.equal(parsed.styles?.base?.fontFamily, "'Arial Rounded MT Bold', sans-serif");
  // Both survive parsing: the resolver picks, the schema does not. Keeping the
  // role means dropping the literal falls back to the theme instead of to none.
  assert.equal(parsed.styles?.base?.fontRole, "body");
  // The escape is for callers copying a reference look. A preset that hardcoded
  // a face would make the theme unable to rebrand its own captions.
  for (const [name, preset] of Object.entries(CAPTION_PRESETS)) {
    for (const [state, style] of Object.entries(preset.styles)) {
      assert.equal(
        (style as { fontFamily?: string }).fontFamily,
        undefined,
        `preset ${name}.${state} must not hardcode a font family`,
      );
    }
  }
});

test("a word mark can name a caller-defined style", () => {
  const parsed = captionClassicDef.schema.parse({
    styles: { words: { shout: { colorRole: "accent", scale: 1.2 } } },
    track: {
      cues: [
        {
          words: [
            { text: "read", start: 0, end: 0.4 },
            { text: "this", start: 0.4, end: 0.9, marks: ["shout"] },
          ],
        },
      ],
    },
  }) as { styles?: { words?: Record<string, unknown> } };
  assert.deepEqual(parsed.styles?.words?.shout, { colorRole: "accent", scale: 1.2 });
});

test("an unknown word mark fails validation instead of rendering unstyled", () => {
  // The whole point: an undefined mark and a working mark look identical on
  // screen, so the typo has to surface here or it never surfaces at all.
  assert.throws(
    () =>
      captionClassicDef.schema.parse({
        track: {
          cues: [{ words: [{ text: "oops", start: 0, end: 0.4, marks: ["shout"] }] }],
        },
      }),
    (error: unknown) => {
      // ZodError stringifies as JSON, so the quotes around the name arrive
      // escaped. Match the parts, not the punctuation.
      const message = String(error);
      assert.match(message, /Unknown word mark/);
      assert.match(message, /shout/);
      assert.match(message, /oops/);
      return true;
    },
  );
});

test("extrude takes a direction and fills the rest", () => {
  const parsed = captionClassicDef.schema.parse({
    lines: [{ text: "hello" }],
    styles: { base: { extrude: { x: 14, y: 18 } } },
  }) as { styles?: { base?: { extrude?: unknown } } };
  assert.deepEqual(parsed.styles?.base?.extrude, { x: 14, y: 18, color: "black" });
});

test("logo schema publishes real-mark and compact-mode controls", () => {
  const rows = schemaRows(logoStingDef.schema);
  assert.ok(rows.some((row) => row.name === "logo" && row.type === "text"));
  assert.ok(rows.some((row) => row.name === "showName" && row.type === "true / false"));
});

test("Quote Card pull-out starts with its entrance", () => {
  assert.equal(quoteCardDef.demoCamera?.preset, "pull-out");
  assert.equal(quoteCardDef.demoCamera?.time?.start, 0);
});

test("Tweet Card pull-out starts at four seconds and runs through clip end", () => {
  assert.equal(tweetCardDef.demoCamera?.preset, "pull-out");
  assert.equal(tweetCardDef.demoCamera?.time?.start, 4);
  assert.equal(tweetCardDef.demoCamera?.time?.duration, tweetCardDef.demoDurationSec - 4);
});

test("Blur Focus Text reveals for three seconds then pulls out through second five", () => {
  assert.equal(blurFocusTextDef.demoDurationSec, 5);
  assert.equal(blurFocusTextDef.demoTime?.appear, 3);
  assert.equal(blurFocusTextDef.demoCamera?.preset, "pull-out");
  assert.equal(blurFocusTextDef.demoCamera?.amount, 0.04);
  assert.equal(blurFocusTextDef.demoCamera?.time?.start, 3);
  assert.equal(blurFocusTextDef.demoCamera?.time?.duration, 2);
});

test("sticker border is off unless asked for, and defaults to a white edge", () => {
  const plain = stickerDef.schema.parse({ src: "pickle" }) as { border?: unknown };
  assert.equal(plain.border, undefined);

  const outlined = stickerDef.schema.parse({ src: "pickle", border: { width: 8 } }) as {
    border?: { width: number; color: string };
  };
  assert.deepEqual(outlined.border, { width: 8, color: "white" });
});

test("sticker border color takes a brand token or a hex literal", () => {
  const token = stickerDef.schema.parse({
    src: "pickle",
    border: { width: 4, color: "accent" },
  }) as { border?: { color?: string } };
  assert.equal(token.border?.color, "accent");

  const hex = stickerDef.schema.parse({
    src: "pickle",
    border: { width: 4, color: "#ff0066" },
  }) as { border?: { color?: string } };
  assert.equal(hex.border?.color, "#ff0066");

  assert.throws(() =>
    stickerDef.schema.parse({ src: "pickle", border: { width: 4, color: "not-a-color" } }),
  );
});

test("the renderer parses its own props, so defaults reach the frames", () => {
  // The exact spec shape that rendered a motionless sticker: `motion` written
  // by hand, without the `seed` and `rampSec` the schema supplies. Undefined
  // reached the envelope, the transform came out translate(NaN%, NaN%), and
  // invalid CSS keeps the previous value, so nothing moved and no error said so.
  const raw = {
    version: 1,
    format: "horizontal",
    fps: 24,
    durationSec: 4,
    source: { type: "none" },
    overlays: [
      {
        template: "sticker",
        region: { x: 60, y: 20, w: 24, h: 40 },
        time: { start: "0s", duration: "4s" },
        motion: { style: "shake", amount: 0.4 },
        props: { src: "pickle" },
      },
    ],
  };

  const result = parsedMetadata({ props: { spec: raw, theme: PRESET_THEMES[0] } as never });
  const overlay = (result.props.spec as { overlays: { motion?: Record<string, unknown>; props: Record<string, unknown> }[] })
    .overlays[0];

  assert.equal(typeof overlay.motion?.seed, "number");
  assert.equal(typeof overlay.motion?.rampSec, "number");
  // Template prop defaults ride the same gate: seven templates never re-parse
  // their own props, so this is the only thing standing between them and
  // undefined at render time.
  assert.equal(overlay.props.shadow, "drop");
  assert.equal(overlay.props.sizePct, 100);
  // Metadata has to follow the PARSED spec, or a default that decides duration
  // disagrees with the frames that were rendered.
  assert.equal(result.durationInFrames, 96);
  assert.equal(result.fps, 24);
});
