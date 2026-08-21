import { useMemo } from "react";
import { z } from "zod/v3";
import { interpolate, useVideoConfig } from "remotion";
import { surfaceStyle, useBrand, withAlpha } from "../../theme/themes";
import { useInOut, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const schema = z.object({
  title: z.string(),
  values: z.array(z.number()).min(3).max(60),
  startLabel: z.string().optional(),
  endLabel: z.string().optional(),
  suffix: z.string().default(""),
});

/** Single series, drawn left to right; the final value gets the only callout. */
const LineChart = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { fps, durationInFrames } = useVideoConfig();
  const { frame, exit } = useInOut();

  const W = 900;
  const H = 460;
  const PAD = 30;
  const min = Math.min(...p.values);
  const max = Math.max(...p.values);
  const span = max - min || 1;
  const pts = p.values.map((v, i) => ({
    x: PAD + (i / (p.values.length - 1)) * (W - PAD * 2),
    y: H - PAD - ((v - min) / span) * (H - PAD * 2),
  }));
  const path = pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");

  // Draw scales with the clip: ends at ~65% of the duration, leaving room for
  // the callout pop plus a beat to read it before the exit fade.
  const drawStart = Math.round(fps * 0.25);
  const drawEnd = Math.min(
    durationInFrames - Math.round(fps * 1.1),
    Math.max(drawStart + fps, Math.round(durationInFrames * 0.65))
  );
  const draw = interpolate(frame, [drawStart, drawEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = 1 - Math.pow(1 - draw, 2.2);
  // Head dot must track the dash reveal, which advances by arc length —
  // index-based interpolation drifts off the tip on uneven segments.
  const segLens = pts.slice(1).map((pt, i) => Math.hypot(pt.x - pts[i].x, pt.y - pts[i].y));
  const totalLen = segLens.reduce((a, b) => a + b, 0);
  let dist = eased * totalLen;
  let i0 = 0;
  while (i0 < segLens.length - 1 && dist > segLens[i0]) {
    dist -= segLens[i0];
    i0++;
  }
  const t = segLens[i0] > 0 ? dist / segLens[i0] : 0;
  const head = {
    x: pts[i0].x + (pts[i0 + 1].x - pts[i0].x) * t,
    y: pts[i0].y + (pts[i0 + 1].y - pts[i0].y) * t,
  };
  const calloutIn = usePop(drawEnd + Math.round(fps * 0.05), { damping: 16, stiffness: 150 });
  const areaPath = `${path} L ${pts[pts.length - 1].x} ${H - PAD} L ${pts[0].x} ${H - PAD} Z`;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: rem(940),
        ...surfaceStyle(brand, rem),
        borderRadius: rem(brand.radius),
        padding: rem(52),
        opacity: exit,
        boxShadow: `0 ${rem(24)}px ${rem(80)}px rgba(0, 0, 0, 0.18)`,
      }}
    >
      <div
        style={{
          fontFamily: brand.fonts.heading,
          fontSize: rem(50),
          fontWeight: 800,
          color: brand.colors.onSurface,
          marginBottom: rem(30),
        }}
      >
        {p.title}
      </div>
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
          <line
            x1={PAD}
            y1={H - PAD}
            x2={W - PAD}
            y2={H - PAD}
            stroke={withAlpha(brand.colors.onSurface, 0.2)}
            strokeWidth={2}
          />
          <path d={areaPath} fill={withAlpha(brand.colors.primary, 0.14 * eased)} />
          <path
            d={path}
            fill="none"
            stroke={brand.colors.primary}
            strokeWidth={9}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - eased}
          />
          <circle cx={head.x} cy={head.y} r={13} fill={brand.colors.primary} />
          <circle cx={head.x} cy={head.y} r={22} fill="none" stroke={withAlpha(brand.colors.primary, 0.4)} strokeWidth={4} />
        </svg>
        <div
          style={{
            position: "absolute",
            left: `${(head.x / W) * 100}%`,
            top: `${(head.y / H) * 100}%`,
            transform: `translate(-105%, -140%) scale(${calloutIn})`,
            backgroundColor: brand.colors.primary,
            color: brand.colors.onPrimary,
            fontWeight: 800,
            fontSize: rem(34),
            padding: `${rem(8)}px ${rem(20)}px`,
            borderRadius: rem(10),
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {p.values[p.values.length - 1]}
          {p.suffix}
        </div>
      </div>
      {(p.startLabel || p.endLabel) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: rem(14),
            fontSize: rem(28),
            fontWeight: 600,
            color: brand.colors.muted,
          }}
        >
          <span>{p.startLabel}</span>
          <span>{p.endLabel}</span>
        </div>
      )}
    </div>
  );
};

export const lineChartDef: TemplateDef = {
  slug: "line-chart",
  title: "Line Chart",
  tier: "free",
  category: "Charts",
  description:
    "A single series draws itself left to right with a moving head dot; the final value lands in a callout. Growth-story slide, zero After Effects.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen", "lower-third"],
  schema,
  demoProps: {
    title: "MRR, last 12 months",
    values: [4, 4.6, 5.1, 5.0, 6.2, 7.4, 8.1, 9.6, 10.8, 12.4, 14.2, 16.9],
    startLabel: "Sep",
    endLabel: "Aug",
    suffix: "k",
  },
  demoDurationSec: 12,
  demoCamera: {
    preset: "pull-out",
    amount: 0.1,
    time: { start: 7.8, duration: 3.5 },
  },
  component: LineChart,
};
