import { useMemo } from "react";
import { z } from "zod/v3";
import { Easing, interpolate, useVideoConfig } from "remotion";
import { surfaceStyle, useBrand, withAlpha } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { useInOut } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const schema = z.object({
  title: z.string(),
  data: z
    .array(
      z.object({
        label: z.string(),
        value: z.number(),
        highlight: z.boolean().optional(),
      })
    )
    .min(2)
    .max(8),
  suffix: z.string().default(""),
  tickSfx: templateSfx
    .default("tick")
    .describe(
      "One restrained cue as each bar begins growing. `false` grows the bars in silence; any cue name or audio path swaps it.",
    ),
});

const GROW_EASING = Easing.out(Easing.quad);

const decimalPlaces = (value: number): number => {
  if (Number.isInteger(value)) return 0;
  const [, fraction = ""] = String(value).split(".");
  return Math.min(fraction.length, 6);
};

const growingValue = (value: number, progress: number): string | number => {
  const decimals = decimalPlaces(value);
  const current = value * progress;
  return decimals === 0 ? Math.round(current) : current.toFixed(decimals);
};

/**
 * Video charts get no hover layer, so the direct value label at each bar end
 * is the tooltip. One accent entity: highlighted bar wears primary, the rest
 * a neutral tone. Text always wears text tokens, never the series color.
 */
const BarChart = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { fps, durationInFrames } = useVideoConfig();
  const { frame, exit } = useInOut();
  const max = Math.max(...p.data.map((d) => d.value));
  const growStart = Math.round(fps * 0.25);
  const growEnd = Math.min(
    durationInFrames - Math.round(fps * 1.1),
    Math.max(growStart + fps, Math.round(durationInFrames * 0.65))
  );
  const stagger =
    p.data.length > 1
      ? Math.round(((growEnd - growStart) * 0.4) / (p.data.length - 1))
      : 0;
  const growDuration = Math.max(
    fps,
    growEnd - growStart - stagger * (p.data.length - 1)
  );
  // Keep enough horizontal room for the end label. Without this fixed reserve,
  // flex-shrink visually caps the longest bar before its count-up is complete.
  const valueReserve = rem(180);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: rem(900),
        ...surfaceStyle(brand, rem),
        borderRadius: rem(brand.radius),
        padding: rem(56),
        opacity: exit,
        boxShadow: `0 ${rem(24)}px ${rem(80)}px rgba(0, 0, 0, 0.18)`,
      }}
    >
      {p.data.map((_, index) => (
        <PropSfx
          key={`bar-tick-${index}`}
          sfx={p.tickSfx}
          at={growStart + index * stagger}
          volume={0.24}
        />
      ))}
      <div
        style={{
          fontFamily: brand.fonts.heading,
          fontSize: rem(52),
          fontWeight: 800,
          color: brand.colors.onSurface,
          marginBottom: rem(44),
        }}
      >
        {p.title}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: rem(30),
          borderLeft: `${rem(3)}px solid ${withAlpha(brand.colors.onSurface, 0.22)}`,
          paddingLeft: rem(24),
        }}
      >
        {p.data.map((d, i) => {
          const barStart = growStart + i * stagger;
          const easedGrow = interpolate(
            frame,
            [barStart, barStart + growDuration],
            [0, 1],
            {
              easing: GROW_EASING,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }
          );
          // Final eased movement is less than one pixel at this layout size.
          // Snap both channels together so a visually complete bar can never
          // sit beside a value that is still counting.
          const grow = easedGrow >= 0.999 ? 1 : easedGrow;
          const widthPct = (d.value / max) * 100 * grow;
          const color = d.highlight
            ? brand.colors.primary
            : withAlpha(brand.colors.onSurface, 0.18);
          return (
            <div key={i}>
              <div
                style={{
                  fontSize: rem(30),
                  fontWeight: 600,
                  color: brand.colors.muted,
                  marginBottom: rem(10),
                }}
              >
                {d.label}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: rem(18),
                  width: `calc(100% - ${valueReserve}px)`,
                }}
              >
                <div
                  style={{
                    height: rem(40),
                    flex: `0 0 ${Math.max(widthPct, 1.5)}%`,
                    backgroundColor: color,
                    borderRadius: rem(8),
                  }}
                />
                <div
                  style={{
                    fontSize: rem(34),
                    fontWeight: 700,
                    color: brand.colors.onSurface,
                    opacity: grow,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {growingValue(d.value, grow)}
                  {p.suffix}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const barChartDef: TemplateDef = {
  slug: "bar-chart",
  title: "Bar Chart",
  tier: "free",
  category: "Charts",
  description:
    "Horizontal bars that grow in with a stagger. One entity stands out from the rest; values sit at the data ends because video has no hover.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen", "lower-third"],
  schema,
  demoProps: {
    title: "Signups by channel",
    suffix: "",
    tickSfx: "tick",
    data: [
      { label: "Organic search", value: 4820, highlight: true },
      { label: "Referrals", value: 3100 },
      { label: "Social", value: 2260 },
      { label: "Paid", value: 1490 },
    ],
  },
  demoDurationSec: 12,
  demoCamera: {
    preset: "pull-out",
    amount: 0.1,
    time: { start: 7.8, duration: 3.5 },
  },
  component: BarChart,
};
