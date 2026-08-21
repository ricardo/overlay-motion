import { z } from "zod/v3";

export const captionPresetNames = [
  "classic",
  "minimal",
  "editorial",
  "punch",
  "extruded",
] as const;
export const captionPresetName = z.enum(captionPresetNames);
export type CaptionPresetName = z.infer<typeof captionPresetName>;

export const captionFontRole = z.enum(["heading", "body", "serif"]);
export const captionColorRole = z.enum([
  "primary",
  "secondary",
  "accent",
  "onPrimary",
  "surface",
  "onSurface",
  "muted",
  "background",
  "white",
  "black",
]);

/**
 * Brand token or a literal color. Captions are the one surface where a caller
 * copies an exact look from a reference video, so a hex escape beats forcing a
 * whole-brand mutation for one overlay. Presets stay on tokens.
 */
export const captionColor = z.union([
  captionColorRole,
  z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
    .describe("Literal #rgb, #rrggbb or #rrggbbaa color"),
]);
export type CaptionColor = z.infer<typeof captionColor>;

/** Explicit drop shadow. `true` keeps the legacy soft shadow. */
export const captionShadowSchema = z.object({
  x: z.number().min(-40).max(40).default(0).describe("Design pixels"),
  y: z.number().min(-40).max(40).default(0).describe("Design pixels"),
  blur: z.number().min(0).max(60).default(0).describe("Design pixels"),
  color: captionColor.default("black"),
  opacity: z.number().min(0).max(1).default(1),
});
export type CaptionShadow = z.infer<typeof captionShadowSchema>;

/**
 * Solid extrusion: the glyph repeated in small steps out to (x, y), so the
 * offset copy connects to the word instead of floating behind it as a second
 * readable word. A single offset copy only works when the offset is small
 * next to the type size.
 */
export const captionExtrudeSchema = z.object({
  x: z.number().min(-40).max(40).default(0).describe("Design pixels"),
  y: z.number().min(-40).max(40).default(0).describe("Design pixels"),
  color: captionColor.default("black"),
});
export type CaptionExtrude = z.infer<typeof captionExtrudeSchema>;

export const captionTextStyleSchema = z.object({
  fontRole: captionFontRole.optional().describe("Theme font role used by this text state"),
  /**
   * The same escape `captionColor` opens for color, for type. Presets stay on
   * roles; this exists because the reference look a caller is copying often
   * lives in one specific face (`punch` was drawn on Montserrat ExtraBold,
   * `extruded` on Arial Rounded MT Bold), and mutating the whole BrandTheme to
   * get it changes every other overlay in the spec.
   */
  fontFamily: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Literal CSS font stack for this text state, e.g. \"'Arial Rounded MT Bold', system-ui, sans-serif\". Overrides fontRole. The family must already be installed or loaded: Chromium substitutes a fallback silently, so a wrong name renders as the wrong face rather than as an error.",
    ),
  fontSize: z.number().min(16).max(180).optional().describe("Design pixels at a 1080px short edge"),
  fontWeight: z.number().int().min(100).max(900).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  colorRole: captionColor.optional().describe("Brand color token or hex; white and black are neutral fallbacks"),
  backgroundRole: captionColor.optional().describe("Optional background color token or hex"),
  lineHeight: z.number().min(0.8).max(2).optional(),
  letterSpacing: z.number().min(-10).max(30).optional().describe("Design pixels"),
  paddingX: z.number().min(0).max(48).optional().describe("Horizontal design-pixel padding"),
  paddingY: z.number().min(0).max(24).optional().describe("Vertical design-pixel padding"),
  borderRadius: z.number().min(0).max(80).optional().describe("Design pixels"),
  scale: z.number().min(0.5).max(2).optional(),
  underline: z.boolean().optional(),
  strokeWidth: z
    .number()
    .min(0)
    .max(24)
    .optional()
    .describe("Outline thickness in design pixels, painted behind the fill"),
  strokeColorRole: captionColor.optional().describe("Outline color token or hex; defaults to black"),
  extrude: captionExtrudeSchema
    .optional()
    .describe("Solid extrusion toward x/y, painted behind the fill and the stroke"),
  textShadow: z
    .union([z.boolean(), captionShadowSchema])
    .optional()
    .describe("true for the legacy soft shadow, or an explicit offset/blur/color shadow"),
  dropShadow: captionShadowSchema
    .optional()
    .describe(
      "Shadow cast by the whole painted word, outline and extrusion included, unlike textShadow which repeats the glyph alone",
    ),
  opacity: z.number().min(0).max(1).optional(),
});
export type CaptionTextStyle = z.infer<typeof captionTextStyleSchema>;

/**
 * A word style is named, not described inline, so the same treatment can repeat
 * across a track without the caller restating it and without the copy carrying
 * presentation. `buzzword` and `emphasis` are the two the presets ship; any
 * other name resolves against `styles.words`, and an unknown one is a
 * validation error rather than an unstyled word, because a mark that silently
 * does nothing looks exactly like a mark that worked.
 */
