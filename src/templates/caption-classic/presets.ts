import type {
  CaptionAppearance,
  CaptionClassicProps,
  CaptionGrouping,
  CaptionHighlight,
  CaptionLayout,
  CaptionPresetName,
  CaptionStyles,
  CaptionTextFormat,
  CaptionTextStyle,
} from "./schema";

type ResolvedCaptionLayout = Required<CaptionLayout>;
type ResolvedCaptionHighlight = Required<CaptionHighlight>;
type ResolvedCaptionAppearance = Required<CaptionAppearance>;
type ResolvedCaptionStyles = {
  base: CaptionTextStyle;
  active: CaptionTextStyle;
  buzzword: CaptionTextStyle;
  emphasis: CaptionTextStyle;
  /**
   * Caller-defined word styles. Optional because presets never ship any: a
   * preset is a look, and which words in THIS track deserve a treatment is a
   * property of the edit, not of the look.
   */
  words?: Record<string, CaptionTextStyle>;
};

export type ResolvedCaptionConfig = {
  grouping: CaptionGrouping;
  layout: ResolvedCaptionLayout;
  highlight: ResolvedCaptionHighlight;
  appearance: ResolvedCaptionAppearance;
  text: Required<CaptionTextFormat>;
  styles: ResolvedCaptionStyles;
};

/** Presets do not rewrite copy; case and punctuation are the caller's call. */
const TEXT_FORMAT_DEFAULT: Required<CaptionTextFormat> = {
  case: "as-spoken",
  punctuation: "keep",
};

/** A preset styles and paces captions; it does not rewrite their copy. */
type CaptionPreset = Omit<ResolvedCaptionConfig, "text">;

