import { useMemo } from "react";
import { z } from "zod/v3";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useInOut } from "../../player/motion";
import { useRem } from "../../player/scale";
import { useBrand } from "../../theme/themes";
import type { TemplateDef } from "../types";

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color");

const schema = z.object({
  title: z.string().default("CORTISOL LEVEL").describe("Heading above the gauge"),
  lowLabel: z.string().default("LOW").describe("Label over the low range"),
  normalLabel: z.string().default("NORMAL").describe("Label over the middle range"),
  highLabel: z.string().default("HIGH").describe("Label over the high range"),
  startValue: z.number().min(0).max(100).default(90).describe("Needle value before the sweep, from 0 to 100"),
  endValue: z.number().min(0).max(100).default(10).describe("Needle value after the sweep, from 0 to 100"),
  delaySeconds: z.number().min(0).default(0.7).describe("Hold before the needle starts moving"),
  sweepSeconds: z.number().positive().default(2.2).describe("Duration of the main needle sweep"),
  settleSeconds: z.number().min(0).default(1.1).describe("Duration of the elastic settling motion after the sweep"),
  overshoot: z.number().min(0).max(15).default(4).describe("Strength of the elastic landing, in value points"),
  elasticBounces: z.number().min(1).max(4).default(2).describe("Number of pointer oscillations while it settles"),
  showValue: z.boolean().default(false).describe("Show the animated numeric value inside the gauge"),
  valueSuffix: z.string().default("").describe("Text appended to the optional numeric value, such as %"),
  lowColor: hexColor.default("#00CD34").describe("First range color"),
  lowMidColor: hexColor.default("#9ACB34").describe("Second range color"),
  normalColor: hexColor.default("#FFCC33").describe("Middle range color"),
  highMidColor: hexColor.default("#FF6600").describe("Fourth range color"),
  highColor: hexColor.default("#FE0002").describe("Final range color"),
  backgroundColor: hexColor.optional().describe("Gauge background; omit to use the theme surface color"),
  textColor: hexColor.optional().describe("Title and label color; omit to use the theme text color"),
  needleColor: hexColor.optional().describe("Needle and hub color; omit to use the theme text color"),
});

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** The artwork is drawn with the low-range midpoint as zero rotation. */
export const cortisolNeedleAngle = (value: number) => (clamp(value, 0, 100) - 10) * 1.8;

export const cortisolValueAtFrame = ({
  frame,
  fps,
  startValue,
  endValue,
  delaySeconds,
  sweepSeconds,
  settleSeconds,
  overshoot,
  elasticBounces,
}: {
  frame: number;
  fps: number;
  startValue: number;
  endValue: number;
  delaySeconds: number;
  sweepSeconds: number;
  settleSeconds: number;
  overshoot: number;
  elasticBounces: number;
}) => {
  const sweepStart = Math.round(delaySeconds * fps);
  const sweepEnd = sweepStart + Math.max(1, Math.round(sweepSeconds * fps));
  const settleEnd = sweepEnd + Math.max(0, Math.round(settleSeconds * fps));
  const direction = Math.sign(endValue - startValue);
  const overshootValue = clamp(endValue + direction * overshoot, 0, 100);

  if (frame <= sweepStart) return startValue;
  if (frame <= sweepEnd) {
    return interpolate(frame, [sweepStart, sweepEnd], [startValue, overshootValue], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.55, 0, 0.2, 1),
    });
  }
  if (settleSeconds === 0 || frame >= settleEnd) return endValue;
  const settleProgress = interpolate(frame, [sweepEnd, settleEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.3, 0, 0.3, 1),
  });
  const damping = Math.pow(1 - settleProgress, 2.2);
  return endValue + direction * overshoot * damping * Math.cos(
    settleProgress * Math.PI * 2 * elasticBounces,
  );
};

