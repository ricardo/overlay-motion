import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { z } from "zod/v3";
import {
  Easing,
  Img,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useVideoConfig,
} from "remotion";
import { surfaceStyle, useBrand } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { useInOut, useOverlayTiming, usePop } from "../../player/motion";
import {
  charOffsets,
  typewriterChars,
} from "../../player/typewriter";
import { useRem, useShortEdgeRem } from "../../player/scale";
import type { TemplateDef } from "../types";

/** Public-folder paths work in the site (Vite) and Remotion CLI renders. */
const resolveAsset = (src: string) =>
  /^(https?:|data:|blob:)/.test(src) ? src : staticFile(src.replace(/^\//, ""));

const schema = z.object({
  quote: z.string(),
  author: z.string(),
  role: z.string().optional(),
  /** Smaller typography and spacing for corner placement. */
  variant: z.enum(["standard", "compact"]).default("standard"),
  /**
   * How the quote lands. "lines" preserves the original wrapped-line rise;
   * "words" drops each word into place, "typewriter" reveals characters,
   * and "blur-in" resolves each word from soft focus. Unset, the spec's
   * `reveal` hint maps to the nearest mode ("typewriter" and "blur-in"
   * directly, "fade-up" to "lines"); otherwise the default is "lines".
   */
  animateIn: z.enum(["lines", "words", "typewriter", "blur-in"]).optional(),
  /**
   * Seconds from the first line starting until the final line is fully visible.
   * "auto" uses the spec's `time.appear` when present (whole card, author
   * included, lands inside it); otherwise the line count sets the pace.
   */
  revealDurationSec: z.union([z.literal("auto"), z.number().positive()]).default("auto"),
  /** Full <svg> markup replacing the default quote mark; use currentColor to inherit the brand primary. */
  markSvg: z.string().optional(),
  /** Photo of the quoted person, cropped to a circle next to the author line. */
  avatar: z.string().optional(),
  wordSfx: templateSfx
    .default("quote-word")
    .describe(
      "Tick fired once per revealed word. Ships the bundled `quote-word` library click; `false` reveals in silence, any cue name or audio path swaps it.",
    ),
});

const REVEAL_START_SEC = 0.1;
const AUTO_LINE_REVEAL_SEC = 0.35;
const AUTO_LINE_STAGGER_SEC = 0.1;
const AUTHOR_DELAY_SEC = 0.2;
const AUTHOR_POP_SEC = 0.35;

/**
 * Spec `time.appear` budgets the whole card: lead-in, lines, author delay and
 * author pop. Lines get what remains, floored at 40% so a tiny appear never
 * collapses the reveal to zero.
 */
const linesSecFromAppear = (appearSec: number) =>
  Math.max(
    appearSec * 0.4,
    appearSec - REVEAL_START_SEC - AUTHOR_DELAY_SEC - AUTHOR_POP_SEC
  );

/**
 * Gives every line an overlapping reveal window while keeping the requested
 * first-line-to-final-line duration exact. Auto preserves the original pace:
 * a 350ms line reveal with another line starting every 100ms.
 */
const quoteRevealTiming = (
  lineCount: number,
  fps: number,
  requested: "auto" | number
) => {
  const count = Math.max(1, lineCount);
  const autoDurationSec =
    AUTO_LINE_REVEAL_SEC + Math.max(0, count - 1) * AUTO_LINE_STAGGER_SEC;
  const totalFrames = Math.max(
    1,
    Math.round((requested === "auto" ? autoDurationSec : requested) * fps)
  );
  const staggerToRevealRatio = AUTO_LINE_STAGGER_SEC / AUTO_LINE_REVEAL_SEC;
  const totalUnits = 1 + Math.max(0, count - 1) * staggerToRevealRatio;
  const lineRevealFrames = totalFrames / totalUnits;
  const lineStaggerFrames = lineRevealFrames * staggerToRevealRatio;
  const startFrame = Math.round(REVEAL_START_SEC * fps);

  return {
    startFrame,
    totalFrames,
    lineRevealFrames,
    lineStaggerFrames,
    endFrame: startFrame + totalFrames,
  };
};

/**
 * Reveals the quote line by line. "Line" means the real wrapped line: a hidden
 * copy of the text lays out naturally, words are grouped by offsetTop, and
 * delayRender holds the frame until that measurement exists.
 */
const QuoteCard = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const widthRem = useRem();
  const shortEdgeRem = useShortEdgeRem();
  const { fps } = useVideoConfig();
  const { frame, exit } = useInOut();
  const compact = p.variant === "compact";
  const rem = compact ? shortEdgeRem : widthRem;

  const words = useMemo(() => p.quote.split(" "), [p.quote]);
  const quoteFontSize = rem(compact ? 36 : 58);
  const measureRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  const delayHandle = useRef<number | null>(null);
  if (delayHandle.current === null && lines === null) {
    delayHandle.current = delayRender("quote-card: measure wrapped lines");
  }

  useLayoutEffect(() => {
    let cancelled = false;
    let lastResult: string | null = null;
    const el = measureRef.current;
    if (!el) return;
    const measure = () => {
      if (cancelled) return;
      // Zero width means the container isn't laid out yet (the renderer CLI
      // mounts the tree before the viewport gets its size); measuring now
      // would wrap every word onto its own line. The ResizeObserver calls
      // back once real layout arrives.
      if (el.offsetWidth <= 0) return;
      const groups: string[][] = [];
      let lastTop: number | null = null;
      for (const span of Array.from(el.children) as HTMLElement[]) {
        if (lastTop === null || Math.abs(span.offsetTop - lastTop) > 1) {
          groups.push([]);
          lastTop = span.offsetTop;
        }
        groups[groups.length - 1].push(span.textContent?.trim() ?? "");
      }
      const next = groups.map((g) => g.join(" "));
      const key = next.join("\n");
      if (key !== lastResult) {
        lastResult = key;
        setLines(next);
      }
      if (delayHandle.current !== null) {
        continueRender(delayHandle.current);
        delayHandle.current = null;
      }
    };
    // Wrapping shifts when the container is first sized and once the brand
    // font arrives; remeasure on both.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (typeof document !== "undefined" && document.fonts && document.fonts.status !== "loaded") {
      document.fonts.ready.then(measure);
    }
    measure();
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [p.quote, brand.fonts.heading, quoteFontSize]);

  const lineCount = lines?.length ?? Math.ceil(words.length / 5);
  const timing = useOverlayTiming();
  const requestedReveal =
    p.revealDurationSec === "auto" && timing.appearFrames !== null
      ? linesSecFromAppear(timing.appearFrames / fps)
      : p.revealDurationSec;
  const revealTiming = quoteRevealTiming(lineCount, fps, requestedReveal);
  const animateIn =
    p.animateIn ??
    (timing.reveal === "typewriter"
      ? "typewriter"
      : timing.reveal === "blur-in"
        ? "blur-in"
        : "lines"); // "fade-up" and unset both land on the native line rise
  const typewriter = animateIn === "typewriter";
  const lineOffsets = charOffsets(lines ?? []);
  const typeWindow = {
    startFrame: revealTiming.startFrame,
    typingFrames: revealTiming.totalFrames,
    totalChars: (lines ?? []).reduce((n, l) => n + l.length, 0),
  };
  const charsVisible = typewriterChars(frame, typeWindow);
  const wordsByLine = useMemo(
    () => (lines ?? []).map((line) => line.split(/\s+/).filter(Boolean)),
    [lines]
  );
  const wordOffsets = useMemo(() => {
    let count = 0;
    return wordsByLine.map((lineWords) => {
      const offset = count;
      count += lineWords.length;
      return offset;
    });
  }, [wordsByLine]);
  const animatedWordCount = wordsByLine.reduce(
    (count, lineWords) => count + lineWords.length,
    0
  );
  const wordSettleFrames = Math.max(
    1,
    Math.min(Math.round(fps * 0.36), revealTiming.totalFrames)
  );
  const lastWordStart = Math.max(0, revealTiming.totalFrames - wordSettleFrames);
  const wordStaggerFrames =
    animatedWordCount > 1 ? lastWordStart / (animatedWordCount - 1) : 0;
  const quoteCueFrames = (() => {
    if (lines === null) return [];
    if (animateIn === "lines") {
      return lines.map((_, i) =>
        Math.round(revealTiming.startFrame + i * revealTiming.lineStaggerFrames)
      );
    }
    if (animateIn === "typewriter") {
      const totalChars = Math.max(1, typeWindow.totalChars);
      const starts: number[] = [];
      for (let lineIndex = 0; lineIndex < wordsByLine.length; lineIndex++) {
        let charIndex = lineOffsets[lineIndex];
        for (const word of wordsByLine[lineIndex]) {
          starts.push(
            Math.round(
              typeWindow.startFrame +
                (charIndex / totalChars) * typeWindow.typingFrames
            )
          );
          charIndex += word.length + 1;
        }
      }
      return starts;
    }
    return Array.from({ length: animatedWordCount }, (_, i) =>
      Math.round(revealTiming.startFrame + i * wordStaggerFrames)
    );
  })();
  const uniqueQuoteCueFrames = [...new Set(quoteCueFrames)];
  const markIn = usePop(0, { damping: 12, stiffness: 120 });
  const authorStartFrame = revealTiming.endFrame + Math.round(AUTHOR_DELAY_SEC * fps);
  const authorIn = usePop(authorStartFrame, { damping: 200 });

  const quoteFont = {
    fontFamily: brand.fonts.heading,
    fontSize: quoteFontSize,
    fontWeight: 700,
    lineHeight: 1.3,
  } as const;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: rem(compact ? 600 : 880),
        ...surfaceStyle(brand, rem),
        borderRadius: rem(brand.radius),
        padding: rem(compact ? 48 : 64),
        opacity: exit,
      }}
    >
      {p.markSvg ? (
        <div
          className="qc-mark"
          style={{
            width: rem(compact ? 72 : 110),
            height: rem(compact ? 60 : 90),
            color: brand.colors.primary,
            transform: `scale(${markIn})`,
            transformOrigin: "bottom left",
            marginBottom: rem(compact ? 12 : 20),
          }}
          dangerouslySetInnerHTML={{ __html: p.markSvg }}
        />
      ) : (
        <div
          style={{
            fontFamily: brand.fonts.heading,
            fontSize: rem(compact ? 92 : 140),
            lineHeight: 0.6,
            color: brand.colors.primary,
            transform: `scale(${markIn})`,
            transformOrigin: "bottom left",
            marginBottom: rem(compact ? 12 : 20),
          }}
        >
          {"“"}
        </div>
      )}
      {p.markSvg ? (
        <style>{".qc-mark svg{width:100%;height:100%;display:block}"}</style>
      ) : null}
      <div style={{ position: "relative" }}>
        <div
          ref={measureRef}
          aria-hidden
          style={{
            ...quoteFont,
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            visibility: "hidden",
            pointerEvents: "none",
          }}
        >
          {words.map((w, i) => (
            <span key={i}>{w} </span>
          ))}
        </div>
        {uniqueQuoteCueFrames.map((cueFrame) => (
          // Word-reveal tick from the CC0 SFX library (docs/sfx-library.md);
          // fires once per revealed word, so it must stay short and neutral.
          // Custom cue name keeps it remappable/mutable from the spec.
          <PropSfx
            key={`quote-word-${cueFrame}`}
            sfx={p.wordSfx}
            at={cueFrame}
            volume={0.14}
          />
        ))}
        {(lines ?? []).map((line, i) => {
          if (typewriter) {
            // Full line always renders (remainder invisible), so typing never
            // shifts layout; the visible slice grows with the char clock.
            const visible = Math.max(
              0,
              Math.min(line.length, charsVisible - lineOffsets[i])
            );
            return (
              <div key={i} style={{ ...quoteFont, color: brand.colors.onSurface }}>
                {line.slice(0, visible)}
                <span style={{ visibility: "hidden" }}>{line.slice(visible)}</span>
              </div>
            );
          }
          if (animateIn === "words" || animateIn === "blur-in") {
            return (
              <div key={i} style={{ ...quoteFont, color: brand.colors.onSurface }}>
                {wordsByLine[i].map((word, wordIndex) => {
                  const startFrame =
                    revealTiming.startFrame +
                    (wordOffsets[i] + wordIndex) * wordStaggerFrames;
                  const progress = interpolate(
                    frame,
                    [startFrame, startFrame + wordSettleFrames],
                    [0, 1],
                    {
                      easing: Easing.out(Easing.cubic),
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }
                  );
                  const blur =
                    animateIn === "blur-in"
                      ? interpolate(progress, [0, 0.86, 1], [rem(34), rem(3), 0])
                      : 0;
                  const transform =
                    animateIn === "blur-in"
                      ? `translateY(${(1 - progress) * rem(8)}px) scale(${0.88 + progress * 0.12})`
                      : `translateY(${(1 - progress) * -rem(24)}px)`;

                  return (
                    <span key={`${word}-${wordIndex}`}>
                      <span
                        style={{
                          display: "inline-block",
                          opacity: progress,
                          filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
                          transform,
                          transformOrigin: "50% 55%",
                          willChange: "transform, filter, opacity",
                        }}
                      >
                        {word}
                      </span>
                      {wordIndex < wordsByLine[i].length - 1 ? " " : null}
                    </span>
                  );
                })}
              </div>
            );
          }
          const lineStart = revealTiming.startFrame + i * revealTiming.lineStaggerFrames;
          const lineIn = interpolate(
            frame,
            [lineStart, lineStart + revealTiming.lineRevealFrames],
            [0, 1],
            {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }
          );
          return (
            <div key={i} style={{ overflow: "hidden" }}>
              <div
                style={{
                  ...quoteFont,
                  color: brand.colors.onSurface,
                  transform: `translateY(${(1 - lineIn) * 105}%)`,
                }}
              >
                {line}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: rem(compact ? 12 : 18),
          marginTop: rem(compact ? 24 : 44),
          opacity: authorIn,
          transform: `translateY(${(1 - authorIn) * rem(10)}px)`,
        }}
      >
        {p.avatar ? (
          <Img
            src={resolveAsset(p.avatar)}
            style={{
              width: rem(compact ? 60 : 88),
              height: rem(compact ? 60 : 88),
              borderRadius: rem(999),
              objectFit: "cover",
            }}
          />
        ) : (
          <div style={{ width: rem(compact ? 42 : 64), height: rem(compact ? 6 : 8), backgroundColor: brand.colors.primary, borderRadius: rem(4) }} />
        )}
        <div>
          <div style={{ fontSize: rem(compact ? 24 : 36), fontWeight: 700, color: brand.colors.onSurface }}>
            {p.author}
          </div>
          {p.role ? (
            <div style={{ fontSize: rem(compact ? 18 : 28), color: brand.colors.muted }}>{p.role}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const quoteCardDef: TemplateDef = {
  slug: "quote-card",
  title: "Quote Card",
  tier: "free",
  category: "Text",
  description:
    "Testimonial with weight: oversized quote mark (swappable for your own SVG) and four text entrances via `animateIn`: wrapped lines, words dropping into place, character typewriter, or blurred words settling into focus. Spec `time.appear` sets how fast the whole card lands, `time.hold` how long it stays; a `pull-out` camera widens as the card enters.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen"],
  schema,
  demoProps: {
    quote: "We stopped briefing designers for launch clips. The templates already know our brand.",
    author: "Ricardo Metring",
    role: "Developer of OverlayMotion",
    avatar: "/demo/avatar.png",
    animateIn: "words",
  },
  // Stacked with `demoCamera` below on purpose: the pull-out is the viewer's
  // eye widening, the sway is the card itself turning in space. Two layers, one
  // shot. Delete this line and the camera still works, and vice versa.
  // Far slower than the style's own tempo, because a quote is read, not
  // glanced at: the turn should finish behind the reader rather than pace
  // them. At 0.09Hz a full cycle takes 11s, so the demo's 8s window shows
  // roughly three quarters of one pass and never repeats itself on screen.
  // Shallow too, well under the style's 0.7 default: this card carries four
  // lines to read, and the style's own limit is legibility, not taste. 0.3
  // lands near 7deg, enough to see the card is a plane in space and little
  // enough that the far edge of a line never foreshortens.
  defaultMotion: { style: "sway-3d", frequency: 0.09, amount: 0.3 },
  demoDurationSec: 8,
  demoTime: { appear: 2, hold: 6 },
  demoReveal: "typewriter",
  demoCamera: {
    preset: "pull-out",
    amount: 0.06,
    time: { start: 0, duration: 4 },
  },
  component: QuoteCard,
};
