import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  AGENT_CAPABILITIES,
  AGENT_DOCS,
  AGENT_GUIDE,
  AGENT_POLICY_VERSION,
  EDITORIAL_DEFAULTS,
  INTAKE,
} from "../src/agent/policy";
import { generate, currentTarget } from "../scripts/build-agent-guide.mts";

const root = join(import.meta.dirname, "..");
const doc = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

/**
 * Markdown is hard-wrapped, so a rule can be true and still fail a literal
 * match because a line break landed mid-sentence. Match on the words instead:
 * these tests are here to catch a rule being deleted, not a paragraph being
 * reflowed.
 */
const phrase = (text: string) =>
  new RegExp(text.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"));

const CAPTIONS = doc(AGENT_DOCS.features.captions.doc);
const CUTOUT = doc(AGENT_DOCS.features["background-removal"].doc);
const TRACKING = doc(AGENT_DOCS.features.tracking.doc);
const MUSIC = doc(AGENT_DOCS.features.music.doc);

test("canonical agent policy requires cut-first forced subtitle alignment", () => {
  assert.equal(AGENT_POLICY_VERSION, 12);
  assert.equal(EDITORIAL_DEFAULTS.captions.lockCutsBeforeAlignment, true);
  assert.equal(EDITORIAL_DEFAULTS.captions.alignAgainst, "final-cut-audio");
  assert.equal(EDITORIAL_DEFAULTS.captions.verifyTranscriptCopy, true);
  assert.equal(EDITORIAL_DEFAULTS.captions.maxDeliveryAudioOffsetSec, 0.02);
  assert.equal(EDITORIAL_DEFAULTS.captions.trackTimebase, "composition");
  assert.deepEqual(EDITORIAL_DEFAULTS.captions.highlight, {
    mode: "word",
    duringGaps: "none",
    badgeMarginX: 6,
  });
  assert.equal(EDITORIAL_DEFAULTS.captions.maxWordsPerCue, 4);
  assert.deepEqual(EDITORIAL_DEFAULTS.captions.preferredWordsPerPhrase, [2, 4]);
  assert.equal(EDITORIAL_DEFAULTS.captions.outlineLetters, "black");
  assert.equal(EDITORIAL_DEFAULTS.captions.case, "as-spoken");
  assert.equal(EDITORIAL_DEFAULTS.captions.punctuation, "keep");
});

test("captions have one route and it never runs on transcriber timestamps", () => {
  assert.equal(EDITORIAL_DEFAULTS.captions.alignment, "forced-phoneme-or-ctc");
  assert.equal(EDITORIAL_DEFAULTS.captions.rejectTranscriberTimestamps, true);
  assert.equal(EDITORIAL_DEFAULTS.captions.alignerTool, "scripts/align-words.py");
  assert.equal(EDITORIAL_DEFAULTS.captions.captionPropsTool, "scripts/build-caption-props.py");
  assert.equal(EDITORIAL_DEFAULTS.captions.syncCheckTool, "scripts/check-caption-sync.py");
  assert.deepEqual(EDITORIAL_DEFAULTS.captions.alignmentBackends, ["mms_fa", "whisperx"]);
  assert.equal(
    AGENT_CAPABILITIES.required.wordTranscription.timingSource,
    "forced-phoneme-or-ctc-aligner",
  );
  assert.deepEqual(AGENT_CAPABILITIES.required.wordTranscription.rejects, [
    "asr-segment-timestamps",
    "asr-token-timestamps",
    "evenly-divided-words",
  ]);
});

test("canonical agent policy keeps the speaker as the one base source", () => {
  assert.equal(EDITORIAL_DEFAULTS.composedFrame.baseSourceIsTheSpeaker, true);
  assert.equal(EDITORIAL_DEFAULTS.composedFrame.baseSourceChosenByAudio, true);
  assert.equal(EDITORIAL_DEFAULTS.composedFrame.backgroundMediaTravelsInProps, true);
  assert.equal(EDITORIAL_DEFAULTS.composedFrame.preferTrackAsPropsOverBakedCrop, true);
  assert.equal(EDITORIAL_DEFAULTS.composedFrame.supplyLoopLengthForShortPlates, true);
  assert.deepEqual(AGENT_CAPABILITIES.conditional.faceTrack.returns, [
    "per-frame-face-center-and-size",
    "normalized-top-left-coordinates",
    "detection-count-and-misses",
    "smoothing-parameters",
  ]);
});

test("canonical agent policy makes the cutout outline opt-in", () => {
  assert.equal(EDITORIAL_DEFAULTS.personCutout.outline, "none");
  assert.equal(EDITORIAL_DEFAULTS.personCutout.outlineIsOptIn, true);
  assert.equal(EDITORIAL_DEFAULTS.personCutout.askBackdropAndOutlineTogether, true);
  assert.equal(EDITORIAL_DEFAULTS.personCutout.softAlphaNotBinaryCutout, true);
  assert.equal(EDITORIAL_DEFAULTS.personCutout.foregroundRgbFromColorManagedSource, true);
  assert.deepEqual(EDITORIAL_DEFAULTS.personCutout.backdropOptions, [
    "transparent",
    "color",
    "blur",
    "media",
  ]);
  assert.ok(
    EDITORIAL_DEFAULTS.clarification.askWhen.includes(
      "a-cutout-was-requested-without-a-backdrop-or-an-outline-decision",
    ),
  );
  assert.equal(
    AGENT_CAPABILITIES.conditional.personCutout.useWhen,
    "the user asked for the background removed, replaced or pushed back",
  );
});

test("canonical agent policy preserves source color unless explicitly requested", () => {
  assert.equal(EDITORIAL_DEFAULTS.sourceFidelity.preservePerceivedColorUnlessRequested, true);
  assert.equal(EDITORIAL_DEFAULTS.sourceFidelity.creativeColorChangesRequireExplicitRequest, true);
  assert.equal(EDITORIAL_DEFAULTS.sourceFidelity.forbidHdrRetaggedAsSdr, true);
  assert.equal(EDITORIAL_DEFAULTS.qa.compareSourceAndDeliveryColor, true);
  assert.deepEqual(AGENT_CAPABILITIES.conditional.mediaNormalization.returns, [
    "editor-friendly-proxy",
    "unchanged-original-reference",
    "color-transform-parameters",
    "perceptual-match-checkpoints",
  ]);
});

test("the intake gate asks from facts, and every question carries a default", () => {
  assert.equal(INTAKE.round.max, 1);
  assert.equal(INTAKE.round.maxQuestions, 3);
  assert.equal(INTAKE.round.tool, "scripts/check-intake.py");
  assert.equal(INTAKE.round.recordIn, "editDecisionPlan.clarifications");

  const checks = [...INTAKE.sourceChecks, ...INTAKE.requestChecks];
  const verdicts = new Set(["blocking", "ask", "checkpoint", "default"]);
  const ids = new Set<string>();

  for (const check of checks) {
    assert.ok(verdicts.has(check.verdict), `${check.id} has an unknown verdict`);
    assert.ok(check.why.length > 0, `${check.id} does not say why it exists`);
    assert.ok(!ids.has(check.id), `${check.id} is declared twice`);
    ids.add(check.id);

    // A question with no question is a checkpoint wearing the wrong verdict,
    // and the round budget then counts something the user never sees.
    if (check.verdict === "ask") {
      assert.ok("question" in check && check.question.length > 0, `${check.id} asks nothing`);
    }
    if (check.verdict === "checkpoint") {
      assert.ok("show" in check, `${check.id} is a checkpoint that shows nothing`);
    }
    if (check.verdict === "default") {
      assert.ok("choose" in check, `${check.id} defaults to nothing`);
    }
  }

  // The three findings that stop an edit outright, each because the missing
  // thing cannot be invented: speech, a real logo, and asset rights.
  const blocking = checks.filter((c) => c.verdict === "blocking").map((c) => c.id);
  assert.deepEqual(blocking.sort(), [
    "b-roll-without-media",
    "brand-without-assets",
    "captions-without-speech",
  ]);
});

/**
 * The contract is one text now: read from disk as a page, exported as a string
 * for a harness that prompts with it, and the generator is what keeps those two
 * the same words. A stale generated module is the exact drift this replaced, so
 * it fails the suite.
 */
test("the served guide is the playbook, regenerated", () => {
  assert.equal(
    currentTarget(),
    generate(),
    "src/agent/guide.generated.ts is stale: run `npm run agent:guide`",
  );
  assert.match(AGENT_GUIDE, /^OverlayMotion agent contract v12\n\n# Editing agent playbook/);
});

test("the contract carries the rules that apply to every edit", () => {
  // Each of these is a default an agent gets wrong when left to its own
  // judgement, so each one stays in the always-read page rather than moving to
  // a feature page an agent may not open.
  assert.match(AGENT_GUIDE, phrase("captions have exactly one route"));
  assert.match(AGENT_GUIDE, phrase("Timing comes from forced alignment, never from a transcriber"));
  assert.match(AGENT_GUIDE, phrase("A cue carries at most 4 words"));
  assert.match(AGENT_GUIDE, phrase("letters carry a black outline"));
  assert.match(AGENT_GUIDE, phrase("one base `source` and it is the speaker"));
  assert.match(AGENT_GUIDE, phrase("travel in props"));
  assert.match(AGENT_GUIDE, phrase("Preserve the source's perceived color and audio"));
  assert.match(AGENT_GUIDE, phrase("retag HDR footage as SDR"));
  assert.match(AGENT_GUIDE, phrase("unexplained shift is not approved"));
  assert.match(AGENT_GUIDE, /scripts\/check-intake\.py/);
  assert.match(AGENT_GUIDE, phrase("at most three questions"));
  assert.match(AGENT_GUIDE, phrase("rejects a plan carrying an unanswered blocking question"));
  assert.match(AGENT_GUIDE, phrase("Keyframes, rotation and `crop` are not; do not author them"));
});

/**
 * The whole point of the split: a caption job must not be paying for the
 * matting page. The contract stays short by routing, so the routing has to be
 * real, complete and reachable from the page an agent actually reads.
 */
test("every feature page exists and the contract routes to it", () => {
  const pages = [AGENT_DOCS.contract, AGENT_DOCS.grammar, AGENT_DOCS.toolkit];
  for (const relativePath of pages) {
    assert.ok(existsSync(join(root, relativePath)), `${relativePath} is missing`);
  }

  for (const [name, feature] of Object.entries(AGENT_DOCS.features)) {
    assert.ok(existsSync(join(root, feature.doc)), `${feature.doc} is missing`);
    assert.ok(feature.when.length > 0, `${name} does not say when to open it`);
    // The playbook's routing table is what a file-reading agent follows, so a
    // page nobody links to is a page nobody opens.
    const linkTarget = feature.doc.replace(/^docs\//, "");
    assert.ok(
      AGENT_GUIDE.includes(`(${linkTarget})`),
      `the playbook does not link to ${feature.doc}`,
    );
  }
});

test("feature pages keep the rules that were moved out of the contract", () => {
  assert.match(CAPTIONS, phrase("refuse input that does not name a forced aligner"));
  assert.match(CAPTIONS, phrase('styles.buzzword.fontRole: "serif"'));
  assert.match(CAPTIONS, phrase("`instant`, `fade`, `fade-up`, `pop` and `word-by-word`"));
  assert.match(CAPTIONS, phrase("no more than 20ms"));
  assert.match(CAPTIONS, phrase("Lock every source cut before final caption timing"));

  assert.match(CUTOUT, phrase("The outline defaults to off"));
  assert.match(CUTOUT, phrase("as **one** question before matting starts"));
  assert.match(CUTOUT, phrase("soft alpha matte, not a binary cutout"));

  assert.match(TRACKING, phrase("Prefer a tracker that emits data"));
  assert.match(TRACKING, phrase("never a second source"));

  assert.match(MUSIC, phrase("15 to 20 LU below"));
  assert.match(MUSIC, phrase("rejects anything above `MUSIC_BED_MAX_VOLUME_UNDER_SPEECH` (0.3)"));
});