export const BUILT_IN_WORD_MARKS = ["buzzword", "emphasis"] as const;
/**
 * A union rather than a plain string, so the published JSON schema still NAMES
 * the two built-ins for an agent reading the contract, while the open
 * branch keeps caller-defined names legal. A bare `z.string()` would have been
 * simpler and would have deleted the only place those names are discoverable.
 */
export const captionWordMark = z
  .union([z.enum(BUILT_IN_WORD_MARKS), z.string().min(1)])
  .describe("Named word style: built-in `buzzword` or `emphasis`, or any key defined in styles.words");
export type CaptionWordMark = z.infer<typeof captionWordMark>;

export const captionWordCue = z
  .object({
    text: z.string().min(1),
    /** Seconds in the enclosing track's timebase. */
    start: z.number().nonnegative(),
    end: z.number().positive(),
    marks: z
      .array(captionWordMark)
      .max(4)
      .optional()
      .describe(
        "Named word styles, applied in order before active-word styling, so a later mark wins the fields it sets",
      ),
  })
  .refine((word) => word.end > word.start, {
    message: "Word end must be after word start",
    path: ["end"],
  });

export const captionCue = z
  .object({
    text: z.string().min(1).optional().describe("Display copy; derived from words when omitted"),
    start: z.number().nonnegative().optional(),
    end: z.number().positive().optional(),
    words: z.array(captionWordCue).min(1).optional(),
  })
  .superRefine((cue, ctx) => {
    if (!cue.text && !cue.words) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: "Caption cue needs text or timed words",
      });
    }
    if ((cue.start === undefined) !== (cue.end === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["start"],
        message: "Caption start and end must be supplied together",
      });
    }
    if (cue.start !== undefined && cue.end !== undefined && cue.end <= cue.start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end"],
        message: "Caption end must be after caption start",
      });
    }
    cue.words?.forEach((word, wordIndex) => {
      if (wordIndex > 0 && word.start < cue.words![wordIndex - 1].end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["words", wordIndex, "start"],
          message: "Word timestamps must be ordered and may not overlap",
        });
      }
      if (
        cue.start !== undefined &&
        cue.end !== undefined &&
        (word.start < cue.start || word.end > cue.end)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["words", wordIndex],
          message: "Word timestamps must stay inside their caption window",
        });
      }
    });
  });
export type CaptionCue = z.infer<typeof captionCue>;

export const captionTrackSchema = z.object({
  timebase: z
    .enum(["composition", "overlay"])
    .default("composition")
    .describe("Whether cue timestamps use the full composition or this overlay window"),
  language: z.string().min(2).optional(),
  cues: z.array(captionCue).min(1),
});
export type CaptionTrack = z.infer<typeof captionTrackSchema>;

export const captionGroupingSchema = z
  .object({
    mode: z.enum(["explicit", "auto"]).default("explicit"),
    targetWords: z.number().int().min(1).max(20).default(5),
    maxWords: z.number().int().min(1).max(24).default(8),
    maxLines: z.number().int().min(1).max(4).default(2),
    maxCharactersPerLine: z.number().int().min(8).max(80).default(32),
  })
  .refine((grouping) => grouping.targetWords <= grouping.maxWords, {
    message: "targetWords must not exceed maxWords",
    path: ["targetWords"],
  });
export type CaptionGrouping = z.infer<typeof captionGroupingSchema>;

/**
 * Caller-side override. Every field is optional with no default, so `{ maxWords: 4 }`
 * changes the cap and inherits the rest of the preset. Reusing the defaulted
 * schema here made a partial override impossible: it filled `targetWords` with
 * its own default of 5, which then failed the "targetWords <= maxWords" check
 * against the 4 the caller had just asked for. The two values are reconciled
 * after the merge in resolveCaptionConfig, where both are finally known.
 */
export const captionGroupingOverrideSchema = z.object({
  mode: z.enum(["explicit", "auto"]).optional(),
  targetWords: z.number().int().min(1).max(20).optional(),
  maxWords: z.number().int().min(1).max(24).optional(),
  maxLines: z.number().int().min(1).max(4).optional(),
  maxCharactersPerLine: z.number().int().min(8).max(80).optional(),
});
export type CaptionGroupingOverride = z.infer<typeof captionGroupingOverrideSchema>;

export const captionLayoutSchema = z.object({
  textAlign: z.enum(["left", "center", "right"]).optional(),
  verticalAlign: z.enum(["top", "center", "bottom"]).optional(),
  gapX: z.number().min(0).max(64).optional().describe("Horizontal word gap in design pixels"),
  gapY: z.number().min(0).max(48).optional().describe("Wrapped-line gap in design pixels"),
});
export type CaptionLayout = z.infer<typeof captionLayoutSchema>;

export const captionHighlightSchema = z.object({
  mode: z.enum(["word", "none"]).optional(),
  duringGaps: z
    .enum(["hold", "none"])
    .optional()
    .describe("Hold the last started word or clear highlighting between word cues"),
  badgeMarginX: z
    .number()
    .min(0)
    .max(32)
    .optional()
    .describe("Extra horizontal margin only when the active style renders a badge or pill"),
});
export type CaptionHighlight = z.infer<typeof captionHighlightSchema>;

