import assert from "node:assert/strict";
import { test } from "node:test";
import { EDIT_PLAN_EXAMPLE } from "../src/agent/policy";
import { validateEditDecisionPlan } from "../src/agent/edit-plan";
import { validateSpec } from "../src/spec/validate";
import {
  MUSIC_BED_DEFAULT_VOLUME,
  MUSIC_BED_MAX_VOLUME_UNDER_SPEECH,
} from "../src/spec/types";

test("canonical edit-plan example validates", () => {
  const result = validateEditDecisionPlan(EDIT_PLAN_EXAMPLE);
  assert.equal(result.success, true);
});

test("clarifications require two or three concrete choices", () => {
  const result = validateEditDecisionPlan({
    ...EDIT_PLAN_EXAMPLE,
    clarifications: [
      {
        question: "Which template?",
        reason: "multiple-valid-templates",
        blocking: true,
        options: [{ id: "speaker-card", label: "Speaker Card" }],
        resolution: "deferred",
      },
    ],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues[0].path.join("."), "clarifications.0.options");
  }
});

const clarification = (overrides: Record<string, unknown>) => ({
  question: "Whose framing wins in the crop?",
  reason: "ambiguous-destructive-edit",
  blocking: false,
  options: [
    { id: "center", label: "Keep the speaker centered" },
    { id: "track", label: "Follow the speaker with a tracked crop" },
  ],
  resolution: "defaulted",
  selectedOptionId: "center",
  ...overrides,
});

test("a blocking question cannot reach the render unanswered", () => {
  for (const resolution of ["defaulted", "deferred"]) {
    const result = validateEditDecisionPlan({
      ...EDIT_PLAN_EXAMPLE,
      clarifications: [clarification({ blocking: true, resolution })],
    });
    assert.equal(result.success, false, `${resolution} passed while blocking`);
    if (!result.success) {
      assert.equal(result.error.issues[0].path.join("."), "clarifications.0.resolution");
    }
  }

  const answered = validateEditDecisionPlan({
    ...EDIT_PLAN_EXAMPLE,
    clarifications: [clarification({ blocking: true, resolution: "answered", selectedOptionId: "track" })],
  });
  assert.equal(answered.success, true);
});

test("an answered question names the option that was chosen, and it exists", () => {
  const unnamed = validateEditDecisionPlan({
    ...EDIT_PLAN_EXAMPLE,
    clarifications: [clarification({ resolution: "answered", selectedOptionId: undefined })],
  });
  assert.equal(unnamed.success, false);

  const invented = validateEditDecisionPlan({
    ...EDIT_PLAN_EXAMPLE,
    clarifications: [clarification({ selectedOptionId: "letterbox" })],
  });
  assert.equal(invented.success, false);
  if (!invented.success) {
    assert.match(invented.error.issues[0].message, /not one of the options offered/);
  }
});

test("the intake round is one round: at most three questions stay open", () => {
  const open = (id: string) => clarification({ resolution: "deferred", selectedOptionId: undefined, question: id });
  const result = validateEditDecisionPlan({
    ...EDIT_PLAN_EXAMPLE,
    clarifications: [open("a"), open("b"), open("c"), open("d")],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.issues.at(-1)!.message, /Ask at most three/);
  }
});

test("source reframes normalize defaults", () => {
  const result = validateSpec({
    version: 1,
    durationSec: 10,
    source: {
      type: "video",
      src: "talk.mp4",
      reframes: [
        {
          time: { start: "2s", duration: "3s" },
          region: { x: 4, y: 8, w: 44, h: 84 },
        },
      ],
    },
    overlays: [{ template: "b-roll", props: { src: "image.png", kind: "image" } }],
  });
  assert.equal(result.success, true);
});

test("overlapping source reframes fail with an actionable path", () => {
  const result = validateSpec({
    version: 1,
    durationSec: 10,
    source: {
      type: "video",
      src: "talk.mp4",
      reframes: [
        { time: { start: "1s", duration: "4s" }, region: { x: 0, y: 0, w: 50, h: 100 } },
        { time: { start: "3s", duration: "3s" }, region: { x: 50, y: 0, w: 50, h: 100 } },
      ],
    },
    overlays: [{ template: "caption-classic", props: { lines: [{ text: "Hello" }] } }],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues[0].path.join("."), "source.reframes.1.time");
    assert.match(result.error.issues[0].message, /may not overlap/);
  }
});

