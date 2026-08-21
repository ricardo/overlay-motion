import { useMemo } from "react";
import { z } from "zod/v3";
import { Easing, Img, interpolate, staticFile } from "remotion";
import { surfaceStyle, useBrand } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { useInOut, useOverlayTiming } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

/** Public-folder paths work in the site (vite) AND in Remotion renders via staticFile. */
const resolveAsset = (src: string) =>
  /^(https?:|data:|blob:)/.test(src) ? src : staticFile(src.replace(/^\//, ""));

const schema = z.object({
  name: z.string(),
  role: z.string().optional(),
  /** Portrait photo, rounded square left of the text. */
  photo: z
    .string()
    .optional()
    .describe(
      "Portrait photo, rounded square left of the text. Omit it and the card drops the portrait and shrinks to the name instead of leaving a gap.",
    ),
  /** Smaller layout for square lower thirds and dense multi-overlay scenes. */
  variant: z.enum(["standard", "compact"]).default("standard"),
  /**
   * How the card leaves: "blur-out" melts it into the background with a blur,
   * "fade-down" just fades. Defaults to the spec's `overlay.exit` hint, then
   * blur-out.
   */
  exit: z.enum(["blur-out", "fade-down"]).optional(),
  sfx: templateSfx
    .default("whoosh")
    .describe(
      "Sound as the card arrives. `false` is silence, any cue name or audio path swaps it.",
    ),
  exitSfx: templateSfx
    .default(false)
    .describe(
      "Sound as the card leaves, off by default so it exits quietly. Only plays on a `blur-out` exit.",
    ),
});

const EXIT_SEC = 0.9;

/**
 * Person intro card: themed card surface, portrait left, and oversized name.
 * It leaves by defocusing: blur + lift + fade, so the next beat takes the stage.
 */
const SpeakerCard = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const timing = useOverlayTiming();
  const { frame, fps, durationInFrames, enter, exit } = useInOut();
  const exitStyle = p.exit ?? timing.exit ?? "blur-out";

  const compact = p.variant === "compact";
  // No portrait means no portrait-sized card: a fixed 92% width would hold the
  // empty space the photo used to fill, so the card hugs the name instead.
  const hasPhoto = Boolean(p.photo);

  const exitFrames = Math.round(EXIT_SEC * fps);
  const canExit = durationInFrames > exitFrames * 2;
  const exitStart = durationInFrames - exitFrames;
  const exitT =
    exitStyle === "blur-out" && canExit
      ? interpolate(frame, [exitStart, durationInFrames - 1], [0, 1], {
          easing: Easing.in(Easing.quad),
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;
  const opacity = exitStyle === "blur-out" ? 1 - exitT : exit;

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        width: hasPhoto ? (compact ? "100%" : "92%") : "auto",
        maxWidth: rem(compact ? 420 : 1000),
        display: "flex",
        alignItems: "center",
        gap: hasPhoto ? rem(compact ? 18 : 56) : 0,
        padding: rem(compact ? 18 : 40),
        borderRadius: rem(compact ? Math.max(18, brand.radius * 0.65) : brand.radius),
        ...surfaceStyle(brand, rem),
        borderWidth: rem(compact ? 1.5 : 2.5),
        opacity: enter * opacity,
        transform: `translateY(${(1 - enter) * rem(46) - exitT * rem(120)}px) scale(${1 - exitT * 0.04}) translateZ(0)`,
        filter: exitT > 0 ? `blur(${exitT * rem(26)}px)` : undefined,
        willChange: "transform, filter",
        backfaceVisibility: "hidden",
      }}
    >
      <PropSfx sfx={p.sfx} at={0} volume={0.3} />
      {exitStyle === "blur-out" && canExit ? (
        <PropSfx sfx={p.exitSfx} at={exitStart} volume={0.35} />
      ) : null}
      {p.photo ? (
        <Img
          src={resolveAsset(p.photo)}
          style={{
            position: "relative",
            width: rem(compact ? 92 : 300),
            height: rem(compact ? 92 : 300),
            flexShrink: 0,
            objectFit: "cover",
            borderRadius: rem(Math.max(14, brand.radius * 0.6)),
          }}
        />
      ) : null}
      <div style={{ position: "relative" }}>
        <div
          style={{
            fontFamily: brand.fonts.heading,
            fontSize: rem(compact ? 32 : 84),
            fontWeight: 600,
            lineHeight: 1.05,
            color: brand.colors.onSurface,
          }}
        >
          {p.name}
        </div>
        {p.role ? (
          <div
            style={{
              fontFamily: brand.fonts.body,
              fontSize: rem(compact ? 16 : 30),
              marginTop: rem(compact ? 6 : 14),
              color: brand.colors.muted,
            }}
          >
            {p.role}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const speakerCardDef: TemplateDef = {
  slug: "speaker-card",
  title: "Speaker Card",
  tier: "free",
  category: "Broadcast",
  description:
    "Person intro with presence: a solid card surface, rounded portrait, and oversized name. Leave `photo` out and the card is text only, sized to the name. Leaves quietly by default with a blur-out (blur + lift); exit sound stays available by naming a cue in the `exitSfx` prop.",
  sourceContract: "overlay",
  regions: ["center", "lower-third", "fullscreen"],
  schema,
  demoProps: {
    name: "Ricardo Metring",
    role: "Developer of OverlayMotion",
    photo: "/demo/avatar.png",
  },
  // The card is a plane holding a face, so a turn through depth is what sells
  // it as an object rather than a caption. Slower than the style's own 0.26Hz
  // because the card is on screen for 5s: at 0.14Hz a full cycle takes 7s, so
  // the demo shows one unhurried pass and never doubles back. Far under the
  // style's 0.7 default amount too: this card is a name to be read at a
  // glance, so 0.3 lands near 7deg: the turn is legible as a turn, and the
  // name still reads flat. `motion: { "style": "none" }` on the overlay turns
  // it off.
  defaultMotion: { style: "sway-3d", frequency: 0.14, amount: 0.3 },
  demoDurationSec: 5,
  demoTime: { appear: 0.8, hold: 4.2 },
  component: SpeakerCard,
};
