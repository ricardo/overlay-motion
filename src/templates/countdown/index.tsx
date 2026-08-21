import { useMemo } from "react";
import { z } from "zod/v3";
import { interpolate, useVideoConfig } from "remotion";
import { useBrand, withAlpha } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { pop, useInOut, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const schema = z.object({
  from: z.number().int().min(1).max(10).default(5),
  label: z.string().optional(),
  endText: z.string().default("GO"),
  tickSfx: templateSfx
    .default("tick")
    .describe("Sound on each counted second. `false` counts in silence."),
  endSfx: templateSfx
    .default("ding")
    .describe("Sound when the count reaches the end text."),
});

const Countdown = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { fps } = useVideoConfig();
  const { frame, exit } = useInOut();

  const second = Math.min(Math.floor(frame / fps), p.from);
  const counting = second < p.from;
  const remaining = p.from - second;
  const numberIn = pop(frame, fps, second * fps, { damping: 12, stiffness: 160 });
  const endIn = pop(frame, fps, p.from * fps, { damping: 11, stiffness: 130 });
  const labelIn = usePop(0, { damping: 200 });
  const labelOut = interpolate(
    frame,
    [p.from * fps, p.from * fps + Math.round(fps * 0.25)],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Ring drains over each second, refills instantly with the next number
  const ringLeft = counting ? 1 - (frame - second * fps) / fps : endIn;

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
      {Array.from({ length: p.from }, (_, i) => (
        <PropSfx key={`t-${i}`} sfx={p.tickSfx} at={i * fps} volume={0.6} />
      ))}
      <PropSfx sfx={p.endSfx} at={p.from * fps} volume={0.6} />
      {p.label ? (
        <div
          style={{
            marginBottom: rem(44),
            fontSize: rem(40),
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: brand.colors.muted,
            opacity: labelIn * labelOut,
            transform: `translateY(${(1 - labelIn) * rem(14)}px)`,
          }}
        >
          {p.label}
        </div>
      ) : null}
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
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
            stroke={brand.colors.primary}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - Math.max(0, ringLeft))}
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
            color: brand.colors.onSurface,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {counting ? (
            <span
              style={{
                fontSize: rem(300),
                display: "inline-block",
                transform: `scale(${0.6 + 0.4 * numberIn})`,
                opacity: numberIn,
              }}
            >
              {remaining}
            </span>
          ) : (
            <span
              style={{
                fontSize: rem(120),
                display: "inline-block",
                color: brand.colors.primary,
                transform: `scale(${0.6 + 0.4 * endIn})`,
                opacity: endIn,
                padding: `0 ${rem(40)}px`,
                textAlign: "center",
                lineHeight: 1.1,
              }}
            >
              {p.endText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const countdownDef: TemplateDef = {
  slug: "countdown",
  title: "Countdown",
  tier: "free",
  category: "Broadcast",
  description:
    "The starting-soon second hand. Each number lands with a tick while the ring drains, then your go-word takes the circle. Stream intros, launches, drops.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen"],
  schema,
  demoProps: { from: 5, label: "Launching in", endText: "We're live" },
  demoDurationSec: 7,
  component: Countdown,
};
