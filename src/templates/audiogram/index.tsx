import { useMemo } from "react";
import { z } from "zod/v3";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { surfaceStyle, useBrand, withAlpha } from "../../theme/themes";
import { useInOut } from "../../player/motion";
import { useRem } from "../../player/scale";
import type { TemplateDef } from "../types";

const schema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  /** Injected by the SpecRenderer from spec.source when type is "audio". */
  sourceSrc: z.string().optional(),
});

// visualizeAudio requires a power of two
const BARS = 32;

const Audiogram = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { exit } = useInOut();
  const audioData = useAudioData(p.sourceSrc ?? "");

  const amplitudes = audioData
    ? visualizeAudio({ fps, frame, audioData, numberOfSamples: BARS })
    : new Array(BARS).fill(0).map((_, i) => 0.2 + 0.15 * Math.abs(Math.sin(frame / 9 + i)));

  return (
    <div
      style={{
        width: "100%",
        maxWidth: rem(880),
        ...surfaceStyle(brand, rem),
        borderRadius: rem(brand.radius),
        padding: rem(60),
        opacity: exit,
        boxShadow: `0 ${rem(24)}px ${rem(80)}px rgba(0, 0, 0, 0.2)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div
        style={{
          backgroundColor: brand.colors.primary,
          color: brand.colors.onPrimary,
          fontWeight: 800,
          fontSize: rem(28),
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          padding: `${rem(8)}px ${rem(24)}px`,
          borderRadius: rem(999),
          marginBottom: rem(36),
        }}
      >
        {brand.logoText} audio
      </div>
      <div
        style={{
          fontFamily: brand.fonts.heading,
          fontSize: rem(56),
          fontWeight: 800,
          color: brand.colors.onSurface,
          lineHeight: 1.15,
          marginBottom: rem(12),
        }}
      >
        {p.title}
      </div>
      {p.subtitle ? (
        <div style={{ fontSize: rem(32), color: brand.colors.muted, marginBottom: rem(44) }}>
          {p.subtitle}
        </div>
      ) : (
        <div style={{ marginBottom: rem(44) }} />
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: rem(10),
          height: rem(220),
          width: "100%",
          justifyContent: "center",
        }}
      >
        {amplitudes.map((a, i) => {
          const h = Math.max(0.08, Math.min(1, Math.sqrt(a) * 2.2));
          const centerBias = 1 - Math.abs(i - BARS / 2) / (BARS / 0.9);
          return (
            <div
              key={i}
              style={{
                width: rem(14),
                height: `${h * centerBias * 100}%`,
                minHeight: rem(12),
                borderRadius: rem(7),
                backgroundColor:
                  i % 4 === 0 ? brand.colors.primary : withAlpha(brand.colors.primary, 0.45),
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export const audiogramDef: TemplateDef = {
  slug: "audiogram",
  title: "Audiogram",
  tier: "free",
  category: "Audio",
  description:
    "Music, podcast, or voiceover clip card: live waveform reacting to the actual audio, track title, logo chip. Feed it an audio file, get a shareable clip.",
  sourceContract: "visualizes-audio",
  regions: ["center", "fullscreen"],
  schema,
  demoProps: {
    title: "Midnight Shipping",
    subtitle: "Original instrumental demo",
  },
  demoDurationSec: 12,
  component: Audiogram,
};
