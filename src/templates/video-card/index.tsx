import { useMemo } from "react";
import type { ReactNode } from "react";
import { z } from "zod/v3";
import { useBrand, withAlpha } from "../../theme/themes";
import { useInOut, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const schema = z.object({
  headline: z.string(),
  cta: z.string().optional(),
});

/**
 * Wraps the customer's footage in a branded layout: video in a rounded card
 * on top, headline and CTA below. The "video + template at a position" class.
 */
const VideoCard = (raw: Record<string, unknown> & { children?: ReactNode }) => {
  const p = useMemo(() => schema.parse({ headline: raw.headline, cta: raw.cta }), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { frame, exit } = useInOut();
  const cardIn = usePop(0, { damping: 22, stiffness: 100 });
  const headlineIn = usePop(8, { damping: 200 });
  const ctaIn = usePop(16, { damping: 15, stiffness: 140 });
  const pulse = 1 + 0.025 * Math.sin(frame / 9);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: rem(56),
        gap: rem(44),
        opacity: exit,
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: rem(Math.max(brand.radius, 20)),
          overflow: "hidden",
          position: "relative",
          transform: `translateY(${(1 - cardIn) * rem(60)}px) scale(${0.94 + 0.06 * cardIn})`,
          boxShadow: `0 ${rem(30)}px ${rem(90)}px rgba(0, 0, 0, 0.35)`,
          backgroundColor: "#000",
        }}
      >
        {raw.children}
        <div
          style={{
            position: "absolute",
            top: rem(24),
            left: rem(24),
            backgroundColor: withAlpha("#000000", 0.45),
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: rem(26),
            padding: `${rem(6)}px ${rem(20)}px`,
            borderRadius: rem(999),
            letterSpacing: "0.06em",
          }}
        >
          {brand.logoText}
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: brand.fonts.heading,
            fontSize: rem(64),
            fontWeight: 800,
            lineHeight: 1.15,
            color: brand.colors.onSurface,
            opacity: headlineIn,
            transform: `translateY(${(1 - headlineIn) * rem(20)}px)`,
          }}
        >
          {p.headline}
        </div>
        {p.cta ? (
          <div
            style={{
              display: "inline-block",
              marginTop: rem(32),
              backgroundColor: brand.colors.primary,
              color: brand.colors.onPrimary,
              fontSize: rem(36),
              fontWeight: 800,
              padding: `${rem(18)}px ${rem(48)}px`,
              borderRadius: rem(999),
              transform: `scale(${ctaIn * pulse})`,
              boxShadow: `0 ${rem(14)}px ${rem(44)}px ${withAlpha(brand.colors.primary, 0.4)}`,
            }}
          >
            {p.cta}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const videoCardDef: TemplateDef = {
  slug: "video-card",
  title: "Video Card",
  tier: "free",
  category: "Brand",
  description:
    "Your footage inside a finished frame: rounded card, logo chip, headline and pulsing CTA below. Turns any raw clip into an ad unit.",
  sourceContract: "wraps-video",
  regions: ["fullscreen"],
  schema,
  demoProps: { headline: "Raw clip in, ad unit out", cta: "Try it free" },
  demoDurationSec: 6,
  component: VideoCard,
};
