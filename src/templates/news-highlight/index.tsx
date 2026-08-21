import { useMemo } from "react";
import { z } from "zod/v3";
import { interpolate, useVideoConfig } from "remotion";
import { surfaceStyle, useBrand, withAlpha } from "../../theme/themes";
import { useInOut, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const schema = z.object({
  kicker: z.string(),
  headline: z.string(),
  ticker: z.string().optional(),
});

const NewsHighlight = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { fps } = useVideoConfig();
  const { frame, exit } = useInOut();

  const kickerIn = usePop(0, { damping: 18, stiffness: 160 });
  const barIn = usePop(5, { damping: 22, stiffness: 110 });
  const tickerIn = interpolate(frame, [fps * 0.5, fps * 0.9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scroll = (frame / fps) * rem(120);

  return (
    <div style={{ width: "100%", opacity: exit }}>
      <div
        style={{
          display: "inline-block",
          backgroundColor: brand.colors.primary,
          color: brand.colors.onPrimary,
          fontWeight: 800,
          fontSize: rem(30),
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          padding: `${rem(10)}px ${rem(26)}px`,
          borderRadius: rem(8),
          transform: `translateX(${(kickerIn - 1) * rem(240)}px)`,
          opacity: kickerIn,
          marginBottom: rem(14),
        }}
      >
        {p.kicker}
      </div>
      <div
        style={{
          ...surfaceStyle(brand, rem),
          color: brand.colors.onSurface,
          fontFamily: brand.fonts.heading,
          fontSize: rem(52),
          fontWeight: 800,
          lineHeight: 1.15,
          padding: `${rem(24)}px ${rem(30)}px`,
          borderRadius: rem(10),
          borderLeft: `${rem(12)}px solid ${brand.colors.primary}`,
          transform: `translateY(${(1 - barIn) * rem(80)}px)`,
          opacity: barIn,
          boxShadow: `0 ${rem(16)}px ${rem(50)}px rgba(0, 0, 0, 0.35)`,
        }}
      >
        {p.headline}
      </div>
      {p.ticker ? (
        <div
          style={{
            marginTop: rem(12),
            // Ink, not literal black: over a light theme a translucent black
            // bar lands as grey and reads as a rendering fault rather than as
            // a ticker. The theme's own ink keeps the contrast in both.
            backgroundColor: withAlpha(brand.colors.onSurface, 0.88),
            color: brand.colors.surface,
            borderRadius: rem(8),
            fontSize: rem(26),
            fontWeight: 600,
            padding: `${rem(8)}px 0`,
            overflow: "hidden",
            whiteSpace: "nowrap",
            opacity: tickerIn,
          }}
        >
          <div style={{ transform: `translateX(${-scroll}px)`, display: "inline-block", paddingLeft: "100%" }}>
            {p.ticker} {"  •  "} {p.ticker} {"  •  "} {p.ticker}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const newsHighlightDef: TemplateDef = {
  slug: "news-highlight",
  title: "News Highlight",
  tier: "free",
  category: "Broadcast",
  description:
    "Broadcast lower third: kicker chip slides in, headline bar lands on a vertical spine, optional ticker scrolls below. For newsjacking clips.",
  sourceContract: "annotates-video",
  regions: ["lower-third", "upper-third"],
  schema,
  demoProps: {
    kicker: "Breaking",
    headline: "Template ships with your brand tokens baked in",
    ticker: "No keyframes were harmed in the making of this lower third",
  },
  demoDurationSec: 12,
  component: NewsHighlight,
};