const CortisolGauge = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { exit } = useInOut();
  const background = p.backgroundColor ?? brand.colors.surface;
  const text = p.textColor ?? brand.colors.onSurface;
  const needle = p.needleColor ?? brand.colors.onSurface;
  const value = cortisolValueAtFrame({ frame, fps, ...p });
  const angle = cortisolNeedleAngle(value);

  return (
    <div
      style={{
        width: rem(796),
        maxWidth: "100%",
        opacity: exit,
        filter: `drop-shadow(0 ${rem(18)}px ${rem(34)}px rgba(0, 0, 0, 0.14))`,
      }}
    >
      <svg
        viewBox="0 0 796 528"
        role="img"
        aria-label={`${p.title}: ${Math.round(value)}${p.valueSuffix}`}
        style={{ width: "100%", display: "block" }}
      >
        <defs>
          <clipPath id="cortisol-band-clip">
            <rect x="0" y="0" width="796" height="477" />
          </clipPath>
        </defs>

        <rect width="796" height="528" rx="24" fill={background} />
        <text
          x="410"
          y="64"
          textAnchor="middle"
          fill={text}
          fontFamily={brand.fonts.heading}
          fontSize="39.5"
          fontWeight="650"
        >
          {p.title}
        </text>

        <g clipPath="url(#cortisol-band-clip)" fill="none" strokeWidth="143">
          <path stroke={p.lowColor} d="M 175.400 481.000 A 234.5 234.5 0 0 1 220.186 343.164" />
          <path stroke={p.lowMidColor} d="M 220.186 343.164 A 234.5 234.5 0 0 1 337.436 257.977" />
          <path stroke={p.normalColor} d="M 337.436 257.977 A 234.5 234.5 0 0 1 482.364 257.977" />
          <path stroke={p.highMidColor} d="M 482.364 257.977 A 234.5 234.5 0 0 1 599.614 343.164" />
          <path stroke={p.highColor} d="M 599.614 343.164 A 234.5 234.5 0 0 1 644.400 481.000" />
          <g transform="rotate(0.15 409.9 481)" stroke={background} strokeWidth="5.9">
            <path d="M 284.502 389.893 L 154.253 295.260" />
            <path d="M 362.002 333.586 L 312.251 180.466" />
            <path d="M 457.798 333.586 L 507.549 180.466" />
            <path d="M 535.298 389.893 L 665.547 295.260" />
          </g>
        </g>

        <g fill={text} fontFamily={brand.fonts.body} fontWeight="550">
          <text x="143" y="280.5" dy="0.358em" textAnchor="middle" fontSize="30" transform="rotate(-52.17 143 280.5)">{p.lowLabel}</text>
          <text x="414" y="148.9" dy="0.358em" textAnchor="middle" fontSize="31.5" transform="rotate(-0.84 414 148.9)">{p.normalLabel}</text>
          <text x="683.9" y="284.9" dy="0.358em" textAnchor="middle" fontSize="30" transform="rotate(55.01 683.9 284.9)">{p.highLabel}</text>
        </g>

        {p.showValue ? (
          <text
            x="410"
            y="405"
            textAnchor="middle"
            fill={text}
            fontFamily={brand.fonts.heading}
            fontSize="34"
            fontWeight="750"
          >
            {Math.round(value)}{p.valueSuffix}
          </text>
        ) : null}

        <g transform={`rotate(${angle} 409.5 476.5)`} fill={needle}>
          <polygon points="181.9,410.75 425,456.95 425,508" />
        </g>
        <circle cx="409.5" cy="476.5" r="36.1" fill={needle} />
        <circle cx="409.5" cy="476.5" r="26.7" fill={background} />
        <circle cx="409.5" cy="476.5" r="20.5" fill={needle} />
      </svg>
    </div>
  );
};

export const cortisolGaugeDef: TemplateDef = {
  slug: "cortisol-gauge",
  title: "Cortisol Gauge",
  tier: "free",
  category: "Charts",
  description:
    "A five-band health gauge with a needle that sweeps from one reading to another, overshoots, and settles. Configure labels, values, timing, colors, and optional numeric readout.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen"],
  schema,
  demoProps: {
    title: "CORTISOL LEVEL",
    lowLabel: "LOW",
    normalLabel: "NORMAL",
    highLabel: "HIGH",
    startValue: 90,
    endValue: 10,
    delaySeconds: 0.6,
    sweepSeconds: 1.7,
    settleSeconds: 1.1,
    overshoot: 4,
    elasticBounces: 2,
    showValue: false,
  },
  demoDurationSec: 6,
  component: CortisolGauge,
};
