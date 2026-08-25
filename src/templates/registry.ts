import {
  editSpec,
  overlayMotion,
  type EditSpec,
  type Format,
  type OverlayMotionSpec,
} from "../spec/types";
import { contractNeedsSourceVideo, type TemplateDef } from "./types";
import { heroTitleDef } from "./hero-title";
import { statCounterDef } from "./stat-counter";
import { barChartDef } from "./bar-chart";
import { captionClassicDef } from "./caption-classic";
import { newsHighlightDef } from "./news-highlight";
import { chatBubblesDef } from "./chat-bubbles";
import { lineChartDef } from "./line-chart";
import { audiogramDef } from "./audiogram";
import { logoStingDef } from "./logo-sting";
import { quoteCardDef } from "./quote-card";
import { tweetCardDef } from "./tweet-card";
import { checklistStepsDef } from "./checklist-steps";
import { numberedStepsDef } from "./numbered-steps";
import { bulletStepsDef } from "./bullet-steps";
import { videoCardDef } from "./video-card";
import { bRollDef } from "./b-roll";
import { countdownDef } from "./countdown";
import { beforeAfterDef } from "./before-after";
import { tickerTapeDef } from "./ticker-tape";
import { recordingFrameDef } from "./recording-frame";
import { speakerCardDef } from "./speaker-card";
import { blurFocusTextDef } from "./blur-focus-text";
import { worldGlobeDef } from "./world-globe";
import { likeSubscribeBellDef, likeSubscribeDef } from "./like-subscribe";
import { stickerDef } from "./sticker";
import { faceBubbleDef } from "./face-bubble";
import { promptBoxDef } from "./prompt-box";
import { cortisolGaugeDef } from "./cortisol-gauge";

const TEMPLATE_DEFINITIONS: TemplateDef[] = [
  chatBubblesDef,
  quoteCardDef,
  checklistStepsDef,
  likeSubscribeDef,
  heroTitleDef,
  audiogramDef,
  worldGlobeDef,
  bulletStepsDef,
  numberedStepsDef,
  logoStingDef,
  speakerCardDef,
  statCounterDef,
  beforeAfterDef,
  barChartDef,
  lineChartDef,
  tweetCardDef,
  likeSubscribeBellDef,
  blurFocusTextDef,
  captionClassicDef,
  newsHighlightDef,
  videoCardDef,
  bRollDef,
  countdownDef,
  tickerTapeDef,
  recordingFrameDef,
  stickerDef,
  faceBubbleDef,
  promptBoxDef,
  cortisolGaugeDef,
];

/** All templates are free during the public-library launch. */
export const TEMPLATES: TemplateDef[] = TEMPLATE_DEFINITIONS.map(
  (template) => ({
    ...template,
    tier: "free",
  }),
);

export const TEMPLATE_MAP: Record<string, TemplateDef> = Object.fromEntries(
  TEMPLATES.map((t) => [t.slug, t]),
);

/**
 * Template-declared object motion, resolved once at module load. The renderer
 * reads it per frame, and parsing zod defaults per frame per overlay is waste
 * the render loop should never pay for.
 */
export const TEMPLATE_DEFAULT_MOTION: Record<string, OverlayMotionSpec> = Object.fromEntries(
  TEMPLATES.filter((t) => t.defaultMotion).map((t) => [
    t.slug,
    overlayMotion.parse(t.defaultMotion),
  ]),
);

export const DEMO_AUDIO = "/demo/audiogram-song.wav";

/** The spec that the site player runs and the info panel displays. */
export const demoSpecFor = (def: TemplateDef, format: Format): EditSpec =>
  editSpec.parse({
    version: 1,
    format,
    fps: 60,
    durationSec: def.demoDurationSec,
    source: contractNeedsSourceVideo(def.sourceContract)
      ? { type: "video", src: "demo" }
      : def.sourceContract === "visualizes-audio"
        ? { type: "audio", src: DEMO_AUDIO }
        : { type: "none" },
    overlays: [
      {
        template: def.slug,
        region: def.regions[0],
        time: def.demoTime ?? {},
        ...(def.demoCamera ? { camera: def.demoCamera } : {}),
        ...(def.demoReveal ? { reveal: def.demoReveal } : {}),
        // Written out rather than left implicit: the copyable JSON is where a
        // caller learns `motion` exists and that it works on any template.
        ...(def.demoMotion ?? def.defaultMotion
          ? { motion: def.demoMotion ?? def.defaultMotion }
          : {}),
        props: def.demoProps,
      },
    ],
  });

/** What the buyer would actually write: same spec with a real file. */
export const displaySpecFor = (def: TemplateDef, format: Format) => {
  const spec = demoSpecFor(def, format);
  const { overlays, ...root } = spec;
  return {
    ...root,
    // Keep SFX customization visible in every copyable JSON spec. Any cue can
    // map to a built-in name, arbitrary audio path/URL, or false.
    sound: spec.sound ?? { enabled: true, volume: 1, sounds: {} },
    source:
      spec.source.type === "video"
        ? { type: "video", src: "your-footage.mp4" }
        : spec.source.type === "audio"
          ? { type: "audio", src: "your-episode.mp3" }
          : { type: "none" },
    overlays,
  };
};
