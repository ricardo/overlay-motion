import { useMemo } from "react";
import type { CSSProperties } from "react";
import { z } from "zod/v3";
import { interpolate, useVideoConfig } from "remotion";
import { useBrand, withAlpha } from "../../theme/themes";
import { useInOut, usePop } from "../../player/motion";
import type { TemplateDef } from "../types";

const schema = z.object({
  label: z.string().default("REC"),
  grayscale: z.boolean().default(false),
  grayFrame: z.boolean().default(false),
});

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const timecodeFor = (frame: number, fps: number) => {
  const wholeSeconds = Math.floor(frame / fps);
  const frames = Math.floor(frame % fps);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
};

type Corner = "tl" | "tr" | "bl" | "br";

const cornerStyle = (
  corner: Corner,
  size: number,
  stroke: number,
  color: string,
  progress: number
): CSSProperties => {
  const top = corner.startsWith("t");
  const left = corner.endsWith("l");

  return {
    position: "absolute",
    width: size,
    height: size,
    top: top ? 0 : undefined,
    bottom: top ? undefined : 0,
    left: left ? 0 : undefined,
    right: left ? undefined : 0,
    borderTop: top ? `${stroke}px solid ${color}` : undefined,
    borderBottom: top ? undefined : `${stroke}px solid ${color}`,
    borderLeft: left ? `${stroke}px solid ${color}` : undefined,
    borderRight: left ? undefined : `${stroke}px solid ${color}`,
    transform: `scale(${progress})`,
    transformOrigin: `${left ? "left" : "right"} ${top ? "top" : "bottom"}`,
    filter: "drop-shadow(0 1px 4px rgba(0, 0, 0, 0.45))",
  };
};

/** Transparent camera HUD; optional backdrop filter affects the source below it. */
const RecordingFrame = (raw: Record<string, unknown>) => {
  const p = useMemo(
    () =>
      schema.parse({
        label: raw.label,
        grayscale: raw.grayscale,
        grayFrame: raw.grayFrame,
      }),
    [raw]
  );
  const brand = useBrand();
  const { width, height, fps } = useVideoConfig();
  const { frame, exit } = useInOut(0.28);
  const frameIn = clamp01(usePop(0, { damping: 24, stiffness: 105 }));
  const hudIn = clamp01(usePop(8, { damping: 200 }));

  const unit = Math.min(width, height) / 1080;
  const px = (value: number) => value * unit;
  const matte = p.grayFrame ? frameIn : 0;
  const safeInset = px(48);
  const bracketSize = px(138);
  const bracketStroke = Math.max(2, px(4));
  const frameColor = p.grayFrame ? "#C8CBD0" : "#FFFFFF";
  const grayscale = p.grayscale
    ? interpolate(frame, [0, Math.round(fps * 0.65)], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const pulse = 0.55 + 0.45 * Math.sin((frame / fps) * Math.PI * 2 * 1.15) ** 2;
  const scanProgress = (frame % Math.round(fps * 3.8)) / Math.round(fps * 3.8);
  const recordingRed = "#FF453A";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "transparent",
        opacity: exit,
      }}
    >
      {p.grayscale ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.001)",
            backdropFilter: `grayscale(${grayscale})`,
            WebkitBackdropFilter: `grayscale(${grayscale})`,
          }}
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: px(16) * matte,
          boxShadow: p.grayFrame
            ? `inset 0 0 0 ${px(28) * matte}px #44474D, inset 0 0 0 ${px(30) * matte}px rgba(255,255,255,0.16)`
            : undefined,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: hudIn,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: safeInset,
            right: safeInset,
            top: safeInset,
            bottom: safeInset,
          }}
        >
          {(["tl", "tr", "bl", "br"] as Corner[]).map((corner) => (
            <div
              key={corner}
              style={cornerStyle(
                corner,
                bracketSize,
                bracketStroke,
                frameColor,
                frameIn
              )}
            />
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            top: safeInset + px(22),
            left: safeInset + px(22),
            display: "flex",
            alignItems: "center",
            gap: px(13),
            padding: `${px(10)}px ${px(17)}px`,
            borderRadius: px(999),
            color: "#FFFFFF",
            backgroundColor: "rgba(0, 0, 0, 0.46)",
            boxShadow: "0 2px 12px rgba(0, 0, 0, 0.28)",
            fontFamily: brand.fonts.body,
            fontSize: px(27),
            lineHeight: 1,
            fontWeight: 800,
            letterSpacing: "0.12em",
          }}
        >
          <span
            style={{
              width: px(18),
              height: px(18),
              borderRadius: "50%",
              backgroundColor: recordingRed,
              opacity: pulse,
              boxShadow: `0 0 ${px(16)}px ${withAlpha(recordingRed, 0.75)}`,
            }}
          />
          {p.label}
        </div>

        <div
          style={{
            position: "absolute",
            top: safeInset + px(27),
            right: safeInset + px(22),
            color: "#FFFFFF",
            padding: `${px(8)}px ${px(14)}px`,
            borderRadius: px(8),
            backgroundColor: "rgba(0, 0, 0, 0.38)",
            fontFamily: "'SF Mono', 'Roboto Mono', ui-monospace, monospace",
            fontSize: px(25),
            lineHeight: 1,
            fontWeight: 650,
            letterSpacing: "0.04em",
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 1px 4px rgba(0,0,0,0.55)",
          }}
        >
          {timecodeFor(frame, fps)}
        </div>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${scanProgress * 100}%`,
            height: px(2),
            opacity: 0.13,
            background: `linear-gradient(90deg, transparent, ${brand.colors.primary}, transparent)`,
            boxShadow: `0 0 ${px(14)}px ${withAlpha(brand.colors.primary, 0.5)}`,
          }}
        />
      </div>
    </div>
  );
};

export const recordingFrameDef: TemplateDef = {
  slug: "recording-frame",
  title: "Recording Frame",
  tier: "free",
  category: "Broadcast",
  description:
    "A live camera overlay: animated safe-frame corners, pulsing REC light, running timecode and scan. Optional grayscale backdrop and gray edge frame.",
  sourceContract: "annotates-video",
  regions: ["fullscreen"],
  schema,
  demoProps: { label: "REC", grayscale: true, grayFrame: true },
  demoDurationSec: 7,
  component: RecordingFrame,
};
