import { useMemo } from "react";
import { z } from "zod/v3";
import { Easing, interpolate, useVideoConfig } from "remotion";
import { mixHex, surfaceStyle, useBrand, withAlpha } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { pop, useInOut } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const color = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color")
  .optional();

export const donutBreakdownSchema = z.object({
  title: z.string().min(1),
  centerLabel: z.string().default("Total"),
  data: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.number().positive(),
        color,
        highlight: z.boolean().default(false),
      }),
    )
    .min(2)
    .max(6),
  valuePrefix: z.string().default(""),
  valueSuffix: z.string().default(""),
  decimals: z.number().int().min(0).max(2).default(0),
  showPercent: z.boolean().default(true),
  drawSec: z
    .number()
    .min(0.8)
    .max(8)
    .default(2.4)
    .describe("Total drawing time, divided equally between all sections."),
  sectionEasing: z
    .enum(["linear", "ease-in", "ease-out", "ease-in-out"])
    .default("ease-in-out")
    .describe("Motion curve applied independently to every section."),
  segmentSfx: templateSfx
    .default("tick")
    .describe(
      "Restrained cue as each segment starts drawing. `false` is silence; a cue name or audio path swaps it.",
    ),
  highlightSfx: templateSfx
    .default(false)
    .describe(
      "Optional cue after the complete chart draws when a segment is highlighted. `false` keeps the emphasis visual-only.",
    ),
});

