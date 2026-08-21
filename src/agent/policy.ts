/**
 * Stable machine-readable defaults for an OverlayMotion editing agent.
 * Keep this concise; the reasoning and examples live in docs/agent-playbook.md.
 */
import { AGENT_PLAYBOOK } from "./guide.generated";

export const AGENT_POLICY_VERSION = 12 as const;

export const EDITORIAL_DEFAULTS = {
  decisionOrder: [
    "explicit-user-request",
    "observable-source-evidence",
    "subject-and-message-safety",
    "brand-and-platform-defaults",
    "decorative-style",
  ],
  captions: {
    enabledForSpokenVideo: true,
    template: "caption-classic",
    preset: "classic",
    trackTimebase: "composition",
    timing: "word",
    highlight: { mode: "word", duringGaps: "none", badgeMarginX: 6 },
    appearance: { mode: "instant", durationSec: 0.18, distance: 18, staggerSec: 0.07 },
    semanticWordMarks: ["buzzword", "emphasis"],
    lockCutsBeforeAlignment: true,
    alignment: "forced-phoneme-or-ctc",
    alignAgainst: "final-cut-audio",
    verifyTranscriptCopy: true,
    // Captions have one route. A transcriber answers "what was said"; only an
    // aligner answers "when", and answering the first question quickly is what
    // made the wrong tool look like the right one.
    alignerTool: "scripts/align-words.py",
    captionPropsTool: "scripts/build-caption-props.py",
    syncCheckTool: "scripts/check-caption-sync.py",
    rejectTranscriberTimestamps: true,
    alignmentBackends: ["mms_fa", "whisperx"],
    phrasePrerollSec: 0.08,
    phraseHoldMaxSec: 0.18,
    maxDeliveryAudioOffsetSec: 0.02,
    preserveSilentGaps: true,
    maxLines: 2,
    // A ceiling, not a target. The agent still phrases each cue; the cap only
    // decides when a phrase has to break.
    maxWordsPerCue: 4,
    preferredWordsPerPhrase: [2, 4],
    maxCharactersPerLine: 32,
    // Subtitles do not get to choose what is behind them, so legibility comes
    // from the letters themselves rather than from the footage cooperating.
    outlineLetters: "black",
    // Display-only rewriting, off unless asked: the drawn copy stays the
    // spoken copy.
    case: "as-spoken",
    punctuation: "keep",
  },
  sourceFidelity: {
    preservePerceivedColorUnlessRequested: true,
    creativeColorChangesRequireExplicitRequest: true,
    preserveColorMetadataWhenSupported: true,
    forbidHdrRetaggedAsSdr: true,
    requireColorManagedTransformWhenConversionIsUnavoidable: true,
    compareSourceAndDeliveryFrames: true,
    reportUnavoidableColorConversion: true,
  },
  composedFrame: {
    // A spec has one base source and it is the speaker, because it is the one
    // whose audio survives to delivery. Inverting that to make a screen
    // recording the source is what loses the voice the edit exists for.
    baseSourceIsTheSpeaker: true,
    baseSourceChosenByAudio: true,
    backgroundMediaTravelsInProps: true,
    // A track is data. Baking it into a proxy welds one framing decision shut.
    preferTrackAsPropsOverBakedCrop: true,
    bakeTrackWhenItFramesTheWholeDelivery: true,
    supplyLoopLengthForShortPlates: true,
  },
  personCutout: {
    // Segmentation stays preprocessing: it produces the spec's video source,
    // and Edit Spec v1 still expresses none of it.
    outline: "none",
    outlineIsOptIn: true,
    // "Remove the background" names what leaves, never what arrives, and an
    // outline is a second choice hiding inside the same sentence. Both are
    // cheap to ask once and expensive to guess: each answer re-renders.
    askBackdropAndOutlineTogether: true,
    backdropOptions: ["transparent", "color", "blur", "media"],
    softAlphaNotBinaryCutout: true,
    foregroundRgbFromColorManagedSource: true,
    expandPx: 1.5,
    featherPx: 1.15,
    inferenceShortSidePx: 512,
    resetRecurrentStateAtCuts: true,
    compositeAtDeliveryResolution: true,
  },
  protectedSubjects: {
    detect: ["face", "mouth", "eyes", "active-hand", "demonstrated-object"],
    facePaddingPct: 6,
    gesturePaddingPct: 4,
    preferReframeOverOcclusion: true,
  },
  gesturePlacement: {
    sampleBeforeSec: 0.35,
    sampleAfterSec: 0.65,
    overlayOffsetPct: 3,
    trackOnlyWhenAnchorMoves: true,
  },
  qa: {
    previewBeforeFullRender: true,
    inspectEntranceMiddleExit: true,
    inspectEverySpatialEdit: true,
    inspectEverySemanticEdit: true,
    fullPlaybackOnce: true,
    compareDeliveryAudioZeroPoint: true,
    compareSourceAndDeliveryColor: true,
  },
  uncertainty: {
    safeToAssume: [
      "caption-style",
      "conservative-motion",
      "subject-safe-placement",
      "shortest-faithful-copy",
    ],
    verifyOrAsk: [
      "identity",
      "factual-claim",
      "quote-wording-or-attribution",
      "unlicensed-asset",
      "ambiguous-destructive-cut",
    ],
  },
  clarification: {
    askWhen: [
      "required-input-is-missing",
      "multiple-valid-templates-have-meaningfully-different-results",
      "choice-could-change-meaning-rights-or-a-destructive-cut",
      "a-cutout-was-requested-without-a-backdrop-or-an-outline-decision",
    ],
    defaultWhen: [
      "choice-is-reversible",
      "one-option-is-clearly-safer-from-source-evidence",
      "difference-is-only-decorative-style",
    ],
    presentation: {
      maxOptions: 3,
      includeTemplateSlug: true,
      templatePreviewPath: "/templates/{slug}",
      explainTradeoffInOneSentence: true,
    },
  },
} as const;

