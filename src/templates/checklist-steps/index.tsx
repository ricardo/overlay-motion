import { useMemo } from "react";
import { z } from "zod/v3";
import { interpolate, useVideoConfig } from "remotion";
import { timeValue } from "../../spec/types";
import { toFrames } from "../../spec/time";
import { surfaceStyle, useBrand, withAlpha } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { pop, useInOut } from "../../player/motion";
import { useRem, useShortEdgeRem } from "../../player/scale";
import type { TemplateDef } from "../types";

export const listStepsSchema = z.object({
  /** Optional heading; omit or pass an empty string for a steps-only card. */
  title: z.string().optional(),
  /** Smaller card for corner placement in square and horizontal compositions. */
  variant: z.enum(["standard", "compact"]).default("standard"),
  /**
   * Plain strings tick on a fixed cadence (secondsPerStep). Give a step an
   * `at` (time relative to this overlay's window, e.g. "4.3s" or "50%") and
   * it ticks exactly then: pair it with word timestamps from a transcript
   * to tick as the speaker says each thing (see docs/recipe-whisper-sync.md).
   */
  steps: z
    .array(
      z.union([
        z.string(),
        z.object({ text: z.string(), at: timeValue.optional() }),
      ]),
    )
    .min(2)
    .max(7),
  secondsPerStep: z.number().default(0.8),
  checkSfx: templateSfx
    .default("tick")
    .describe(
      "Sound as a checked step lands (checklist marker only). `false` ticks in silence, any cue name or audio path swaps it.",
    ),
  stepSfx: templateSfx
    .default("list-step")
    .describe(
      "Sound for numbered and bullet markers, which land without claiming the step is done. Ships the bundled `list-step` library click.",
    ),
});

const CARD_LEAD_SEC = 0.6; // card slides in this long before the first timed tick
const CARD_HOLD_SEC = 1.5; // and stays this long after the last one

type ListMarker = "check" | "number" | "bullet";

export const createListStepsComponent = (marker: ListMarker) => {
  const ListSteps = (raw: Record<string, unknown>) => {
    const p = useMemo(() => listStepsSchema.parse(raw), [raw]);
    const brand = useBrand();
    const widthRem = useRem();
    const shortEdgeRem = useShortEdgeRem();
    const { fps, durationInFrames } = useVideoConfig();
    const { frame, exit } = useInOut();
    const compact = p.variant === "compact";
    const rem = compact ? shortEdgeRem : widthRem;
    const per = Math.round(p.secondsPerStep * fps);
    const checkSize = rem(compact ? 34 : 56);
    const ctx = { fps, totalFrames: durationInFrames };
    const title = p.title?.trim();

    const steps = p.steps.map((s) =>
      typeof s === "string" ? { text: s, at: undefined } : s,
    );
    const timed = steps.some((s) => s.at !== undefined);
    const stepFrames = steps.map((s, i) =>
      s.at !== undefined ? toFrames(s.at, ctx) : 8 + i * per,
    );

    // In timed mode the card wraps the ticks' window instead of the whole overlay
    const cardIn = timed
      ? Math.max(0, Math.min(...stepFrames) - Math.round(CARD_LEAD_SEC * fps))
      : 0;
    const cardOut = timed
      ? Math.min(
          durationInFrames,
          Math.max(...stepFrames) + Math.round(CARD_HOLD_SEC * fps),
        )
      : durationInFrames;
    const cardEnter = pop(frame, fps, cardIn, { damping: 20, stiffness: 110 });
    const cardExit = interpolate(
      frame,
      [cardOut - Math.round(0.35 * fps), cardOut],
      [1, 0],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );

    return (
      <div
        style={{
          width: "100%",
          maxWidth: rem(compact ? 540 : 880),
          ...surfaceStyle(brand, rem),
          borderRadius: rem(brand.radius),
          padding: rem(compact ? 44 : 56),
          opacity: Math.min(exit, cardExit) * cardEnter,
          transform: `translateY(${(1 - cardEnter) * rem(40)}px)`,
        }}
      >
        {title ? (
          <div
            style={{
              fontFamily: brand.fonts.heading,
              fontSize: rem(compact ? 36 : 52),
              fontWeight: 800,
              color: brand.colors.onSurface,
              marginBottom: rem(compact ? 24 : 40),
            }}
          >
            {title}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: rem(compact ? 18 : 30) }}>
          {steps.map((step, i) => {
            const at = stepFrames[i];
            const rowIn = pop(frame, fps, at, { damping: 20, stiffness: 120 });
            const checkIn = pop(frame, fps, at + 6, {
              damping: 14,
              stiffness: 160,
            });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: rem(compact ? 14 : 24),
                  opacity: rowIn,
                  transform: `translateX(${(1 - rowIn) * rem(50)}px)`,
                }}
              >
                {marker === "check" ? (
                  <PropSfx sfx={p.checkSfx} at={at + 6} volume={0.7} />
                ) : (
                  // Lower gain than the check tick: the library file peaks
                  // ~5dB above the core cue.
                  <PropSfx sfx={p.stepSfx} at={at + 6} volume={0.34} />
                )}
                {marker === "bullet" ? (
                  <div
                    style={{
                      width: checkSize,
                      height: checkSize,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: rem(compact ? 12 : 18),
                        height: rem(compact ? 12 : 18),
                        borderRadius: "50%",
                        backgroundColor: brand.colors.primary,
                        transform: `scale(${checkIn})`,
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: checkSize,
                      height: checkSize,
                      borderRadius: marker === "number" ? "50%" : "35%",
                      backgroundColor:
                        checkIn > 0.05
                          ? brand.colors.primary
                          : withAlpha(brand.colors.onSurface, 0.1),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transform: `scale(${0.8 + 0.2 * checkIn})`,
                    }}
                  >
                    {marker === "number" ? (
                      <span
                        style={{
                          color: brand.colors.onPrimary,
                          fontSize: rem(28),
                          fontWeight: 800,
                          lineHeight: 1,
                          opacity: checkIn,
                        }}
                      >
                        {i + 1}
                      </span>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        style={{ width: "62%", height: "62%" }}
                      >
                        <path
                          d="M4 12.5 L10 18 L20 6.5"
                          fill="none"
                          stroke={brand.colors.onPrimary}
                          strokeWidth={3.4}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          pathLength={1}
                          strokeDasharray={1}
                          strokeDashoffset={1 - Math.min(1, checkIn)}
                        />
                      </svg>
                    )}
                  </div>
                )}
                <div
                  style={{
                    fontSize: rem(compact ? 26 : 38),
                    fontWeight: 600,
                    color: brand.colors.onSurface,
                    lineHeight: 1.3,
                  }}
                >
                  {step.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return ListSteps;
};

const ChecklistSteps = createListStepsComponent("check");

export const checklistStepsDef: TemplateDef = {
  slug: "checklist-steps",
  title: "Checklist Steps",
  tier: "free",
  category: "Text",
  description:
    "Steps land one by one, each check drawing itself. Give steps word-level timestamps from a transcript and they tick as the speaker says them.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen", "right-panel"],
  schema: listStepsSchema,
  demoProps: {
    title: "Launch day, automated",
    steps: [
      "Cut the demo into vertical clips",
      "Captions in the brand pill",
      "Chart slide from the metrics API",
      "Logo sting on every ending",
    ],
  },
  demoDurationSec: 6,
  component: ChecklistSteps,
};
