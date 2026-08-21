import { useMemo } from "react";
import { z } from "zod/v3";
import { Img, interpolate, staticFile } from "remotion";
import { surfaceStyle, useBrand } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { pop, useInOut, useOverlayTiming, usePop } from "../../player/motion";
import {
  charOffsets,
  typewriterChars,
} from "../../player/typewriter";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

/** Public-folder paths work in the site (vite) AND in Remotion renders via staticFile. */
const resolveAsset = (src: string) =>
  /^(https?:|data:|blob:)/.test(src) ? src : staticFile(src.replace(/^\//, ""));

const DEFAULT_TYPING_SECONDS = 3.5;
/** Speed limit for the char clock: faster than this stops reading as typing. */
const MAX_TYPING_CHARS_PER_SEC = 28;
const TYPING_VOLUME = 0.35;

const schema = z.object({
  name: z.string(),
  handle: z.string(),
  /** Post body; blank lines split paragraphs. */
  text: z.string(),
  /** Photo cropped to a circle next to the name. */
  avatar: z.string().optional(),
  /** Blue verified seal next to the name. */
  verified: z.boolean().default(false),
  typingSfx: templateSfx
    .default("keyboard-typing-natural")
    .describe(
      "Recorded keyboard typing while character-by-character text lands, so it only plays on the `typewriter` reveal. `false` types in silence.",
    ),
  /**
   * How the text lands: word by word, character-by-character typewriter,
   * paragraph masks, a plain fade-up, or already there. Unset, the spec's
   * `reveal` hint maps to the nearest mode ("typewriter" and "fade-up"
   * directly); otherwise the default is "words".
   */
  animateIn: z.enum(["words", "typewriter", "paragraphs", "fade-up", "none"]).optional(),
});

/**
 * The "tweet screenshot" post, but alive. Long posts stay snappy because the
 * per-word stagger is budgeted against a fixed total, not a fixed step. Camera
 * motion belongs to the edit spec, so this template behaves exactly like every
 * other card under `overlay.camera` or the scene-level `camera`.
 */
const TweetCard = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { frame, fps, exit } = useInOut();

  const paragraphs = useMemo(
    () =>
      p.text
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [p.text]
  );
  const words = useMemo(() => paragraphs.map((par) => par.split(" ")), [paragraphs]);
  const wordCount = words.reduce((n, w) => n + w.length, 0);

  const timing = useOverlayTiming();
  const animateIn =
    p.animateIn ??
    (timing.reveal === "typewriter"
      ? "typewriter"
      : timing.reveal === "fade-up"
        ? "fade-up"
        : "words"); // "blur-in" has no tweet equivalent; the native default wins

  // Frame constants derive from fps so timing holds at 30, 60 or any spec fps.
  const headerIn = usePop(0, { damping: 200 });
  const textStart = animateIn === "none" ? 0 : Math.round(fps * 0.27);
  const perWord = Math.min(fps * 0.085, (fps * 1.4) / Math.max(1, wordCount));
  const perParagraph = Math.round(fps * 0.35);

  // Typewriter: spec `time.appear` budgets the typing. Without an explicit
  // budget, keep a brisk minimum window, stretched when the post is long
  // enough that the window would exceed the cps speed limit.
  const totalChars = paragraphs.reduce((n, s) => n + s.length, 0);
  const typingFrames =
    timing.appearFrames !== null
      ? Math.max(1, timing.appearFrames - textStart)
      : Math.round(
          fps *
            Math.max(DEFAULT_TYPING_SECONDS, totalChars / MAX_TYPING_CHARS_PER_SEC)
        );
  const typeWindow = { startFrame: textStart, typingFrames, totalChars };
  const charsVisible = typewriterChars(frame, typeWindow);
  const parOffsets = charOffsets(paragraphs);

  const cardFade =
    animateIn === "fade-up"
      ? interpolate(frame, [0, fps * 0.6], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const bodyFont = {
    fontFamily: brand.fonts.body,
    fontSize: rem(46),
    fontWeight: 500,
    lineHeight: 1.5,
    color: brand.colors.onSurface,
  } as const;

  let wordOffset = 0;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: rem(920),
        ...surfaceStyle(brand, rem),
        borderRadius: rem(brand.radius),
        padding: rem(72),
        opacity: exit * cardFade,
        // Camera scaling lives on the outer OverlayCamera. Keep this compositor
        // layer so Chromium rasterizes text consistently while that wrapper moves.
        transform: "translateZ(0)",
        transformOrigin: "center",
        willChange: "transform",
        backfaceVisibility: "hidden",
        WebkitFontSmoothing: "antialiased",
        textRendering: "geometricPrecision",
        boxShadow: `0 ${rem(24)}px ${rem(80)}px rgba(0, 0, 0, 0.18)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: rem(24),
          marginBottom: rem(52),
          opacity: headerIn,
          transform: `translateY(${(1 - headerIn) * rem(12)}px)`,
        }}
      >
        {p.avatar ? (
          <Img
            src={resolveAsset(p.avatar)}
            style={{
              width: rem(96),
              height: rem(96),
              borderRadius: rem(999),
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: rem(96),
              height: rem(96),
              borderRadius: rem(999),
              backgroundColor: brand.colors.primary,
              color: brand.colors.onPrimary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: brand.fonts.heading,
              fontSize: rem(44),
              fontWeight: 800,
            }}
          >
            {p.name.trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: rem(10) }}>
            <div
              style={{
                fontFamily: brand.fonts.heading,
                fontSize: rem(34),
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                lineHeight: 1.1,
                color: brand.colors.onSurface,
              }}
            >
              {p.name}
            </div>
            {p.verified ? (
              <svg
                viewBox="0 0 24 24"
                style={{ width: rem(36), height: rem(36), flexShrink: 0 }}
              >
                {/* Platform iconography: the seal stays Twitter blue in every brand theme. */}
                <path
                  fill="#1D9BF0"
                  d="M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12zm-12.91 4.72l-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35z"
                />
              </svg>
            ) : null}
          </div>
          <div style={{ fontSize: rem(30), lineHeight: 1.2, color: brand.colors.muted }}>
            {p.handle}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: rem(44) }}>
        {animateIn === "typewriter" ? (
          <PropSfx
            sfx={p.typingSfx}
            at={textStart}
            volume={TYPING_VOLUME}
            durationSec={typingFrames / fps}
          />
        ) : null}
        {paragraphs.map((par, pi) => {
          const start = wordOffset;
          wordOffset += words[pi].length;
          if (animateIn === "typewriter") {
            // Full paragraph always renders (remainder invisible), so typing
            // never reflows; the visible slice grows with the char clock.
            const visible = Math.max(
              0,
              Math.min(par.length, charsVisible - parOffsets[pi])
            );
            return (
              <p key={pi} style={{ ...bodyFont, margin: 0 }}>
                {par.slice(0, visible)}
                <span style={{ visibility: "hidden" }}>{par.slice(visible)}</span>
              </p>
            );
          }
          if (animateIn === "words") {
            return (
              <p key={pi} style={{ ...bodyFont, margin: 0 }}>
                {words[pi].map((w, wi) => {
                  const wordIn = pop(frame, fps, textStart + (start + wi) * perWord, {
                    damping: 26,
                    stiffness: 170,
                  });
                  return (
                    <span
                      key={wi}
                      style={{
                        display: "inline-block",
                        marginRight: "0.28em",
                        opacity: wordIn,
                        transform: `translateY(${(1 - wordIn) * rem(14)}px)`,
                      }}
                    >
                      {w}
                    </span>
                  );
                })}
              </p>
            );
          }
          if (animateIn === "paragraphs") {
            const parIn = pop(frame, fps, textStart + pi * perParagraph, {
              damping: 24,
              stiffness: 130,
            });
            return (
              <div key={pi} style={{ overflow: "hidden" }}>
                <p
                  style={{
                    ...bodyFont,
                    margin: 0,
                    transform: `translateY(${(1 - parIn) * 105}%)`,
                  }}
                >
                  {par}
                </p>
              </div>
            );
          }
          return (
            <p key={pi} style={{ ...bodyFont, margin: 0 }}>
              {par}
            </p>
          );
        })}
      </div>
    </div>
  );
};

export const tweetCardDef: TemplateDef = {
  slug: "tweet-card",
  title: "Tweet Card",
  tier: "free",
  category: "Social",
  description:
    "The tweet screenshot format, animated: avatar and handle header, text that lands word by word (or character-by-character with a real recorded keyboard, by paragraph, or as a fade). Add the shared overlay camera for the same timed settle used by Quote Card.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen"],
  schema,
  demoProps: {
    name: "Ricardo Metring",
    handle: "@ricardometring",
    avatar: "/demo/avatar.png",
    verified: true,
    text: "Nobody rewatches a raw screen recording.\n\nGive the clip a hook, captions, and your brand colors. That takes one JSON spec, not an editor. The template already knows the rest.\n\nPost it. Repeat tomorrow.",
  },
  demoDurationSec: 15,
  demoTime: { appear: 7.5, hold: 7.5 },
  demoReveal: "typewriter",
  demoCamera: {
    preset: "pull-out",
    amount: 0.1,
    time: { start: 4, duration: 11 },
  },
  component: TweetCard,
};
