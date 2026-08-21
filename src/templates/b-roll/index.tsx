import { useMemo } from "react";
import { z } from "zod/v3";
import { Img, OffthreadVideo } from "remotion";
import { useBrand, withAlpha } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { useInOut, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import { resolveSrc } from "../../player/resolve-src";
import type { TemplateDef } from "../types";

const schema = z.object({
  src: z.string(),
  kind: z.enum(["video", "image"]).optional(),
  muted: z.boolean().default(true),
  fit: z.enum(["cover", "contain"]).default("cover"),
  /** CSS object-position, e.g. "center 30%", to keep the subject in frame. */
  focus: z.string().optional(),
  /** "card" floats a rounded shadowed panel; "flush" fills the region edge to edge (split screens). */
  frame: z.enum(["card", "flush"]).default("card"),
  /** Brand-colored seam on one edge; the split-screen divider. */
  divider: z.enum(["top", "bottom", "left", "right"]).optional(),
  label: z.string().optional(),
  /** Small corner chip for footage attribution (stock / CC licenses). */
  credit: z.string().optional(),
  sfx: templateSfx
    .default("whoosh")
    .describe(
      "Sound as the panel slides in. `false` is silence, any cue name or audio path swaps it.",
    ),
});

/**
 * Secondary footage in any region while the base video keeps playing:
 * split screens, picture-in-picture reactions, b-roll cutaways. Own media
 * travels in props, so the contract stays "overlay".
 */
const BRoll = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { exit } = useInOut();
  const slideIn = usePop(0, { damping: 26, stiffness: 90 });

  const kind = p.kind ?? (/\.(png|jpe?g|webp|gif|avif)$/i.test(p.src) ? "image" : "video");
  const src = resolveSrc(p.src);
  const card = p.frame === "card";

  const media = (
    <div style={{ position: "absolute", inset: 0 }}>
      {kind === "video" ? (
        <OffthreadVideo
          src={src}
          muted={p.muted}
          style={{ width: "100%", height: "100%", objectFit: p.fit, objectPosition: p.focus }}
        />
      ) : (
        <Img
          src={src}
          style={{ width: "100%", height: "100%", objectFit: p.fit, objectPosition: p.focus }}
        />
      )}
    </div>
  );

  const dividerStyle =
    p.divider === "top" || p.divider === "bottom"
      ? { [p.divider]: 0, left: 0, right: 0, height: rem(6) }
      : p.divider
        ? { [p.divider]: 0, top: 0, bottom: 0, width: rem(6) }
        : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: card ? rem(28) : 0,
        opacity: exit,
        transform: `translateY(${(1 - slideIn) * 100}%)`,
      }}
    >
      <PropSfx sfx={p.sfx} at={0} volume={0.35} />
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          backgroundColor: "#000",
          borderRadius: card ? rem(Math.max(brand.radius, 20)) : 0,
          boxShadow: card ? `0 ${rem(24)}px ${rem(70)}px rgba(0, 0, 0, 0.4)` : undefined,
        }}
      >
        {media}
        {dividerStyle ? (
          <div
            style={{ position: "absolute", backgroundColor: brand.colors.primary, ...dividerStyle }}
          />
        ) : null}
        {p.label ? (
          <div
            style={{
              position: "absolute",
              top: rem(20),
              left: rem(20),
              backgroundColor: withAlpha("#000000", 0.45),
              color: "#FFFFFF",
              fontFamily: brand.fonts.heading,
              fontWeight: 700,
              fontSize: rem(26),
              padding: `${rem(6)}px ${rem(20)}px`,
              borderRadius: rem(999),
              letterSpacing: "0.04em",
            }}
          >
            {p.label}
          </div>
        ) : null}
        {p.credit ? (
          <div
            style={{
              position: "absolute",
              bottom: rem(12),
              right: rem(14),
              color: withAlpha("#FFFFFF", 0.75),
              fontSize: rem(18),
              textShadow: `0 ${rem(2)}px ${rem(8)}px rgba(0, 0, 0, 0.8)`,
            }}
          >
            {p.credit}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const bRollDef: TemplateDef = {
  slug: "b-roll",
  title: "B-Roll",
  tier: "free",
  category: "Brand",
  description:
    "Secondary footage in any region while your base video keeps playing: split screens, picture-in-picture reactions, b-roll cutaways. Flush mode with a divider seam for duets, card mode for floating panels, credit chip for stock attribution.",
  sourceContract: "overlay",
  regions: ["right-panel", "corner-br", "fullscreen"],
  schema,
  demoProps: {
    src: "/demo/broll-demo.mp4",
    label: "Live reaction",
    credit: "CC BY-SA — Wikimedia",
  },
  demoDurationSec: 6,
  component: BRoll,
};
