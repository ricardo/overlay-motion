import type { ComponentType, ReactNode } from "react";
import type { z } from "zod/v3";
import type { CameraInput, ObjectMotionInput, RegionName, TimeWindow } from "../spec/types";

export type Tier = "free" | "premium";

/**
 * The template's relationship with the spec's base footage. This is the
 * contract that keeps "overlay" and "input video" from blurring into each
 * other:
 *
 * - "overlay": self-contained; draws on top of whatever the source is
 *   (video, audio or none). Never reads the source.
 * - "annotates-video": only makes sense over base footage (captions, tickers,
 *   recording chrome); the spec's source must be a video.
 * - "wraps-video": renders the base video inside its own layout (framed
 *   card); the spec's source must be a video, and only one overlay per spec
 *   may claim it.
 * - "visualizes-audio": driven by a standalone audio file (waveforms); the
 *   spec's source must be audio, and the renderer hands the file to the
 *   template as `sourceSrc`.
 *
 * A template that ships its own footage (e.g. a clip passed via props,
 * picture-in-picture style) is still "overlay": own media travels in props,
 * the contract only describes the BASE source.
 */
export type SourceContract =
  | "overlay"
  | "annotates-video"
  | "wraps-video"
  | "visualizes-audio";

/** Contracts that require the spec's source to be a video. */
export const contractNeedsSourceVideo = (contract: SourceContract): boolean =>
  contract === "annotates-video" || contract === "wraps-video";

export type TemplateDef = {
  slug: string;
  title: string;
  tier: Tier;
  category: "Text" | "Charts" | "Social" | "Broadcast" | "Audio" | "Brand";
  description: string;
  sourceContract: SourceContract;
  /** Regions this template is designed for; first one is the default. */
  regions: RegionName[];
  schema: z.ZodTypeAny;
  demoProps: Record<string, unknown>;
  demoDurationSec: number;
  /**
   * Object motion this template ships with, e.g. the sticker's handheld drift.
   * The renderer applies it when the spec sets no `overlay.motion`, so the
   * effect stays one implementation shared by every template instead of a prop
   * each template reimplements. A spec may override it, including turning it
   * off with `motion: { style: "none" }`. An array stacks tracks.
   */
  defaultMotion?: ObjectMotionInput | ObjectMotionInput[];
  /** Demo overlay `time` window (appear/hold pattern); default `{}`. */
  demoTime?: TimeWindow;
  /** Demo overlay camera, or a stack of them (e.g. pull-out settle after `appear`). */
  demoCamera?: CameraInput | CameraInput[];
  /** Demo overlay entrance-style hint (`overlay.reveal`). */
  demoReveal?: "typewriter";
  component: ComponentType<Record<string, unknown> & { children?: ReactNode }>;
};