/**
 * The intake gate: what to check before the edit, and what to do about each
 * finding. Every entry is derived from a fact about the file or from the
 * request read against the assets actually supplied, because a question the
 * source already answers is noise and trains the user to skip the round.
 *
 * `verdict` is the whole design:
 *   blocking    stop, the edit cannot be finished as asked;
 *   ask         one question, options, a default already chosen;
 *   checkpoint  do not ask, show something cheap and keep going;
 *   default     do not ask, choose the safer option and record it.
 *
 * `scripts/check-intake.py` runs the source half of this list and prints the
 * findings. The list is the contract; the script is how it stops depending on
 * an agent remembering it at the end of a long session.
 */
export const INTAKE = {
  round: {
    /** One round, before the plan. Never interview the user twice. */
    max: 1,
    maxQuestions: 3,
    everyQuestionCarriesADefault: true,
    silenceMeans: "apply-the-default-and-report-it",
    tool: "scripts/check-intake.py",
    recordIn: "editDecisionPlan.clarifications",
  },

  /** Answered by probing the file. Facts, not opinions. */
  sourceChecks: [
    {
      id: "captions-without-speech",
      probe: "audio streams, then speech presence",
      when: "captions requested and the source carries no audible speech",
      verdict: "blocking",
      why: "forced alignment has nothing to align, and the failure would otherwise surface after the cuts, with audio already exported",
    },
    {
      id: "long-source-short-platform",
      probe: "duration against the requested platform",
      when: "source runs past a few minutes and the request names a short-form platform",
      verdict: "ask",
      question: "One continuous cut of the whole thing, or a highlight selection?",
      why: "no preview answers it and the answer changes every later decision",
    },
    {
      id: "reframe-drops-a-protected-subject",
      probe: "source dimensions against the requested format, with face positions",
      when: "the requested aspect crops a face or an active hand out of frame",
      verdict: "ask",
      question: "Whose framing wins in the crop?",
      why: "a reframe that cuts the speaker is a redo, and the source cannot say which subject matters",
    },
    {
      id: "reframe-is-safe",
      probe: "source dimensions against the requested format",
      when: "the requested aspect crops nothing protected",
      verdict: "default",
      choose: "center-weighted reframe, reported in the plan",
      why: "the crop takes nothing the edit promised to protect, so there is nothing to decide",
    },
    {
      id: "multiple-speakers",
      probe: "audio channels and voice changes",
      when: "more than one voice carries the talk",
      verdict: "ask",
      question: "Caption every speaker, or only the main one?",
      why: "it also decides who counts as a protected subject",
    },
    {
      id: "hdr-source",
      probe: "color transfer and primaries",
      when: "the source is HDR",
      verdict: "checkpoint",
      show: "one frame through the delivery transform, next to the source frame",
      why: "the color path must be chosen and verified, never retagged quietly",
    },
    {
      id: "no-room-for-a-second-frame",
      probe: "source aspect against the requested layout",
      when: "a split screen, picture-in-picture or side b-roll is requested over a vertical source",
      verdict: "ask",
      question: "Cover part of the speaker, or cut away to the second frame?",
      why: "the layout does not fit, and both answers are legitimate edits",
    },
    {
      id: "source-already-has-music",
      probe: "audio content under the speech",
      when: "a music bed is requested and the source already carries one",
      verdict: "ask",
      question: "Keep the music that is already in the take, or replace it?",
      why: "two beds stack, and the 0.3 ceiling only governs the one this library adds",
    },
    {
      id: "audio-is-clipping-or-too-quiet",
      probe: "peak and mean level",
      when: "the source peaks into clipping or sits far below speech level",
      verdict: "checkpoint",
      show: "the measured levels, and the correction to be applied",
      why: "the render inherits the defect and the tool takes the blame",
    },
    {
      id: "vertical-source-horizontal-request",
      probe: "source dimensions against the requested format",
      when: "a vertical source is asked to fill a horizontal frame",
      verdict: "ask",
      question: "Pillarbox the source, or fill the sides with a blurred plate?",
      why: "both are common and they look nothing alike",
    },
  ],

  /** The request read against the assets actually supplied. */
  requestChecks: [
    {
      id: "brand-without-assets",
      when: "brand or logo treatment is requested and no brand asset was supplied",
      verdict: "blocking",
      why: "a real logo is never fabricated, at any confidence",
    },
    {
      id: "b-roll-without-media",
      when: "specific b-roll is requested and no media or license accompanies it",
      verdict: "blocking",
      why: "every asset in the plan carries provenance; there is nothing to record",
    },
    {
      id: "captions-without-verified-copy",
      when: "captions are requested and no human has checked the wording",
      verdict: "checkpoint",
      show: "the drafted transcript, for approval before alignment",
      why: "a wrong word is invisible until the finished video, which is the most expensive place to find it",
    },
    {
      id: "subjective-destructive-cut",
      when: "the request is to cut boring, slow or unnecessary parts",
      verdict: "checkpoint",
      show: "the cut list with timestamps, before rendering",
      why: "destructive and subjective, but a list answers it faster than a question does",
    },
    {
      id: "cutout-without-a-backdrop",
      when: "background removal is requested without saying what arrives behind the subject",
      verdict: "ask",
      question: "What sits behind the cutout, and does it get an outline?",
      why: "each answer re-renders, and asking twice costs two renders",
    },
    {
      id: "vague-quality-request",
      when: "the request is punchier, more dynamic, more viral, or similar",
      verdict: "default",
      choose: "the weak-prompt default edit, reported line by line",
      why: "there is no answer to collect, only work to show",
    },
  ],

  /** Asking these is how a gate turns into a form nobody reads. */
  neverAsk: [
    "anything the file already answers",
    "anything a cheap preview answers faster",
    "a reversible or purely decorative choice",
    "aspect ratio when the request named no platform: keep the source shape",
    "a question already answered in this session",
  ],
} as const;

