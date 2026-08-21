import { useMemo } from "react";
import { z } from "zod/v3";
import { useVideoConfig } from "remotion";
import { surfaceStyle, useBrand, withAlpha } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { pop, useInOut, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const schema = z.object({
  title: z.string().optional(),
  beforeLabel: z.string().default("Before"),
  beforeValue: z.string(),
  afterLabel: z.string().default("After"),
  afterValue: z.string(),
  caption: z.string().optional(),
  sfx: templateSfx
    .default("pop")
    .describe(
      "Sound the moment the after value lands. `false` is silence, any cue name or audio path swaps it.",
    ),
});

/** Before always sits on the left, after on the right. Fixed reading order. */
const BeforeAfter = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { fps } = useVideoConfig();
  const { frame, exit } = useInOut();

  const cardIn = usePop(0, { damping: 20, stiffness: 110 });
  const beforeIn = pop(frame, fps, 6, { damping: 18, stiffness: 120 });
  const arrowIn = pop(frame, fps, Math.round(fps * 0.45), { damping: 200 });
  const afterAt = Math.round(fps * 0.7);
  const afterIn = pop(frame, fps, afterAt, { damping: 13, stiffness: 150 });
  const captionIn = pop(frame, fps, afterAt + Math.round(fps * 0.4), { damping: 200 });

  const panel = {
    flex: 1,
    borderRadius: rem(brand.radius),
    padding: `${rem(44)}px ${rem(36)}px`,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: rem(18),
    textAlign: "center" as const,
  };
  const labelStyle = {
    fontSize: rem(28),
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
  };
  const valueStyle = {
    fontFamily: brand.fonts.heading,
    fontSize: rem(76),
    fontWeight: 800,
    lineHeight: 1.05,
    fontVariantNumeric: "tabular-nums" as const,
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: rem(880),
        ...surfaceStyle(brand, rem),
        borderRadius: rem(brand.radius),
        padding: rem(56),
        opacity: exit * cardIn,
        transform: `translateY(${(1 - cardIn) * rem(40)}px)`,
        boxShadow: `0 ${rem(24)}px ${rem(80)}px rgba(0, 0, 0, 0.18)`,
      }}
    >
      <PropSfx sfx={p.sfx} at={afterAt} volume={0.6} />
      {p.title ? (
        <div
          style={{
            fontFamily: brand.fonts.heading,
            fontSize: rem(52),
            fontWeight: 800,
            color: brand.colors.onSurface,
            marginBottom: rem(40),
            textAlign: "center",
          }}
        >
          {p.title}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "stretch", gap: rem(28) }}>
        <div
          style={{
            ...panel,
            backgroundColor: withAlpha(brand.colors.onSurface, 0.06),
            opacity: beforeIn,
            transform: `translateX(${(1 - beforeIn) * rem(-50)}px)`,
          }}
        >
          <div style={{ ...labelStyle, color: brand.colors.muted }}>{p.beforeLabel}</div>
          <div style={{ ...valueStyle, color: brand.colors.muted }}>{p.beforeValue}</div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            opacity: arrowIn,
            flexShrink: 0,
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: rem(64), height: rem(64) }}>
            <path
              d="M3 12 H19 M13 5.5 L20 12 L13 18.5"
              fill="none"
              stroke={brand.colors.primary}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - Math.min(1, arrowIn)}
            />
          </svg>
        </div>
        <div
          style={{
            ...panel,
            backgroundColor: brand.colors.primary,
            opacity: afterIn,
            transform: `scale(${0.75 + 0.25 * afterIn})`,
            boxShadow: `0 ${rem(16)}px ${rem(50)}px ${withAlpha(brand.colors.primary, 0.35)}`,
          }}
        >
          <div style={{ ...labelStyle, color: brand.colors.onPrimary, opacity: 0.75 }}>
            {p.afterLabel}
          </div>
          <div style={{ ...valueStyle, color: brand.colors.onPrimary }}>{p.afterValue}</div>
        </div>
      </div>
      {p.caption ? (
        <div
          style={{
            marginTop: rem(36),
            fontSize: rem(34),
            color: brand.colors.muted,
            textAlign: "center",
            opacity: captionIn,
            transform: `translateY(${(1 - captionIn) * rem(12)}px)`,
          }}
        >
          {p.caption}
        </div>
      ) : null}
    </div>
  );
};

export const beforeAfterDef: TemplateDef = {
  slug: "before-after",
  title: "Before After",
  tier: "free",
  category: "Social",
  description:
    "The improvement slide: before on the left, muted; after landing on the right, highlighted. For time saved, cost cut, results gained. The arrow does the arguing.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen"],
  schema,
  demoProps: {
    title: "Editing time per video",
    beforeValue: "12 hrs",
    afterValue: "8 min",
    caption: "Same brand, every format, zero timelines",
  },
  demoDurationSec: 5,
  component: BeforeAfter,
};
