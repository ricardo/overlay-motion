import { Fragment, useMemo } from "react";
import { z } from "zod/v3";
import { useVideoConfig } from "remotion";
import { surfaceStyle, useBrand, withAlpha } from "../../theme/themes";
import { useInOut, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const schema = z.object({
  items: z.array(z.string()).min(1).max(12),
  label: z.string().optional(),
  secondsPerLoop: z.number().min(2).max(60).default(12),
});

/**
 * Broadcast ticker: the item list scrolls forever inside a branded bar.
 * The track renders the list twice and shifts by half its own width per
 * loop, so the wrap point is invisible at any speed.
 */
const TickerTape = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { fps } = useVideoConfig();
  const { frame, exit } = useInOut();
  const barIn = usePop(0, { damping: 20, stiffness: 110 });

  const shift = ((frame / (fps * p.secondsPerLoop)) % 1) * 50;

  // Both copies have identical width (trailing gap included), so a 50%
  // shift of the track is exactly one copy: the wrap point never jumps.
  const run = (key: string) => (
    <span
      key={key}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: rem(36),
        paddingRight: rem(36),
      }}
    >
      {p.items.map((item, i) => (
        <Fragment key={i}>
          <span style={{ whiteSpace: "nowrap" }}>{item}</span>
          <span
            style={{
              width: rem(10),
              height: rem(10),
              borderRadius: "50%",
              backgroundColor: brand.colors.primary,
              flexShrink: 0,
            }}
          />
        </Fragment>
      ))}
    </span>
  );

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        alignItems: "stretch",
        ...surfaceStyle(brand, rem),
        borderRadius: rem(brand.radius),
        overflow: "hidden",
        opacity: exit * barIn,
        transform: `translateY(${(1 - barIn) * rem(40)}px)`,
        boxShadow: `0 ${rem(16)}px ${rem(50)}px rgba(0, 0, 0, 0.22)`,
      }}
    >
      {p.label ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: `${rem(26)}px ${rem(36)}px`,
            backgroundColor: brand.colors.primary,
            color: brand.colors.onPrimary,
            fontFamily: brand.fonts.heading,
            fontSize: rem(30),
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          {p.label}
        </div>
      ) : null}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          maskImage: `linear-gradient(to right, transparent, black ${rem(40)}px, black calc(100% - ${rem(40)}px), transparent)`,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            transform: `translateX(-${shift}%)`,
            fontSize: rem(34),
            fontWeight: 600,
            color: brand.colors.onSurface,
            fontFamily: brand.fonts.body,
          }}
        >
          {run("a")}
          {run("b")}
        </div>
      </div>
      <div
        style={{
          width: rem(10),
          backgroundColor: withAlpha(brand.colors.primary, 0.5),
          flexShrink: 0,
        }}
      />
    </div>
  );
};

export const tickerTapeDef: TemplateDef = {
  slug: "ticker-tape",
  title: "Ticker Tape",
  tier: "free",
  category: "Broadcast",
  description:
    "The newsroom crawl: label plate on the left, headlines scrolling in a seamless loop. Announcements, stats, sponsor names under any footage.",
  sourceContract: "annotates-video",
  regions: ["lower-third", "upper-third", "caption-zone"],
  schema,
  demoProps: {
    label: "Live",
    items: [
      "Brand themes are one JSON file",
      "Same template, any format",
      "15 templates and counting",
    ],
    secondsPerLoop: 9,
  },
  demoDurationSec: 8,
  component: TickerTape,
};