/** Capability contracts: implementations may be local, hosted or human-assisted. */
export const AGENT_CAPABILITIES = {
  required: {
    mediaProbe: {
      accepts: "source media",
      returns: ["duration", "dimensions", "rotation", "fps", "codec", "color", "audio-streams"],
    },
    wordTranscription: {
      accepts: "final cut-only speech audio plus verified transcript copy",
      returns: [
        "language",
        "segments",
        "forced-aligned-words-with-start-end",
        "confidence",
        "delivery-audio-offset",
      ],
      // Named separately because one implementation can satisfy the first half
      // of this contract and silently fail the half that captions depend on.
      timingSource: "forced-phoneme-or-ctc-aligner",
      rejects: ["asr-segment-timestamps", "asr-token-timestamps", "evenly-divided-words"],
    },
    frameSampler: {
      accepts: "media plus timestamps",
      returns: ["contact-sheet", "full-resolution-checkpoint-frames"],
    },
    visualInspection: {
      accepts: "checkpoint frames plus transcript intent",
      returns: ["protected-regions", "gesture-anchor", "crop-focus", "confidence"],
    },
    specValidation: {
      accepts: "edit decision plan and Edit Spec v1",
      returns: ["normalized-output", "actionable-path-errors"],
    },
    previewQa: {
      accepts: "spec plus checkpoints",
      returns: [
        "stills-or-preview",
        "audio-check",
        "source-delivery-color-comparison",
        "pass-fail-notes",
      ],
    },
  },
  conditional: {
    landmarkDetection: {
      useWhen: "a face, hand or fingertip moves enough that sampled visual inspection is unreliable",
      returns: ["time-series-landmarks", "confidence"],
    },
    assetAcquisition: {
      useWhen: "the user requested secondary media but did not supply it",
      returns: ["local-asset", "source-url", "license", "required-credit"],
    },
    citationVerification: {
      useWhen: "the edit displays a quote, statistic, name or factual assertion",
      returns: ["verified-copy", "authoritative-source", "edition-or-translation"],
    },
    faceTrack: {
      useWhen:
        "the user asked for face/head tracking, or a bubble, picture-in-picture or follow crop",
      returns: [
        "per-frame-face-center-and-size",
        "normalized-top-left-coordinates",
        "detection-count-and-misses",
        "smoothing-parameters",
      ],
    },
    personCutout: {
      useWhen: "the user asked for the background removed, replaced or pushed back",
      returns: [
        "soft-alpha-matte",
        "composited-proxy",
        "backend-and-checkpoint",
        "matte-treatment",
        "outline-width-and-color",
        "backdrop",
        "color-path",
      ],
    },
    mediaNormalization: {
      useWhen: "rotation, codec, HDR or decoder support makes the source unsafe for preview/render",
      returns: [
        "editor-friendly-proxy",
        "unchanged-original-reference",
        "color-transform-parameters",
        "perceptual-match-checkpoints",
      ],
    },
  },
} as const;

