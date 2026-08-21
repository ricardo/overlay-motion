import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useVideoConfig } from "remotion";
import type { BrandTheme } from "../../spec/types";
import { useBrand } from "../../theme/themes";
import { useInOut, useOverlayTiming } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";
import { captionAppearanceAt } from "./appearance";
import { groupCaptionCues } from "./grouping";
import { resolveCaptionConfig } from "./presets";
import {
  captionClassicSchema,
  type CaptionColor,
  type CaptionTextStyle,
  type CaptionWordMark,
} from "./schema";
import { activeCaptionAt } from "./timing";

const horizontalAlignment: Record<"left" | "center" | "right", CSSProperties["justifyContent"]> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

const verticalAlignment: Record<"top" | "center" | "bottom", CSSProperties["alignContent"]> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};

/**
 * The face a marked word switches to when the theme names no serif of its own.
 * Bare `serif` resolves to Times, which next to any grotesk reads as a missing
 * font rather than as a second voice. Georgia is on every machine that renders
 * these, it was drawn for screens, and its weight sits close enough to a bold
 * sans that one marked word does not fall out of the line.
 */
const CAPTION_SERIF = "'Georgia', 'Iowan Old Style', 'Times New Roman', serif";

// A literal `fontFamily` wins over the theme role. The styles merge by spread,
// so setting it on `base` carries into `active` / `buzzword` / `emphasis` until
// one of them names its own face.
const fontForStyle = (style: CaptionTextStyle, brand: BrandTheme) => {
  if (style.fontFamily) return style.fontFamily;
  if (style.fontRole === "body") return brand.fonts.body;
  if (style.fontRole === "serif") return brand.fonts.serif ?? CAPTION_SERIF;
  return brand.fonts.heading;
};

const colorForToken = (
  token: CaptionColor | undefined,
  brand: BrandTheme,
): string | undefined => {
  if (!token) return undefined;
  if (token.startsWith("#")) return token;
  if (token === "white") return "#FFFFFF";
  if (token === "black") return "#000000";
  return brand.colors[token as keyof BrandTheme["colors"]] ?? brand.colors.primary;
};

