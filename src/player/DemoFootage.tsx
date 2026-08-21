import { AbsoluteFill, useVideoConfig } from "remotion";
import { backgroundStyle, mixHex, useBrand, withAlpha } from "../theme/themes";

/**
 * Stand-in for the customer's mp4, used wherever a spec says `src: "demo"`.
 *
 * It paints the BRAND background, not a cinematic plate. The drifting dark
 * blobs it used to draw were the only thing in the gallery that ignored the
 * selected theme, so every template with a video contract (captions, lower
 * thirds, the face bubble) looked like a different product from the templates
 * without one, and on a light theme the bubble read as a hole punched in the
 * page.
 *
 * The tint is the one concession: a footage plane still has to be findable
 * when a template crops it to a circle or a phone frame, so the layer sits a
 * few percent off the page behind it. Sized in container units, so the
 * watermark scales with the plane a wrapping template gives it rather than
 * with the composition.
 */
export const DemoFootage = () => {
  const brand = useBrand();
  const { width } = useVideoConfig();
  const ink = brand.colors.onSurface;

  return (
    <AbsoluteFill
      style={{
        ...backgroundStyle(brand),
        overflow: "hidden",
        containerType: "size",
        // Fallback for the watermark: `cqw` is dropped by an engine without
        // container queries, and the child then inherits this size.
        fontSize: Math.round(width * 0.026),
      }}
    >
      <AbsoluteFill style={{ backgroundColor: withAlpha(mixHex(brand.colors.background, ink, 0.5), 0.08) }} />
      <div
        style={{
          position: "absolute",
          top: "47%",
          width: "100%",
          textAlign: "center",
          fontFamily: brand.fonts.body,
          fontSize: "2.6cqw",
          letterSpacing: "0.35em",
          color: withAlpha(ink, 0.28),
          fontWeight: 600,
        }}
      >
        YOUR FOOTAGE HERE
      </div>
    </AbsoluteFill>
  );
};