const DonutBreakdown = (raw: Record<string, unknown>) => {
  const p = useMemo(() => donutBreakdownSchema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { fps } = useVideoConfig();
  const { frame, exit } = useInOut();
  const total = p.data.reduce((sum, item) => sum + item.value, 0);
  const defaultColors = [
    brand.colors.primary,
    brand.colors.secondary ?? mixHex(brand.colors.primary, brand.colors.onSurface, 0.2),
    brand.colors.accent ?? mixHex(brand.colors.primary, brand.colors.surface, 0.35),
    mixHex(brand.colors.primary, brand.colors.onSurface, 0.42),
    mixHex(brand.colors.primary, brand.colors.surface, 0.58),
    mixHex(brand.colors.primary, brand.colors.muted, 0.62),
  ];
  const segments = p.data.map((item, index) => ({
    ...item,
    share: (item.value / total) * 100,
    color: item.color ?? defaultColors[index],
  }));
  const start = Math.round(fps * 0.45);
  const totalDrawFrames = Math.round(p.drawSec * fps);
  const easing =
    p.sectionEasing === "linear"
      ? Easing.linear
      : p.sectionEasing === "ease-in"
        ? Easing.in(Easing.cubic)
        : p.sectionEasing === "ease-out"
          ? Easing.out(Easing.cubic)
          : Easing.inOut(Easing.cubic);
  const segmentWindows = segments.map((_, index) => ({
    from: start + Math.round((totalDrawFrames * index) / segments.length),
    to: start + Math.round((totalDrawFrames * (index + 1)) / segments.length),
  }));
  const segmentStarts = segmentWindows.map((window) => window.from);
  const highlightAt = start + totalDrawFrames + Math.round(fps * 0.25);
  const segmentProgresses = segmentWindows.map((window) =>
    interpolate(
      frame,
      [window.from, Math.max(window.from + 1, window.to)],
      [0, 1],
      {
        easing,
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    ),
  );
  const displayedTotal = segments
    .reduce(
      (sum, segment, index) => sum + segment.value * segmentProgresses[index],
      0,
    )
    .toFixed(p.decimals);
  let cumulative = 0;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: rem(900),
        boxSizing: "border-box",
        ...surfaceStyle(brand, rem),
        borderRadius: rem(brand.radius),
        padding: rem(44),
        opacity: exit,
        boxShadow: `0 ${rem(28)}px ${rem(90)}px rgba(0,0,0,.2)`,
      }}
    >
      <div
        style={{
          fontFamily: brand.fonts.heading,
          fontSize: rem(46),
          lineHeight: 1.08,
          fontWeight: 850,
          color: brand.colors.onSurface,
          marginBottom: rem(30),
          maxWidth: "100%",
          overflowWrap: "break-word",
          textWrap: "balance",
        }}
      >
        {p.title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: rem(36), minWidth: 0 }}>
        <div
          style={{
            position: "relative",
            width: rem(370),
            height: rem(370),
            flexShrink: 0,
            filter: `drop-shadow(0 ${rem(18)}px ${rem(28)}px rgba(0,0,0,.16))`,
          }}
        >
          <svg viewBox="0 0 240 240" style={{ width: "100%", height: "100%", overflow: "visible" }}>
            <circle
              cx="120"
              cy="120"
              r="82"
              fill="none"
              stroke={withAlpha(brand.colors.onSurface, 0.08)}
              strokeWidth="30"
            />
            {segments.map((segment, index) => {
              const share = segment.share;
              const progress = segmentProgresses[index];
              const dashOffset = -cumulative;
              cumulative += share;
              if (progress <= 0.001) return null;
              return (
                <circle
                  key={segment.label}
                  cx="120"
                  cy="120"
                  r="82"
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="30"
                  strokeLinecap="butt"
                  pathLength="100"
                  strokeDasharray={`${share * progress} ${100 - share * progress}`}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 120 120)"
                />
              );
            })}
          </svg>
          <div
            style={{
              position: "absolute",
              inset: rem(81.7),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: brand.colors.surface,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontSize: rem(22),
                fontWeight: 700,
                color: brand.colors.muted,
                marginBottom: rem(3),
              }}
            >
              {p.centerLabel}
            </div>
            <div
              style={{
                fontFamily: brand.fonts.heading,
                fontSize: rem(44),
                fontWeight: 900,
                color: brand.colors.onSurface,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {p.valuePrefix}{displayedTotal}{p.valueSuffix}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: rem(13) }}>
          {segments.map((segment, index) => {
            const itemIn = pop(frame, fps, segmentStarts[index] + Math.round(fps * 0.2), {
              damping: 20,
              stiffness: 125,
            });
            const highlighted = segment.highlight;
            return (
              <div
                key={segment.label}
                style={{
                  display: "grid",
                  gridTemplateColumns: `${rem(18)}px 1fr auto`,
                  alignItems: "center",
                  gap: rem(14),
                  padding: `${rem(12)}px ${rem(14)}px`,
                  borderRadius: rem(16),
                  background: highlighted
                    ? withAlpha(segment.color, 0.13)
                    : withAlpha(brand.colors.onSurface, 0.035),
                  border: `${rem(2)}px solid ${highlighted ? withAlpha(segment.color, 0.35) : "transparent"}`,
                  opacity: 0.28 + itemIn * 0.72,
                  transform: `translateX(${(1 - itemIn) * rem(25)}px)`,
                }}
              >
                <span
                  style={{
                    width: rem(16),
                    height: rem(16),
                    borderRadius: "50%",
                    background: segment.color,
                    boxShadow: highlighted ? `0 0 0 ${rem(6)}px ${withAlpha(segment.color, 0.14)}` : "none",
                  }}
                />
                <span style={{ color: brand.colors.onSurface, fontSize: rem(20), fontWeight: 700, minWidth: 0 }}>
                  {segment.label}
                </span>
                <span
                  style={{
                    color: highlighted ? segment.color : brand.colors.muted,
                    fontSize: rem(20),
                    fontWeight: 850,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {p.showPercent
                    ? `${((segment.value / total) * 100).toFixed(p.decimals)}%`
                    : `${p.valuePrefix}${segment.value.toFixed(p.decimals)}${p.valueSuffix}`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {segmentStarts.map((at, index) => (
        <PropSfx key={`${at}-${index}`} sfx={p.segmentSfx} at={at} volume={0.2} />
      ))}
      {segments.some((segment) => segment.highlight) ? (
        <PropSfx sfx={p.highlightSfx} at={highlightAt} volume={0.58} />
      ) : null}
    </div>
  );
};

export const donutBreakdownDef: TemplateDef = {
  slug: "donut-breakdown",
  title: "Donut Breakdown",
  tier: "free",
  category: "Charts",
  description:
    "Part-to-whole data with seamless sequential segment drawing, a counting center total, direct legend values, and optional legend emphasis.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen"],
  schema: donutBreakdownSchema,
  demoProps: {
    title: "Where customers discover us",
    centerLabel: "Responses",
    data: [
      { label: "Organic", value: 48, highlight: true },
      { label: "Referrals", value: 27 },
      { label: "Community", value: 16 },
      { label: "Paid", value: 9 },
    ],
  },
  demoDurationSec: 7,
  component: DonutBreakdown,
};
