import { useId, useMemo } from "react";
import { z } from "zod/v3";
import { Easing, interpolate, useVideoConfig } from "remotion";
import { mixHex, surfaceStyle, useBrand, withAlpha } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { useInOut, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const schema = z.object({
  value: z.number(),
  prefix: z.string().default(""),
  suffix: z.string().default(""),
  label: z.string(),
  decimals: z.number().int().min(0).max(2).default(0),
  /** hero: big ring, center stage. badge: compact pill for corners. */
  variant: z.enum(["hero", "badge"]).default("hero"),
  /** How the count-up progresses. ease-out (fast start, slow landing) is the industry default. */
  easing: z.enum(["ease-out", "linear", "ease-in-out"]).default("ease-out"),
  countSeconds: z.number().positive().default(6),
  /** A tick on every number change plus a completion chime. */
  sfx: templateSfx
    .default("pop")
    .describe("Sound as the counter card lands. `false` is silence."),
  tickSfx: templateSfx
    .default("tick")
    .describe(
      "Sound on each digit change while the number counts up. `false` counts in silence.",
    ),
  doneSfx: templateSfx
    .default("notification")
    .describe("Sound when the number reaches its final value."),
});

const EASINGS: Record<string, (p: number) => number> = {
  linear: Easing.linear,
  "ease-out": Easing.bezier(0.16, 1, 0.3, 1),
  "ease-in-out": Easing.bezier(0.65, 0, 0.35, 1),
};

/** One tick per formatted-number change, from the first flip to the last. */
const counterChangeTickFrames = (
  value: number,
  decimals: number,
  countFrames: number,
  easing: (p: number) => number
): number[] => {
  const changedFrames: number[] = [];
  let previous = (value * easing(0)).toFixed(decimals);

  for (let frame = 1; frame < countFrames; frame += 1) {
    const current = (value * easing(frame / countFrames)).toFixed(decimals);
    if (current !== previous) changedFrames.push(frame);
    previous = current;
  }
  return changedFrames;
};

const StatCounter = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const gradientId = useId().replace(/:/g, "");
  const brand = useBrand();
  const rem = useRem();
  const { fps } = useVideoConfig();
  const { frame, exit } = useInOut();
  const easing = EASINGS[p.easing];
  const countFrames = Math.max(1, Math.round(fps * p.countSeconds));

  const progress = interpolate(frame, [0, countFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = easing(progress);
  const current = (p.value * eased).toFixed(p.decimals);
  const changeTickFrames = useMemo(
    () => counterChangeTickFrames(p.value, p.decimals, countFrames, easing),
    [p.value, p.decimals, countFrames, easing]
  );
  const gradientHighlight = mixHex(brand.colors.primary, "#ffffff", 0.3);
  const gradientShadow = mixHex(brand.colors.primary, "#000000", 0.2);
  const ringIn = usePop(4, { damping: 200 });
  const labelIn = usePop(Math.round(fps * 0.5), { damping: 200 });
  const cardIn = usePop(0, { damping: 16, stiffness: 130 });
  const counterSounds = (
    <>
      {changeTickFrames.map((at, index) => (
        // Dense early flips play quiet and the last distinct ones loudest, so
        // the per-change wall of ticks reads as a rising sweep, not a buzzer.
        <PropSfx
          key={`change-${at}`}
          sfx={p.tickSfx}
          at={at}
          volume={0.16 + (index / Math.max(1, changeTickFrames.length - 1)) * 0.24}
        />
      ))}
      <PropSfx sfx={p.doneSfx} at={countFrames} volume={0.7} />
    </>
  );

  if (p.variant === "badge") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: rem(22),
          ...surfaceStyle(brand, rem),
          borderRadius: rem(Math.max(brand.radius, 16)),
          padding: `${rem(22)}px ${rem(32)}px`,
          boxShadow: `0 ${rem(14)}px ${rem(44)}px rgba(0, 0, 0, 0.28)`,
          opacity: cardIn * exit,
          transform: `translateY(${(1 - cardIn) * rem(-30)}px) scale(${0.85 + 0.15 * cardIn})`,
          transformOrigin: "top left",
        }}
      >
        <PropSfx sfx={p.sfx} at={0} volume={0.7} />
        {counterSounds}
        <div
          style={{
            width: rem(10),
            alignSelf: "stretch",
            borderRadius: rem(5),
            background: `linear-gradient(180deg, ${gradientHighlight} 0%, ${brand.colors.primary} 48%, ${gradientShadow} 100%)`,
          }}
        />
        <div>
          <div
            style={{
              fontFamily: brand.fonts.heading,
              fontWeight: 800,
              fontSize: rem(64),
              lineHeight: 1.05,
              color: brand.colors.onSurface,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {p.prefix}
            {current}
            {p.suffix}
          </div>
          <div style={{ fontSize: rem(28), fontWeight: 600, color: brand.colors.muted }}>
            {p.label}
          </div>
        </div>
      </div>
    );
  }

  const size = rem(620);
  const stroke = rem(20);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: exit,
      }}
    >
      {counterSounds}
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradientHighlight} />
              <stop offset="52%" stopColor={brand.colors.primary} />
              <stop offset="100%" stopColor={gradientShadow} />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={withAlpha(brand.colors.onSurface, 0.12)}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - eased * ringIn)}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: brand.fonts.heading,
            fontWeight: 800,
            fontSize: rem(150),
            color: brand.colors.onSurface,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {p.prefix}
          {current}
          {p.suffix}
        </div>
      </div>
      <div
        style={{
          marginTop: rem(40),
          fontSize: rem(44),
          fontWeight: 600,
          color: brand.colors.muted,
          opacity: labelIn,
          transform: `translateY(${(1 - labelIn) * rem(14)}px)`,
          textAlign: "center",
        }}
      >
        {p.label}
      </div>
    </div>
  );
};

export const statCounterDef: TemplateDef = {
  slug: "stat-counter",
  title: "Stat Counter",
  tier: "free",
  category: "Charts",
  description:
    "One number, told well. Smooth count-up with a gradient and synchronized ticking, as a big hero ring or a compact corner badge. For subscribers, revenue, growth.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen", "corner-tl", "corner-tr"],
  schema,
  demoProps: {
    value: 128,
    suffix: "k",
    label: "Downloads this quarter",
    decimals: 0,
    countSeconds: 7,
  },
  demoDurationSec: 10,
  demoCamera: {
    preset: "pull-out",
    amount: 0.1,
    time: { start: 7, duration: 3 },
  },
  component: StatCounter,
};
