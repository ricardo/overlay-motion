import { useMemo } from "react";
import { z } from "zod/v3";
import { interpolate } from "remotion";
import { useBrand, withAlpha } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { useInOut, useOverlayTiming, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import { typewriterChars } from "../../player/typewriter";
import { WeldRing, weldAngle, type WeldPalette } from "../../player/weld";
import type { TemplateDef } from "../types";

/** Fast enough to read as one continuous burst, slow enough to read the words. */
const TYPING_CHARS_PER_SEC = 26;
const MIN_TYPING_SEC = 0.9;
const TYPING_VOLUME = 0.32;
const CARET_BLINK_SEC = 1.06;

const schema = z.object({
  text: z.string().min(1).describe("What gets typed into the box, character by character"),
  placeholder: z
    .string()
    .default("Ask anything")
    .describe("Shown before the first character lands, and never after"),
  hint: z
    .string()
    .optional()
    .describe("Small chip on the bottom row: the model, the agent, the mode"),
  typeStartSec: z
    .number()
    .min(0)
    .default(0.35)
    .describe("Seconds from the overlay's own start until the first character"),
  typeSec: z
    .number()
    .positive()
    .optional()
    .describe(
      "How long the full string takes to type. Unset, the spec's `time.appear` budgets it; without that, the character count does.",
    ),
  caret: z.boolean().default(true).describe("Solid while typing, blinking once the text lands"),
  borderWidth: z
    .number()
    .min(1)
    .max(24)
    .default(5)
    .describe("Welded outline thickness, design pixels at a 1080px short edge"),
  sweepSec: z
    .number()
    .min(0.3)
    .max(12)
    .default(4)
    .describe("Seconds per revolution of the arc around the outline"),
  glow: z
    .boolean()
    .default(true)
    .describe("Bleed the hot arc past the stroke. Off draws the stroke alone."),
  entrance: z
    .enum(["slide-up", "pop", "fade", "none"])
    .default("slide-up")
    .describe(
      "Native entrance. `slide-up` rises from below while fading in. Set `none` when the spec drives the arrival with `enter` or a camera move.",
    ),
  typingSfx: templateSfx
    .default("keyboard-typing-natural")
    .describe(
      "Recorded keyboard typing under the characters, held for exactly as long as typing lasts. `false` types in silence.",
    ),
});

/**
 * The composer every AI chat app puts at the bottom of the screen: a rounded
 * field with a welded gradient outline, a prompt typing itself in, and the
 * send button waiting. It exists so a video ABOUT prompting can show the
 * prompt instead of describing it.
 *
 * It ships no chrome beyond the field. A screenshot of a real product would
 * carry that product's identity into the frame, which is a claim the template
 * has no way to license.
 */
const PromptBox = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { frame, fps, exit } = useInOut();
  const timing = useOverlayTiming();
  const popIn = usePop(0, { damping: 16, stiffness: 130 });

  const startFrame = Math.round(p.typeStartSec * fps);
  const typingFrames = Math.max(
    1,
    p.typeSec !== undefined
      ? Math.round(p.typeSec * fps)
      : timing.appearFrames !== null
        ? timing.appearFrames - startFrame
        : Math.round(
            fps * Math.max(MIN_TYPING_SEC, p.text.length / TYPING_CHARS_PER_SEC),
          ),
  );
  const visible = typewriterChars(frame, {
    startFrame,
    typingFrames,
    totalChars: p.text.length,
  });
  const typed = p.text.slice(0, visible);
  const done = visible >= p.text.length;

  // Solid while the characters land; a caret that blinks mid-word reads as a
  // stall in the typing rather than as a cursor.
  const caretOn =
    !done || Math.floor((frame - startFrame) / (CARET_BLINK_SEC * fps) * 2) % 2 === 0;

  const palette: WeldPalette = {
    trail: withAlpha(brand.colors.secondary ?? brand.colors.primary, 0.28),
    mid: brand.colors.primary,
    hot: brand.colors.accent ?? brand.colors.primary,
  };

  const entranceScale = p.entrance === "pop" ? 0.86 + 0.14 * Math.min(popIn, 1.06) : 1;
  const entranceProgress = interpolate(frame, [0, Math.round(fps * 0.5)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const entranceOpacity =
    p.entrance === "none"
      ? 1
      : interpolate(frame, [0, Math.round(fps * (p.entrance === "pop" ? 0.25 : 0.4))], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const entranceY = p.entrance === "slide-up" ? rem(64) * (1 - entranceProgress) : 0;

  const radius = rem(Math.max(brand.radius, 28));
  const pad = rem(38);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: exit * entranceOpacity,
        transform: `translateY(${entranceY}px) scale(${entranceScale})`,
      }}
    >
      <PropSfx
        sfx={p.typingSfx}
        at={startFrame}
        volume={TYPING_VOLUME}
        durationSec={typingFrames / fps}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          borderRadius: radius,
          background: withAlpha(brand.colors.surface, 0.94),
          boxShadow: `0 ${rem(30)}px ${rem(90)}px rgba(0, 0, 0, 0.55)`,
          padding: pad,
          display: "flex",
          flexDirection: "column",
          gap: rem(26),
        }}
      >
        <WeldRing
          radius={radius}
          width={rem(p.borderWidth)}
          angleDeg={weldAngle(frame, fps, p.sweepSec)}
          palette={palette}
          glowPx={p.glow ? rem(14) : 0}
        />
        <div
          style={{
            fontFamily: brand.fonts.body,
            fontSize: rem(46),
            lineHeight: 1.35,
            fontWeight: 500,
            color: visible > 0 ? brand.colors.onSurface : brand.colors.muted,
            minHeight: rem(62),
            wordBreak: "break-word",
          }}
        >
          {visible > 0 ? typed : p.placeholder}
          {p.caret ? (
            <span
              style={{
                display: "inline-block",
                width: rem(4),
                height: rem(46),
                marginLeft: rem(6),
                verticalAlign: rem(-6),
                backgroundColor: brand.colors.onSurface,
                opacity: caretOn ? 1 : 0,
              }}
            />
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: rem(20),
          }}
        >
          <div
            style={{
              fontFamily: brand.fonts.body,
              fontSize: rem(26),
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: brand.colors.muted,
              border: `${rem(2)}px solid ${withAlpha(brand.colors.muted, 0.35)}`,
              borderRadius: rem(999),
              padding: `${rem(7)}px ${rem(22)}px`,
              opacity: p.hint ? 1 : 0,
            }}
          >
            {p.hint ?? " "}
          </div>
          <div
            style={{
              width: rem(64),
              height: rem(64),
              borderRadius: "50%",
              backgroundColor: done ? brand.colors.primary : withAlpha(brand.colors.muted, 0.28),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width={rem(30)} height={rem(30)} viewBox="0 0 24 24" fill="none">
              <path
                d="M12 19V5M12 5l-6 6M12 5l6 6"
                stroke={done ? brand.colors.onPrimary : brand.colors.surface}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export const promptBoxDef: TemplateDef = {
  slug: "prompt-box",
  title: "Prompt Box",
  tier: "free",
  category: "Brand",
  description:
    "The AI chat composer: a rounded field with a welded gradient outline sweeping the edge, your prompt typing itself in with real keyboard sound, and a send button that lights up when the text lands. For videos about prompting, where showing the prompt beats describing it.",
  sourceContract: "overlay",
  regions: ["center", "lower-third", "fullscreen"],
  schema,
  demoProps: {
    text: "Please add subtitles to this video",
    hint: "OverlayMotion agent",
  },
  demoDurationSec: 5,
  component: PromptBox,
};