export const EDIT_PLAN_EXAMPLE = {
  version: 1,
  objective: "Make the spoken video clear, on-brand and readable without hiding the speaker.",
  assumptions: [
    {
      choice: "Add word-synced captions",
      basis: "editorial-default",
      confidence: "high",
      reversible: true,
    },
  ],
  clarifications: [
    {
      question: "Which presenter treatment should anchor the introduction?",
      reason: "multiple-valid-templates",
      blocking: false,
      options: [
        {
          id: "speaker-card",
          label: "Speaker Card",
          description: "Large presenter identity card with portrait and role.",
          templateSlug: "speaker-card",
          previewPath: "/templates/speaker-card",
        },
        {
          id: "recording-frame",
          label: "Recording Frame",
          description: "Keeps the screen recording primary with lightweight chrome.",
          templateSlug: "recording-frame",
          previewPath: "/templates/recording-frame",
        },
      ],
      resolution: "defaulted",
      selectedOptionId: "speaker-card",
      resolutionNote: "The request emphasizes the presenter and the choice is reversible.",
    },
  ],
  protectedSubjects: [
    { kind: "face", time: { start: "0s", duration: "100%" }, paddingPct: 6 },
  ],
  decisions: [
    {
      intent: "Show secondary media while keeping the speaker visible",
      evidence: ["transcript", "visual"],
      time: { start: "9s", duration: "8s" },
      template: "b-roll",
      placement: "right-panel",
      sourceReframe: { x: 4, y: 8, w: 44, h: 84 },
      confidence: "high",
    },
  ],
  captions: {
    enabled: true,
    timing: "word",
    transcriptSource: "word-timestamp-json",
    preset: "classic",
    placement: "caption-zone",
    highlight: "word",
    appearance: "instant",
    grouping: {
      targetWords: 5,
      maxWords: 8,
      maxLines: 2,
      maxCharactersPerLine: 32,
    },
  },
  assets: [
    {
      role: "secondary-media",
      src: "secondary.mp4",
      provenance: "licensed",
      credit: "record when required",
    },
  ],
  qa: {
    checkpoints: ["before", "entrance", "middle", "exit", "after"],
    checks: ["face-clear", "gesture-aligned", "captions-synced", "quote-verified"],
  },
} as const;