export const captionAppearanceSchema = z.object({
  mode: z
    .enum(["instant", "fade", "fade-up", "pop", "word-by-word"])
    .optional(),
  durationSec: z.number().min(0.04).max(1.5).optional(),
  distance: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Fade-up or word reveal travel in design pixels"),
  staggerSec: z
    .number()
    .min(0.01)
    .max(1)
    .optional()
    .describe("Fallback interval for word-by-word text without word timestamps"),
});
export type CaptionAppearance = z.infer<typeof captionAppearanceSchema>;

export const captionStylesSchema = z.object({
  base: captionTextStyleSchema.optional(),
  active: captionTextStyleSchema.optional(),
  buzzword: captionTextStyleSchema.optional(),
  emphasis: captionTextStyleSchema.optional(),
  /**
   * Caller-defined word styles beyond the two built-in names. The key is the
   * name a word's `marks` reference, so a track can carry as many treatments as
   * the edit needs without the schema guessing which ones matter.
   */
  words: z
    .record(captionTextStyleSchema)
    .optional()
    .describe("Extra named word styles, keyed by the name used in a word's marks"),
});
export type CaptionStyles = z.infer<typeof captionStylesSchema>;

/**
 * Display-only rewriting of the caption copy. It never touches the transcript
 * or the timing, and it is applied after grouping so that punctuation can
 * still decide where a phrase breaks even when it is not drawn.
 */
export const captionTextFormatSchema = z.object({
  case: z
    .enum(["as-spoken", "upper", "lower"])
    .default("as-spoken")
    .describe("Letter case of the drawn copy; the transcript is unchanged"),
  punctuation: z
    .enum(["keep", "strip"])
    .default("keep")
    .describe(
      "`strip` drops commas and periods only. Question and exclamation marks stay, because they carry meaning a reader cannot recover.",
    ),
});
export type CaptionTextFormat = z.infer<typeof captionTextFormatSchema>;

const cueWindow = (cue: CaptionCue) => ({
  start: cue.start ?? cue.words?.[0]?.start,
  end: cue.end ?? cue.words?.[cue.words.length - 1]?.end,
});

const baseCaptionClassicSchema = z.object({
  /** Legacy overlay-relative input. Prefer track for new specs. */
  lines: z.array(captionCue).min(1).optional(),
  track: captionTrackSchema.optional(),
  preset: captionPresetName.default("classic"),
  grouping: captionGroupingOverrideSchema.optional(),
  layout: captionLayoutSchema.optional(),
  highlight: captionHighlightSchema.optional(),
  appearance: captionAppearanceSchema.optional(),
  text: captionTextFormatSchema.partial().optional(),
  styles: captionStylesSchema.optional(),
});

export const captionClassicSchema = baseCaptionClassicSchema
  .superRefine((props, ctx) => {
    if ((props.lines ? 1 : 0) + (props.track ? 1 : 0) !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["track"],
        message: "Supply exactly one of lines or track",
      });
      return;
    }

    const cues = props.track?.cues ?? props.lines ?? [];
    const windows = cues.map(cueWindow);
    const timedCount = windows.filter(
      (window) => window.start !== undefined && window.end !== undefined,
    ).length;
    if (timedCount > 0 && timedCount !== cues.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [props.track ? "track" : "lines"],
        message: "Caption cues may not mix timed and untimed windows",
      });
    }
    for (let index = 1; index < windows.length; index += 1) {
      const previous = windows[index - 1];
      const current = windows[index];
      if (
        previous.end !== undefined &&
        current.start !== undefined &&
        current.start < previous.end
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: props.track
            ? ["track", "cues", index, "start"]
            : ["lines", index, "start"],
          message: `Caption windows must be ordered and may not overlap cue ${index - 1}`,
        });
      }
    }
    // An unknown mark is an error, not an unstyled word. The two look identical
    // on screen, and the render is where a typo would otherwise surface.
    const known = new Set<string>([
      ...BUILT_IN_WORD_MARKS,
      ...Object.keys(props.styles?.words ?? {}),
    ]);
    cues.forEach((cue, cueIndex) => {
      cue.words?.forEach((word, wordIndex) => {
        word.marks?.forEach((mark, markIndex) => {
          if (known.has(mark)) return;
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: props.track
              ? ["track", "cues", cueIndex, "words", wordIndex, "marks", markIndex]
              : ["lines", cueIndex, "words", wordIndex, "marks", markIndex],
            message: `Unknown word mark "${mark}" on "${word.text}". Define it in styles.words or use ${BUILT_IN_WORD_MARKS.join(" or ")}`,
          });
        });
      });
    });
  })
  .describe("Supply exactly one of legacy overlay-relative lines or a caption track");
export type CaptionClassicProps = z.infer<typeof captionClassicSchema>;