test("a real logo path is accepted by logo-sting", () => {
  const result = validateSpec({
    version: 1,
    durationSec: 4,
    source: { type: "none" },
    overlays: [
      { template: "logo-sting", props: { logo: "/brand/mark.png", name: "Acme" } },
    ],
  });
  assert.equal(result.success, true);
});

test("an edit window may not silently extend past the composition", () => {
  const result = validateSpec({
    version: 1,
    durationSec: 4,
    source: { type: "none" },
    overlays: [
      { template: "logo-sting", time: { start: "3s", duration: "3s" }, props: {} },
    ],
  });
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error.issues[0].message, /past the composition/);
});

test("template props fail during spec validation instead of React render", () => {
  const result = validateSpec({
    version: 1,
    durationSec: 4,
    source: { type: "video", src: "talk.mp4" },
    overlays: [
      { template: "caption-classic", props: { lines: "not-an-array" } },
    ],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues[0].path.join("."), "overlays.0.props.lines");
  }
});

test("caption track supports no highlighting and serif buzzwords", () => {
  const result = validateSpec({
    version: 1,
    durationSec: 4,
    source: { type: "video", src: "talk.mp4" },
    overlays: [
      {
        template: "caption-classic",
        props: {
          preset: "editorial",
          highlight: { mode: "none" },
          appearance: { mode: "word-by-word", durationSec: 0.12, distance: 10 },
          styles: { buzzword: { fontRole: "serif", fontStyle: "italic" } },
          track: {
            cues: [
              {
                start: 0,
                end: 1,
                words: [
                  { text: "OverlayMotion", start: 0, end: 1, marks: ["buzzword"] },
                ],
              },
            ],
          },
        },
      },
    ],
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(
      (result.data.overlays[0].props.track as { timebase: string }).timebase,
      "composition",
    );
  }
});

test("caption cues reject mixed timing modes", () => {
  const result = validateSpec({
    version: 1,
    durationSec: 4,
    source: { type: "video", src: "talk.mp4" },
    overlays: [
      {
        template: "caption-classic",
        props: {
          lines: [
            { text: "Timed", start: 0, end: 1 },
            { text: "Untimed" },
          ],
        },
      },
    ],
  });
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error.issues[0].message, /may not mix/);
});

const musicSpec = (music: Record<string, unknown>, source?: Record<string, unknown>) => ({
  version: 1,
  durationSec: 10,
  source: source ?? { type: "video", src: "talk.mp4" },
  music,
  overlays: [{ template: "b-roll", props: { src: "image.png", kind: "image" } }],
});

test("a music bed defaults to a gain that cannot bury a voice", () => {
  const result = validateSpec(musicSpec({ src: "bed.wav" }));
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.music?.volume, MUSIC_BED_DEFAULT_VOLUME);
    assert.ok(result.data.music!.volume <= MUSIC_BED_MAX_VOLUME_UNDER_SPEECH);
    // Fades are the other half of "not a mistake": a bed that cuts in at full
    // gain reads wrong even when the level is right.
    assert.ok(result.data.music!.fadeInSec > 0);
    assert.ok(result.data.music!.fadeOutSec > 0);
    assert.equal(result.data.music!.loop, false);
  }
});

test("a loud music bed over unmuted speech fails at the gate", () => {
  const result = validateSpec(musicSpec({ src: "bed.wav", volume: 1 }));
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues[0].path.join("."), "music.volume");
    assert.match(result.error.issues[0].message, /ebur128/);
  }
});

test("the ceiling lifts when no source audio competes with the music", () => {
  const muted = validateSpec(
    musicSpec({ src: "bed.wav", volume: 1 }, { type: "video", src: "talk.mp4", muted: true }),
  );
  assert.equal(muted.success, true);
});

test("a resting zoom is rejected on a preset that does not zoom", () => {
  const result = validateSpec({
    version: 1,
    durationSec: 10,
    source: { type: "video", src: "talk.mp4", camera: { preset: "pan-left", amount: 0.2, rest: 0.1 } },
    overlays: [{ template: "b-roll", props: { src: "image.png", kind: "image" } }],
  });
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error.issues[0].message, /does not zoom/);
});

test("a camera cannot rest further in than its own move reaches", () => {
  const result = validateSpec({
    version: 1,
    durationSec: 10,
    source: { type: "video", src: "talk.mp4", camera: { preset: "pull-out", amount: 0.1, rest: 0.3 } },
    overlays: [{ template: "b-roll", props: { src: "image.png", kind: "image" } }],
  });
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error.issues[0].message, /exceeds amount/);
});