export const CAPTION_PRESETS: Record<CaptionPresetName, CaptionPreset> = {
  classic: {
    grouping: {
      // Four is the readability cap, not a target: the caller still decides how
      // many words each cue carries, and `explicit` keeps that phrasing. The
      // cap only bites when a cue would overrun it.
      mode: "explicit",
      targetWords: 3,
      maxWords: 4,
      maxLines: 2,
      maxCharactersPerLine: 32,
    },
    layout: { textAlign: "center", verticalAlign: "center", gapX: 14, gapY: 6 },
    highlight: { mode: "word", duringGaps: "hold", badgeMarginX: 6 },
    appearance: { mode: "instant", durationSec: 0.18, distance: 18, staggerSec: 0.07 },
    styles: {
      base: {
        fontRole: "heading",
        fontSize: 58,
        fontWeight: 800,
        colorRole: "white",
        lineHeight: 1.25,
        paddingX: 0,
        paddingY: 0,
        borderRadius: 14,
        scale: 1,
        // Black outline behind the fill. A drop shadow alone fails on light
        // footage, and subtitles do not get to choose what is behind them.
        // Chromium centers the stroke, so half hides under the fill: 9 draws as
        // roughly a 4.5px edge. The useful range is narrow. Below about 6 the
        // outline stops carrying legibility on its own and the shadow is doing
        // the work again; past about 20 it closes the counters of a, e and o,
        // and crowds the active word's pill until the highlight colour reads as
        // a thin frame rather than a fill.
        strokeWidth: 9,
        strokeColorRole: "black",
        // Written out rather than `true`: the shared legacy shadow is a 14px
        // blur at 0.65, which under an outline this thin stops reading as a
        // lift and starts reading as a smudge around every word.
        textShadow: { x: 0, y: 2, blur: 8, color: "black", opacity: 0.45 },
      },
      // Every state inherits the base outline and the base shadow. The active
      // word used to set `textShadow: false`, so the one word the eye is on was
      // the one word drawn differently, and the line flickered between two
      // treatments at word cadence. Colour and the pill are what marks it.
      active: {
        colorRole: "onPrimary",
        backgroundRole: "primary",
        paddingX: 14,
        paddingY: 2,
        scale: 1.06,
      },
      // The only preset that spends a second font. A caption track that changes
      // face every few words stops reading as one voice, so `classic` gives the
      // serif to `buzzword` alone and every other state stays on the theme
      // font. `emphasis` and `active` say their piece with colour and weight.
      // Georgia's bold is 700; 800 asks Chromium to synthesise a weight it does
      // not have and smears the serifs. The outline is the base one now that it
      // is down to 9: a serif needs its thin strokes left open, which is what
      // the old 13 closed.
      buzzword: { fontRole: "serif", fontWeight: 700 },
      emphasis: { colorRole: "accent", fontWeight: 900 },
    },
  },
  minimal: {
    grouping: {
      mode: "explicit",
      targetWords: 5,
      maxWords: 8,
      maxLines: 2,
      maxCharactersPerLine: 32,
    },
    layout: { textAlign: "center", verticalAlign: "center", gapX: 12, gapY: 4 },
    highlight: { mode: "word", duringGaps: "none", badgeMarginX: 0 },
    appearance: { mode: "fade", durationSec: 0.16, distance: 12, staggerSec: 0.06 },
    styles: {
      base: {
        fontRole: "body",
        fontSize: 52,
        fontWeight: 700,
        colorRole: "white",
        lineHeight: 1.2,
        paddingX: 0,
        paddingY: 0,
        scale: 1,
        textShadow: true,
      },
      active: { colorRole: "accent", fontWeight: 900, textShadow: true },
      // One font, as the name says: the mark reads as italic, not as a face change.
      buzzword: { fontStyle: "italic" },
      emphasis: { fontWeight: 900 },
    },
  },
  /**
   * The social hard-outline look: one word at a time, heavy weight, thick black
   * stroke behind the fill and a hard drop shadow. Legibility comes from the
   * outline, not from a plate, so it survives any footage under it.
   */
  punch: {
    grouping: {
      mode: "auto",
      targetWords: 1,
      maxWords: 1,
      maxLines: 1,
      maxCharactersPerLine: 24,
    },
    layout: { textAlign: "center", verticalAlign: "center", gapX: 0, gapY: 0 },
    highlight: { mode: "none", duringGaps: "none", badgeMarginX: 0 },
    // Instant, not pop: animated scale on stroked glyphs shimmers in Chromium.
    appearance: { mode: "instant", durationSec: 0.08, distance: 0, staggerSec: 0.07 },
    styles: {
      base: {
        fontRole: "heading",
        fontSize: 84,
        fontWeight: 800,
        colorRole: "white",
        lineHeight: 1.1,
        letterSpacing: -1,
        paddingX: 0,
        paddingY: 0,
        scale: 1,
        // Chromium's text stroke uses mitered joins with no CSS line-join
        // control. Thick values form spikes at sharp w/m/v vertices. Eight
        // keeps a visible ~4px edge; the silhouette shadow adds separation.
        strokeWidth: 8,
        strokeColorRole: "black",
        // Shadow the painted silhouette (fill + outline), not a second glyph.
        // A far-offset text-shadow detaches around counters and diagonals: the
        // background can show between the letter and its shadow, while w/m
        // intersections form black spikes. Keep this close and connected.
        dropShadow: { x: 3, y: 5, blur: 1, color: "black", opacity: 0.95 },
      },
      active: {},
      buzzword: { colorRole: "accent" },
      emphasis: { colorRole: "accent" },
    },
  },
  /**
   * Sticker captions: the same one-word cadence as `punch`, but the depth comes
   * from a solid extrusion down and to the right instead of a drop shadow. It
   * wants a heavy rounded face in the brand theme (Arial Rounded MT Bold is the
   * reference); a squarish grotesk reads as a mistake at this weight.
   */
  extruded: {
    grouping: {
      mode: "auto",
      targetWords: 1,
      maxWords: 1,
      maxLines: 1,
      maxCharactersPerLine: 24,
    },
    layout: { textAlign: "center", verticalAlign: "center", gapX: 0, gapY: 0 },
    highlight: { mode: "none", duringGaps: "none", badgeMarginX: 0 },
    appearance: { mode: "instant", durationSec: 0.08, distance: 0, staggerSec: 0.07 },
    styles: {
      base: {
        fontRole: "heading",
        fontSize: 84,
        // Arial Rounded MT Bold registers as weight 400, so 700 is the
        // synthetic bold the reference look was drawn with.
        fontWeight: 700,
        colorRole: "white",
        lineHeight: 1.1,
        letterSpacing: -1,
        paddingX: 0,
        paddingY: 0,
        scale: 1,
        strokeWidth: 10,
        strokeColorRole: "black",
        // The drop is the part that reads as "too far": at y 18 the extrusion
        // hangs below the baseline far enough to look like a second, blurred
        // line of type. 16 keeps the depth without the sag. x stays put, since
        // it is the vertical run that was overshooting.
        extrude: { x: 14, y: 16, color: "black" },
      },
      active: {},
      buzzword: { colorRole: "accent" },
      emphasis: { colorRole: "accent" },
    },
  },
  editorial: {
    grouping: {
      mode: "explicit",
      targetWords: 6,
      maxWords: 9,
      maxLines: 2,
      maxCharactersPerLine: 36,
    },
    layout: { textAlign: "left", verticalAlign: "bottom", gapX: 10, gapY: 8 },
    highlight: { mode: "none", duringGaps: "none", badgeMarginX: 0 },
    appearance: { mode: "fade-up", durationSec: 0.24, distance: 16, staggerSec: 0.06 },
    styles: {
      base: {
        fontRole: "body",
        fontSize: 50,
        fontWeight: 650,
        colorRole: "white",
        lineHeight: 1.3,
        paddingX: 0,
        paddingY: 0,
        scale: 1,
        textShadow: true,
      },
      active: {},
      // Editorial themes already carry a serif in `heading`; pulling a third
      // face in for one word would fight the theme instead of following it.
      buzzword: { fontStyle: "italic", fontWeight: 800 },
      emphasis: { underline: true, fontWeight: 800 },
    },
  },
};

