import type { CSSProperties, ReactNode } from "react";

/**
 * The travelling light in a gradient outline: a cool trail, a warmer bead and
 * one white-hot arc, swept around the edge by a rotating conic gradient. It
 * reads as welding rather than as a rainbow because the hot arc is narrow and
 * the rest of the sweep is the same hue at lower energy.
 *
 * Two stacked rings do the work. The sharp one is the stroke itself; the
 * blurred one sits under it at low opacity so the hot arc bleeds past the
 * stroke the way a real arc bleeds onto the metal. Blur alone on a single ring
 * would soften the stroke as well, which is what makes a gradient border look
 * like a glow instead of an edge.
 */
export type WeldPalette = {
  /** Most of the perimeter: the cooled bead behind the arc. */
  trail: string;
  /** The lead-in and lead-out around the arc. */
  mid: string;
  /** The arc itself. */
  hot: string;
};

/** Degrees travelled by frame `frame`, one revolution every `sweepSec`. */
export const weldAngle = (frame: number, fps: number, sweepSec: number) =>
  ((frame / fps) / Math.max(0.1, sweepSec)) * 360;

const sweepGradient = (angleDeg: number, palette: WeldPalette) =>
  `conic-gradient(from ${angleDeg}deg, ` +
  `${palette.trail} 0deg, ` +
  `${palette.mid} 84deg, ` +
  `${palette.hot} 148deg, ` +
  `#FFFFFF 166deg, ` +
  `${palette.hot} 184deg, ` +
  `${palette.mid} 246deg, ` +
  `${palette.trail} 360deg)`;

/**
 * Punches the middle out of a filled, rounded box so only the border band
 * paints. `content-box` covers everything inside the padding, the second layer
 * covers the whole box, and `xor` leaves the difference: the band. This is the
 * only way to stroke a rounded rectangle with a conic gradient and keep the
 * inside transparent, which is what a ring over footage needs.
 */
const ringMask = (width: number): CSSProperties => ({
  padding: width,
  WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
  WebkitMaskComposite: "xor",
  maskComposite: "exclude",
  boxSizing: "border-box",
});

export const WeldRing = ({
  radius,
  width,
  angleDeg,
  palette,
  glowPx = 0,
  opacity = 1,
}: {
  /** Any CSS border-radius value; `"50%"` for the circle. */
  radius: number | string;
  /** Stroke thickness in composition pixels. */
  width: number;
  angleDeg: number;
  palette: WeldPalette;
  /** Blur radius of the bleed layer; 0 draws the stroke alone. */
  glowPx?: number;
  opacity?: number;
}) => {
  const background = sweepGradient(angleDeg, palette);
  const base: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: radius,
    background,
    pointerEvents: "none",
    ...ringMask(width),
  };

  return (
    <>
      {glowPx > 0 ? (
        <div
          style={{
            ...base,
            ...ringMask(width * 1.9),
            filter: `blur(${glowPx}px)`,
            opacity: 0.85 * opacity,
          }}
        />
      ) : null}
      <div style={{ ...base, opacity }} />
    </>
  );
};

/**
 * A surface with a welded outline. The child fills the inside, so the caller
 * never has to keep two border radii in step.
 */
export const WeldSurface = ({
  radius,
  width,
  angleDeg,
  palette,
  glowPx = 0,
  surface,
  shadow,
  children,
  style,
}: {
  radius: number;
  width: number;
  angleDeg: number;
  palette: WeldPalette;
  glowPx?: number;
  surface: string;
  shadow?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      position: "relative",
      borderRadius: radius,
      background: surface,
      boxShadow: shadow,
      ...style,
    }}
  >
    <WeldRing
      radius={radius}
      width={width}
      angleDeg={angleDeg}
      palette={palette}
      glowPx={glowPx}
    />
    {children}
  </div>
);