/**
 * The contract as a string, for a harness that prompts with it instead of
 * reading files: the playbook itself, generated into `guide.generated.ts` by
 * `npm run agent:guide`.
 *
 * This used to be a second, hand-written summary of the same rules, and two
 * hand-written texts drift: a rule tightened in one stayed loose in the other,
 * and an agent's answer depended on which copy it read. One text now.
 *
 * The playbook is deliberately short and routes the rest: everything that
 * applies to one kind of request lives in `docs/features/*` and is opened only
 * when the request names it. `AGENT_DOCS` is that routing as data.
 */
export const AGENT_GUIDE = `OverlayMotion agent contract v${AGENT_POLICY_VERSION}

${AGENT_PLAYBOOK}`;

/**
 * Which page answers which request. The playbook carries the same table in
 * prose for an agent reading files; this is the machine-readable copy, for a
 * harness that would rather route on data than parse a table.
 * `tests/agent-policy.test.ts` checks every path exists and that the playbook
 * links to it, because a page nothing routes to is a page nothing opens.
 */
export const AGENT_DOCS = {
  contract: "docs/agent-playbook.md",
  grammar: "docs/edit-spec.md",
  toolkit: "docs/agent-toolkit.md",
  features: {
    captions: {
      doc: "docs/features/captions.md",
      when: "captions, subtitles, word-timed text",
    },
    "background-removal": {
      doc: "docs/features/background-removal.md",
      when: "removing, replacing or blurring a background behind a person",
    },
    tracking: {
      doc: "docs/features/tracking.md",
      when: "face or head tracking, a corner bubble, a follow crop",
    },
    "voice-cleanup": {
      doc: "docs/features/voice-cleanup.md",
      when: "noise, hum, room tone, cleaning up the audio",
    },
    music: {
      doc: "docs/features/music.md",
      when: "a music bed under the edit",
    },
    sound: {
      doc: "docs/features/sound.md",
      when: "sound cues on overlays",
    },
    "delivery-color": {
      doc: "docs/features/delivery-color.md",
      when: "the final encode, HDR, or an unexplained color shift in the delivery",
    },
    camera: {
      doc: "docs/camera-motion-spec.md",
      when: "a camera move",
    },
  },
} as const;

export type AgentFeature = keyof typeof AGENT_DOCS.features;

export const buildAgentPrompt = ({
  request,
  mediaSummary,
}: {
  request: string;
  mediaSummary?: string;
}) => `${AGENT_GUIDE}

User request:
${request}

Media summary:
${mediaSummary?.trim() || "Not supplied. Inspect/probe/transcribe the source before authoring the spec."}

Return, in this order:
1. A compact edit decision plan: explicit asks, assumptions, clarifications with options/resolution, protected subjects, transcript/gesture evidence, assets with provenance, and QA checkpoints.
2. One OverlayMotion Edit Spec v1 JSON object.
3. A short list of uncertainties or missing capabilities. Omit decorative explanations.`;