const mergeStyles = (
  preset: CaptionStyles,
  overrides?: CaptionStyles,
): ResolvedCaptionStyles => ({
  base: { ...preset.base, ...overrides?.base },
  active: { ...preset.active, ...overrides?.active },
  buzzword: { ...preset.buzzword, ...overrides?.buzzword },
  emphasis: { ...preset.emphasis, ...overrides?.emphasis },
  // Merged per name, not replaced wholesale, so adding one treatment does not
  // drop the others a preset or an earlier merge already established.
  words: Object.fromEntries(
    [...new Set([...Object.keys(preset.words ?? {}), ...Object.keys(overrides?.words ?? {})])].map(
      (name) => [name, { ...preset.words?.[name], ...overrides?.words?.[name] }],
    ),
  ),
});

/** Drop keys the caller left out so a partial override cannot blank a preset value. */
const defined = <T extends object>(value: T | undefined): Partial<T> =>
  Object.fromEntries(
    Object.entries(value ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<T>;

export const resolveCaptionConfig = (props: CaptionClassicProps): ResolvedCaptionConfig => {
  const preset = CAPTION_PRESETS[props.preset];
  const grouping = { ...preset.grouping, ...defined(props.grouping) };
  // Lowering the cap alone is the common override, and it must not leave a
  // target above it. Clamp here, where both numbers are finally known, rather
  // than rejecting the spec for a conflict the caller never wrote.
  grouping.targetWords = Math.min(grouping.targetWords, grouping.maxWords);
  return {
    grouping,
    layout: { ...preset.layout, ...props.layout },
    highlight: { ...preset.highlight, ...props.highlight },
    appearance: { ...preset.appearance, ...props.appearance },
    text: { ...TEXT_FORMAT_DEFAULT, ...props.text },
    styles: mergeStyles(preset.styles, props.styles),
  };
};
