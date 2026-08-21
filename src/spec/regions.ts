import type { Region, RectPct } from "./types";

type Align = "flex-start" | "center" | "flex-end";

export type RegionBox = RectPct & {
  justify: Align; // horizontal
  align: Align; // vertical
};

const R = (
  x: number,
  y: number,
  w: number,
  h: number,
  justify: Align = "center",
  align: Align = "center"
): RegionBox => ({ x, y, w, h, justify, align });

export const REGION_BOXES: Record<string, RegionBox> = {
  fullscreen: R(0, 0, 100, 100),
  "top-banner": R(6, 3, 88, 24, "center", "flex-start"),
  "lower-third": R(4, 62, 92, 34, "flex-start", "flex-end"),
  "upper-third": R(4, 4, 92, 28, "flex-start", "flex-start"),
  // Default subtitles sit slightly above the lower UI/control area. Keep the
  // zone centered so individual caption presets can still align within it.
  "caption-zone": R(6, 65, 88, 20, "center", "center"),
  "left-panel": R(4, 8, 44, 84, "center", "center"),
  "right-panel": R(52, 8, 44, 84, "center", "center"),
  center: R(6, 22, 88, 56, "center", "center"),
  "corner-tl": R(4, 3, 40, 14, "flex-start", "flex-start"),
  "corner-tr": R(56, 3, 40, 14, "flex-end", "flex-start"),
  "corner-bl": R(4, 83, 40, 14, "flex-start", "flex-end"),
  "corner-br": R(56, 83, 40, 14, "flex-end", "flex-end"),
};

export const resolveRegion = (region: Region | undefined, fallback: string): RegionBox => {
  if (!region) return REGION_BOXES[fallback] ?? REGION_BOXES.center;
  if (typeof region === "string") return REGION_BOXES[region] ?? REGION_BOXES.center;
  return { ...region, justify: "center", align: "center" };
};
