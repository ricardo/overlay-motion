import { useMemo } from "react";
import { z } from "zod/v3";
import { Img, interpolate, useVideoConfig } from "remotion";
import { useBrand, withAlpha } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { useInOut, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";
import { resolveSrc } from "../../player/resolve-src";

const schema = z.object({
  name: z.string().optional(),
  tagline: z.string().optional(),
  /** Real transparent brand mark. Omit to use the generated monogram. */
  logo: z.string().optional(),
  /** Hide the wordmark for a compact gesture-anchored mark. */
  showName: z.boolean().default(true),
  sfx: templateSfx
    .default("ding")
    .describe(
      "Sting that lands with the mark. `false` is silence, any cue name or audio path swaps it.",
    ),
});

const LogoSting = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { fps } = useVideoConfig();
  const { frame, exit } = useInOut();

  const name = p.name ?? brand.logoText;
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const badgeIn = usePop(0, { damping: 11, stiffness: 130 });
  const nameIn = usePop(Math.round(fps * 0.35), { damping: 200 });
  const taglineIn = usePop(Math.round(fps * 0.6), { damping: 200 });
  const ripple = (delay: number) => {
    const prog = interpolate(frame, [delay, delay + fps * 1.1], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return { scale: 1 + prog * 1.15, opacity: (1 - prog) * 0.5 };
  };
  const r1 = ripple(Math.round(fps * 0.15));
  const r2 = ripple(Math.round(fps * 0.45));
  const size = rem(320);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: exit,
      }}
    >
      <PropSfx sfx={p.sfx} at={0} volume={0.5} />
      <div style={{ position: "relative", width: size, height: size }}>
        {[r1, r2].map((r, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `${rem(4)}px solid ${withAlpha(brand.colors.primary, r.opacity)}`,
              transform: `scale(${r.scale})`,
            }}
          />
        ))}
        {p.logo ? (
          <Img
            src={resolveSrc(p.logo)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              transform: `scale(${badgeIn})`,
              filter: `drop-shadow(0 ${rem(24)}px ${rem(35)}px ${withAlpha(brand.colors.primary, 0.45)})`,
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              backgroundColor: brand.colors.primary,
              color: brand.colors.onPrimary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: brand.fonts.heading,
              fontWeight: 800,
              fontSize: rem(130),
              transform: `scale(${badgeIn})`,
              boxShadow: `0 ${rem(24)}px ${rem(70)}px ${withAlpha(brand.colors.primary, 0.45)}`,
            }}
          >
            {initials}
          </div>
        )}
      </div>
      {p.showName ? (
        <div
          style={{
            marginTop: rem(48),
            fontFamily: brand.fonts.heading,
            fontSize: rem(76),
            fontWeight: 800,
            color: brand.colors.onSurface,
            opacity: nameIn,
            transform: `translateY(${(1 - nameIn) * rem(18)}px)`,
            letterSpacing: "0.01em",
          }}
        >
          {name}
        </div>
      ) : null}
      {p.showName && p.tagline ? (
        <div
          style={{
            marginTop: rem(14),
            fontSize: rem(36),
            color: brand.colors.muted,
            opacity: taglineIn,
            transform: `translateY(${(1 - taglineIn) * rem(12)}px)`,
          }}
        >
          {p.tagline}
        </div>
      ) : null}
    </div>
  );
};

export const logoStingDef: TemplateDef = {
  slug: "logo-sting",
  title: "Logo Sting",
  tier: "free",
  category: "Brand",
  description:
    "A real logo or generated monogram lands with overshoot and ripples; optional name/tagline settle below. Set showName false for a compact gesture-anchored mark.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen"],
  schema,
  demoProps: {
    logo: "/brand/overlaymotion-mark.png",
    name: "OverlayMotion",
    tagline: "Video, on brand, on time",
  },
  demoDurationSec: 4,
  component: LogoSting,
};
