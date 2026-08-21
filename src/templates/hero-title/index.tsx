import { useMemo } from "react";
import { z } from "zod/v3";
import { interpolate } from "remotion";
import { useBrand } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { pop, useInOut, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const schema = z.object({
  kicker: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  sfx: templateSfx
    .default("typewriter")
    .describe(
      "Key press fired once per word as the title types on. `false` is silence, any cue name or audio path swaps it.",
    ),
});

const HeroTitle = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { frame, fps, exit } = useInOut();
  const words = p.title.split(" ");
  const kickerIn = usePop(0);
  const underline = interpolate(
    frame,
    [words.length * 4 + 10, words.length * 4 + 10 + fps * 0.6],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const subIn = usePop(words.length * 4 + 14, { damping: 200 });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        padding: rem(64),
        opacity: exit,
      }}
    >
      {words.map((_, i) => (
        <PropSfx key={`w-${i}`} sfx={p.sfx} at={i * 4} volume={0.35} />
      ))}
      {p.kicker ? (
        <div
          style={{
            transform: `translateY(${(1 - kickerIn) * rem(20)}px)`,
            opacity: kickerIn,
            backgroundColor: brand.colors.primary,
            color: brand.colors.onPrimary,
            borderRadius: rem(999),
            padding: `${rem(10)}px ${rem(28)}px`,
            fontSize: rem(30),
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: rem(40),
          }}
        >
          {p.kicker}
        </div>
      ) : null}
      <h1
        style={{
          margin: 0,
          fontFamily: brand.fonts.heading,
          fontSize: rem(110),
          lineHeight: 1.08,
          color: brand.colors.onSurface,
          fontWeight: 800,
          maxWidth: "100%",
        }}
      >
        {words.map((w, i) => {
          const wordIn = pop(frame, fps, i * 4, { damping: 16, stiffness: 140 });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: rem(24),
                opacity: wordIn,
                transform: `translateY(${(1 - wordIn) * rem(60)}px)`,
              }}
            >
              {w}
            </span>
          );
        })}
      </h1>
      <div
        style={{
          height: rem(12),
          width: rem(340) * underline,
          backgroundColor: brand.colors.primary,
          borderRadius: rem(6),
          marginTop: rem(36),
        }}
      />
      {p.subtitle ? (
        <p
          style={{
            margin: 0,
            marginTop: rem(36),
            fontSize: rem(40),
            color: brand.colors.muted,
            opacity: subIn,
            transform: `translateY(${(1 - subIn) * rem(16)}px)`,
            maxWidth: rem(760),
          }}
        >
          {p.subtitle}
        </p>
      ) : null}
    </div>
  );
};

export const heroTitleDef: TemplateDef = {
  slug: "hero-title",
  title: "Hero Title",
  tier: "free",
  category: "Text",
  description:
    "Kinetic full-screen opener. Words spring in one by one, a bar grows, the subtitle settles. The classic first 2 seconds of a branded video.",
  sourceContract: "overlay",
  regions: ["fullscreen"],
  schema,
  demoProps: {
    kicker: "New drop",
    title: "Ship video in your brand",
    subtitle: "Same template, your tokens. Nothing to design.",
  },
  demoDurationSec: 5,
  component: HeroTitle,
};