const withAlpha = (color: string, opacity: number) => {
  if (opacity >= 1) return color;
  if (!color.startsWith("#")) return color;
  const hex = color.slice(1);
  const expand = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const r = parseInt(expand.slice(0, 2), 16);
  const g = parseInt(expand.slice(2, 4), 16);
  const b = parseInt(expand.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

/**
 * `true` keeps the soft shadow the first presets shipped with; an object is an
 * exact offset shadow, which is what hard-outline social captions need.
 */
/**
 * Commas and periods only. Question and exclamation marks survive because a
 * reader cannot recover them from the words, and an apostrophe is spelling,
 * not punctuation. A trailing ellipsis goes with the periods.
 */
const stripPunctuation = (text: string) => text.replace(/[.,]/g, "");

const shadowLayer = (
  shadow: CaptionTextStyle["textShadow"],
  brand: BrandTheme,
  rem: (value: number) => number,
) => {
  if (!shadow) return null;
  if (shadow === true) return `0 ${rem(3)}px ${rem(14)}px rgba(0, 0, 0, 0.65)`;
  const color = withAlpha(colorForToken(shadow.color, brand) ?? "#000000", shadow.opacity);
  return `${rem(shadow.x)}px ${rem(shadow.y)}px ${rem(shadow.blur)}px ${color}`;
};

/**
 * One copy per rendered pixel of travel. A single offset copy leaves a gap the
 * eye reads as a second word; stepping the copies fills that gap into one solid
 * side, which is what a sticker extrusion looks like.
 */
const extrudeLayers = (
  extrude: CaptionTextStyle["extrude"],
  brand: BrandTheme,
  rem: (value: number) => number,
) => {
  if (!extrude) return [];
  const color = colorForToken(extrude.color, brand) ?? "#000000";
  const travel = Math.max(Math.abs(rem(extrude.x)), Math.abs(rem(extrude.y)));
  const steps = Math.min(120, Math.ceil(travel));
  if (steps < 1) return [];
  return Array.from({ length: steps }, (_, index) => {
    const ratio = (index + 1) / steps;
    return `${(rem(extrude.x) * ratio).toFixed(2)}px ${(rem(extrude.y) * ratio).toFixed(2)}px 0 ${color}`;
  });
};

/**
 * `text-shadow` repeats the glyph, so under a stroke or an extrusion it is
 * swallowed by them. A CSS filter shadows the painted silhouette instead,
 * which is the only way a small offset stays visible on a sticker caption.
 */
const dropShadowCss = (
  shadow: CaptionTextStyle["dropShadow"],
  brand: BrandTheme,
  rem: (value: number) => number,
) => {
  if (!shadow) return undefined;
  const color = withAlpha(colorForToken(shadow.color, brand) ?? "#000000", shadow.opacity);
  return `drop-shadow(${rem(shadow.x)}px ${rem(shadow.y)}px ${rem(shadow.blur)}px ${color})`;
};

const textShadowCss = (
  style: CaptionTextStyle,
  brand: BrandTheme,
  rem: (value: number) => number,
) => {
  // Nearest copy first: later layers paint further back, so the extrusion
  // stacks outward and any real drop shadow sits behind all of it.
  const layers = [...extrudeLayers(style.extrude, brand, rem)];
  const shadow = shadowLayer(style.textShadow, brand, rem);
  if (shadow) layers.push(shadow);
  return layers.length ? layers.join(", ") : "none";
};

const applyWordMarks = (
  base: CaptionTextStyle,
  marks: CaptionWordMark[] | undefined,
  styles: Record<CaptionWordMark, CaptionTextStyle>,
) => marks?.reduce((result, mark) => ({ ...result, ...styles[mark] }), { ...base }) ?? { ...base };

/**
 * Configurable caption renderer. Legacy `lines` stay overlay-relative; the
 * richer `track` input defaults to composition-relative timestamps.
 */
const CaptionClassic = (raw: Record<string, unknown>) => {
  const props = useMemo(() => captionClassicSchema.parse(raw), [raw]);
  const config = useMemo(() => resolveCaptionConfig(props), [props]);
  const rawCues = props.track?.cues ?? props.lines ?? [];
  const cues = useMemo(
    () => groupCaptionCues(rawCues, config.grouping),
    [rawCues, config.grouping],
  );
  const brand = useBrand();
  const rem = useRem();
  const { durationInFrames: compositionFrames, fps } = useVideoConfig();
  const { frame } = useInOut();
  const overlayTiming = useOverlayTiming();
  const timebase = props.track?.timebase ?? "overlay";
  const nowSec =
    timebase === "composition"
      ? (frame + overlayTiming.startFrame) / fps
      : frame / fps;
  const durationSec =
    timebase === "composition"
      ? compositionFrames / fps
      : (overlayTiming.durationFrames ?? compositionFrames) / fps;

  const active = activeCaptionAt({
    lines: cues,
    nowSec,
    durationSec,
    highlightDuringGaps: config.highlight.duringGaps === "hold",
  });

  if (!active) return null;
  const { lineIndex, words, activeWord } = active;
  const activeCue = cues[lineIndex];
  const cueStartSec =
    activeCue.start ?? lineIndex * (durationSec / Math.max(cues.length, 1));
  const cueEndSec =
    activeCue.end ?? (lineIndex + 1) * (durationSec / Math.max(cues.length, 1));
  const cueAppearance = captionAppearanceAt({
    mode: config.appearance.mode === "word-by-word" ? "instant" : config.appearance.mode,
    nowSec,
    startSec: cueStartSec,
    durationSec: config.appearance.durationSec,
    distance: config.appearance.distance,
  });
  // Caller-defined names last, so a `styles.words.buzzword` overrides the
  // built-in rather than being shadowed by it and quietly ignored.
  const markStyles = {
    buzzword: config.styles.buzzword,
    emphasis: config.styles.emphasis,
    ...config.styles.words,
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: horizontalAlignment[config.layout.textAlign],
        alignContent: verticalAlignment[config.layout.verticalAlign],
        gap: `${rem(config.layout.gapY)}px ${rem(config.layout.gapX)}px`,
        textAlign: config.layout.textAlign,
        // Case is CSS, so the pill and the stroke measure the drawn glyphs
        // rather than the transcript's.
        textTransform:
          config.text.case === "upper"
            ? "uppercase"
            : config.text.case === "lower"
              ? "lowercase"
              : undefined,
        opacity: cueAppearance.opacity,
        transform: `translateY(${rem(cueAppearance.translateY)}px) scale(${cueAppearance.scale})`,
        transformOrigin: "center",
      }}
    >
      {/*
        Badge clearance is reserved on EVERY word whenever word highlighting
        can paint a pill, not just on the active word: a margin that appears
        only while a word is highlighted reflows the line on every highlight
        advance, and with centered text both line edges breathe in and out at
        word cadence, which reads as the whole video micro-zooming.
      */}
      {words.map((word, index) => {
        const badgeReserve =
          config.highlight.mode === "word" && config.styles.active.backgroundRole !== undefined
            ? config.highlight.badgeMarginX
            : 0;
        const markedStyle = applyWordMarks(config.styles.base, word.marks, markStyles);
        const highlighted =
          config.highlight.mode === "word" && activeWord !== null && index === activeWord;
        const style = highlighted
          ? { ...markedStyle, ...config.styles.active }
          : markedStyle;
        const restingPaddingX = markedStyle.paddingX ?? 0;
        const restingPaddingY = markedStyle.paddingY ?? 0;
        const extraPaddingX = highlighted
          ? Math.max(0, (style.paddingX ?? 0) - restingPaddingX)
          : 0;
        const extraPaddingY = highlighted
          ? Math.max(0, (style.paddingY ?? 0) - restingPaddingY)
          : 0;
        const activeBackground = highlighted
          ? colorForToken(style.backgroundRole, brand)
          : undefined;
        const restingBackground = colorForToken(markedStyle.backgroundRole, brand);
        const fallbackWordInterval = Math.min(
          config.appearance.staggerSec,
          Math.max(0, cueEndSec - cueStartSec) / Math.max(words.length, 1),
        );
        const wordStartSec = activeCue.words?.[index]?.start ??
          cueStartSec + fallbackWordInterval * index;
        const wordAppearance = captionAppearanceAt({
          mode: config.appearance.mode === "word-by-word" ? "word-by-word" : "instant",
          nowSec,
          startSec: wordStartSec,
          durationSec: config.appearance.durationSec,
          distance: config.appearance.distance,
        });

        return (
          <span
            key={`${lineIndex}-${index}`}
            style={{
              position: "relative",
              zIndex: highlighted ? 1 : 0,
              whiteSpace: "pre",
              fontFamily: fontForStyle(style, brand),
              fontSize: rem(style.fontSize ?? 58),
              fontWeight: style.fontWeight,
              fontStyle: style.fontStyle,
              lineHeight: style.lineHeight,
              letterSpacing:
                style.letterSpacing === undefined ? undefined : rem(style.letterSpacing),
              color: colorForToken(style.colorRole, brand),
              backgroundColor: highlighted ? "transparent" : restingBackground,
              padding: `${rem(restingPaddingY)}px ${rem(restingPaddingX)}px`,
              margin: badgeReserve ? `0 ${rem(badgeReserve)}px` : undefined,
              borderRadius: rem(markedStyle.borderRadius ?? 0),
              opacity: (style.opacity ?? 1) * wordAppearance.opacity,
              textDecoration: style.underline ? "underline" : "none",
              textDecorationThickness: style.underline ? rem(3) : undefined,
              textUnderlineOffset: style.underline ? rem(6) : undefined,
              textShadow: textShadowCss(style, brand, rem),
              filter: dropShadowCss(style.dropShadow, brand, rem),
              // Chromium centers -webkit-text-stroke on the glyph outline, so a
              // thick stroke eats the letterform; paint-order puts it behind the
              // fill, which is the whole look for hard-outline social captions.
              WebkitTextStroke: style.strokeWidth
                ? `${rem(style.strokeWidth)}px ${colorForToken(style.strokeColorRole ?? "black", brand)}`
                : undefined,
              paintOrder: "stroke fill",
              transform: `translateY(${rem(wordAppearance.translateY)}px) scale(${
                (style.scale ?? 1) * wordAppearance.scale
              })`,
              transformOrigin: "center",
            }}
          >
            {activeBackground ? (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: `${rem(-extraPaddingY)}px ${rem(-extraPaddingX)}px`,
                  zIndex: 0,
                  borderRadius: rem(style.borderRadius ?? 0),
                  backgroundColor: activeBackground,
                }}
              />
            ) : null}
            <span style={{ position: "relative", zIndex: 1 }}>
              {config.text.punctuation === "strip" ? stripPunctuation(word.text) : word.text}
            </span>
          </span>
        );
      })}
    </div>
  );
};

