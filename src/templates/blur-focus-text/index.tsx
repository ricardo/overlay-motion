import { useMemo } from "react";
import { z } from "zod/v3";
import { Easing, interpolate } from "remotion";
import { useInOut, useOverlayTiming } from "../../player/motion";
import { useRem } from "../../player/scale";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { useBrand } from "../../theme/themes";
import type { TemplateDef } from "../types";

const schema = z.object({
  text: z.string().min(1),
  emphasis: z.string().default("obsessed"),
  settlementAnimation: z.boolean().default(true),
  sfx: templateSfx
    .default("word-settle")
    .describe(
      "Click as each word settles into focus. Ships the bundled `word-settle` library click; `false` settles in silence.",
    ),
});

const normalizeWord = (word: string) =>
  word.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * Words occupy their final layout from frame zero. Motion happens only inside
 * each word, so later arrivals never push settled text around.
 */
const BlurFocusText = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { frame, fps, exit } = useInOut();
  const { appearFrames } = useOverlayTiming();
  const words = p.text.trim().split(/\s+/);
  const emphasis = normalizeWord(p.emphasis);

  const entranceFrames = appearFrames ?? Math.round(fps * 1.15);
  const settleFrames = Math.max(1, Math.min(Math.round(fps * 0.36), entranceFrames));
  const tickFrames = Math.max(4, Math.round(fps * 0.12));
  const lastStart = Math.max(0, entranceFrames - settleFrames);
  const stagger = words.length > 1 ? lastStart / (words.length - 1) : 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: `${rem(80)}px ${rem(72)}px`,
        opacity: exit,
      }}
    >
      {words.map((word, index) => (
        <PropSfx
          key={`settle-${word}-${index}`}
          // Gain is scaled down in the cue itself: the library file peaks
          // ~5dB above the core tick.
          sfx={p.sfx}
          // The ease-out settle reads as "in focus" near its halfway point
          // (blur is already ~4px at progress 0.86 ≈ t 0.48); ticking at the
          // mathematical end sounds late against the eye.
          at={Math.round(index * stagger + settleFrames * 0.5)}
          volume={0.2}
        />
      ))}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "baseline",
          columnGap: rem(25),
          rowGap: rem(18),
          maxWidth: rem(780),
          color: brand.colors.onSurface,
          fontFamily: brand.fonts.heading,
          fontSize: rem(106),
          fontWeight: 560,
          lineHeight: 1.08,
          letterSpacing: "-0.045em",
          textAlign: "center",
        }}
      >
        {words.map((word, index) => {
          const delay = index * stagger;
          const progress = interpolate(
            frame,
            [delay, delay + settleFrames],
            [0, 1],
            {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }
          );
          const opacity = interpolate(progress, [0, 0.34, 1], [0, 0.72, 1]);
          const entranceScale = interpolate(progress, [0, 1], [2.45, 1]);
          const blur = interpolate(progress, [0, 0.86, 1], [rem(64), rem(4), 0]);
          const settledAt = delay + settleFrames;
          const tick = interpolate(
            frame,
            [settledAt, settledAt + tickFrames * 0.42, settledAt + tickFrames],
            [1, 1.045, 1],
            {
              easing: Easing.inOut(Easing.quad),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }
          );
          const isEmphasis = normalizeWord(word) === emphasis;

          return (
            <span
              key={`${word}-${index}`}
              style={{
                display: "inline-block",
                opacity,
                filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
                transform: `scale(${entranceScale * (p.settlementAnimation ? tick : 1)})`,
                transformOrigin: "50% 55%",
                fontWeight: isEmphasis ? 900 : 560,
                willChange: "transform, filter, opacity",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const blurFocusTextDef: TemplateDef = {
  slug: "blur-focus-text",
  title: "Blur Focus Text",
  tier: "free",
  category: "Text",
  description:
    "A cinematic word-by-word opener on a full-frame background. Each word starts oversized and heavily blurred, resolves into a stable headline, then marks its landing with a crisp scale tick before a slight pull-out.",
  sourceContract: "overlay",
  regions: ["fullscreen", "center"],
  schema,
  demoProps: {
    text: "Here's why we are all obsessed",
    emphasis: "obsessed",
    settlementAnimation: true,
  },
  demoDurationSec: 5,
  demoTime: { appear: 3, hold: 2 },
  demoCamera: {
    preset: "pull-out",
    amount: 0.04,
    time: { start: 3, duration: 2 },
  },
  component: BlurFocusText,
};