export const captionClassicDef: TemplateDef = {
  slug: "caption-classic",
  title: "Captions",
  tier: "free",
  category: "Social",
  description:
    "Configurable word-timed captions with named presets, exact positioning, optional highlighting, automatic phrase limits and semantic word styles.",
  sourceContract: "annotates-video",
  regions: ["caption-zone", "center"],
  schema: captionClassicSchema,
  demoProps: {
    preset: "classic",
    grouping: {
      mode: "auto",
      targetWords: 5,
      maxWords: 8,
      maxLines: 2,
      maxCharactersPerLine: 32,
    },
    layout: { textAlign: "center", verticalAlign: "center" },
    highlight: { mode: "word", duringGaps: "none", badgeMarginX: 6 },
    appearance: { mode: "instant", durationSec: 0.18, distance: 18, staggerSec: 0.07 },
    // The demo's job is to show that styling is per WORD. It used to prove that
    // by firing every mechanism at once, four named styles over three cues, and
    // what a viewer read was not "the styling is per word" but "these captions
    // cannot decide what they look like". Two voices is the whole point: the
    // theme font carries the track, `buzzword` swaps one word to the serif, and
    // the active-word badge the preset already draws does the rest. Nothing here
    // names a literal font: a demo that depended on a face installed on this
    // laptop would render wrong on anyone else's machine.
    track: {
      timebase: "composition",
      language: "en",
      cues: [
        {
          start: 0,
          end: 2.4,
          words: [
            { text: "Every", start: 0, end: 0.4 },
            { text: "word", start: 0.4, end: 0.8 },
            { text: "lands", start: 0.8, end: 1.25 },
            { text: "on", start: 1.25, end: 1.45 },
            { text: "its", start: 1.45, end: 1.7 },
            { text: "own", start: 1.7, end: 2 },
            { text: "beat", start: 2, end: 2.4 },
          ],
        },
        {
          // One mark, one change of face. `buzzword` is a semantic name, not a
          // look: the preset decides what it means, so the same track restyles
          // wholesale by swapping the preset.
          start: 2.6,
          end: 4.7,
          words: [
            { text: "Mark", start: 2.6, end: 2.95 },
            { text: "one", start: 2.95, end: 3.25 },
            { text: "and", start: 3.25, end: 3.5 },
            { text: "it", start: 3.5, end: 3.65 },
            { text: "turns", start: 3.65, end: 4.05 },
            { text: "editorial", start: 4.05, end: 4.7, marks: ["buzzword"] },
          ],
        },
        {
          start: 4.9,
          end: 7,
          words: [
            { text: "Everything", start: 4.9, end: 5.45 },
            { text: "else", start: 5.45, end: 5.75 },
            { text: "stays", start: 5.75, end: 6.1 },
            { text: "in", start: 6.1, end: 6.25 },
            { text: "your", start: 6.25, end: 6.5 },
            { text: "brand", start: 6.5, end: 6.8 },
            { text: "font", start: 6.8, end: 7 },
          ],
        },
      ],
    },
  },
  demoDurationSec: 7,
  component: CaptionClassic,
};
