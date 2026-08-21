import { useId, useMemo } from "react";
import { z } from "zod/v3";
import { Img } from "remotion";
import { PropSfx } from "../../sound/Sfx";
import { useInOut, useOverlayTiming, usePop } from "../../player/motion";
import { useRem } from "../../player/scale";
import { useBrand } from "../../theme/themes";
import { resolveSrc } from "../../player/resolve-src";
import { templateSfx } from "../../sound/config";
import { STICKER_LIBRARY_NAMES, resolveStickerArt } from "./library";
import type { TemplateDef } from "../types";
import type { BrandTheme } from "../../spec/types";

/** Brand token or literal, the same escape captions open for color. */
const stickerColor = z.union([
  z.enum(["primary", "secondary", "accent", "onPrimary", "surface", "onSurface", "muted", "background", "white", "black"]),
  z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
]);

const colorForToken = (token: string, brand: BrandTheme): string => {
  if (token.startsWith("#")) return token;
  if (token === "white") return "#FFFFFF";
  if (token === "black") return "#000000";
  return (brand.colors as Record<string, string | undefined>)[token] ?? "#FFFFFF";
};

/**
 * A cutout has no rectangle to outline, so the border has to follow the ALPHA
 * edge or it becomes the frame this template exists to avoid.
 *
 * A ring of `drop-shadow()` copies is the tempting one-liner and it is wrong
 * twice. CSS filter lists PIPE: the second drop-shadow casts from the output of
 * the first, not from the original art, so the copies cascade into a smear
 * instead of unioning into a contour. The cost cascades with them; at 25 copies
 * a single 1080p still did not finish in nine minutes.
 *
 * Growing the alpha does it in one pass: grow the silhouette, fill the grown
 * shape with the border color, then draw the untouched art back on top.
 *
 * The growth is a blur hardened back to a hard edge, not `feMorphology`.
 * Morphology dilates with a BOX, and on a real cutout that reads: the first
 * render of this came back with stair steps down every diagonal and notches
 * around each bump on the pickle. A Gaussian is radially symmetric, so
 * thresholding its ramp grows the shape by the same distance in every
 * direction, which is what "die cut" means. Cost is the same order.
 *
 * `stdDeviation` and the threshold are a pair, and `width` has to mean the
 * pixels it says, so the pair is solved rather than eyeballed. A step edge
 * blurred by sigma has alpha(d) = erfc(d / (sigma * sqrt 2)) / 2, and the
 * transfer below cuts at about 0.21, which lands at d = 0.8 * sigma. Feeding
 * sigma = width / 0.8 puts the hardened edge one width out. The first attempt
 * used sigma = 0.62 * width and drew an outline half the requested thickness.
 */
const BORDER_SIGMA_PER_PX = 1.25;
const BorderFilter = ({ id, radiusPx, color }: { id: string; radiusPx: number; color: string }) => (
  <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
    <filter id={id} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation={radiusPx * BORDER_SIGMA_PER_PX} result="ramp" />
      {/* Slope steep enough that the hardened edge is not itself a gradient. */}
      <feComponentTransfer in="ramp" result="grown">
        <feFuncA type="linear" slope="40" intercept="-8" />
      </feComponentTransfer>
      <feFlood floodColor={color} result="ink" />
      <feComposite in="ink" in2="grown" operator="in" result="outline" />
      <feMerge>
        <feMergeNode in="outline" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </svg>
);

// Every field carries `.describe()`, not a code comment: that string is what
// the storefront prop table and the published JSON schema carry, so a prop the
// caller cannot read about is a prop that does not exist to them.
const schema = z.object({
  src: z
    .string()
    .describe(
      `Cutout artwork: a bundled library name (${STICKER_LIBRARY_NAMES.map((name) => `"${name}"`).join(", ")}) or your own path/URL. A transparent PNG or WebP is the point: a JPEG paints its own rectangle over the footage.`,
    ),
  alt: z.string().optional().describe("Accessibility label. Never painted on screen."),
  fit: z
    .enum(["contain", "cover"])
    .default("contain")
    .describe(
      "How the art meets the region box: `contain` keeps the whole cutout visible, `cover` crops it to fill.",
    ),
  sizePct: z
    .number()
    .min(5)
    .max(100)
    .default(100)
    .describe(
      "Size as a percentage of the region box, so placement stays region-driven. Use `overlay.scale` when you want the sticker to grow past its region.",
    ),
  shadow: z
    .enum(["none", "soft", "drop"])
    .default("drop")
    .describe(
      "Contact shadow that separates the cutout from busy footage: `soft` is a wide ambient pool, `drop` sits tighter and darker.",
    ),
  entrance: z
    .enum(["pop", "fade", "none"])
    .default("pop")
    .describe(
      "Native entrance. Set `none` when the spec drives the entrance with `enter`, so the two never stack into a double scale-up.",
    ),
  sfx: templateSfx
    .default("pop")
    .describe(
      'Entrance sound. `false` is silence, any cue name swaps it ("ding", "whoosh", "click"), and any path or URL plays your own file.',
    ),
  border: z
    .object({
      width: z
        .number()
        .min(0.5)
        .max(40)
        .describe("Outline thickness in design pixels at a 1080px short edge"),
      color: stickerColor
        .default("white")
        .describe("Brand color token, or `white` / `black`, or a #rrggbb literal"),
    })
    .optional()
    .describe(
      "Die-cut outline that follows the artwork's own alpha edge, off unless you ask for it. It is painted before the contact shadow, so the shadow is cast by the outlined silhouette rather than crossing it.",
    ),
});

/**
 * A cutout image that lives on top of the footage with no card, no frame and
 * no background: props, stickers, mascots, product PNGs, reaction cutouts.
 *
 * b-roll is the wrong tool for this: it frames secondary FOOTAGE in a padded,
 * rounded panel. A sticker is the artwork itself, so the only chrome is an
 * optional contact shadow.
 *
 * `src` takes a bundled library NAME as well as a path (`./library.ts`), so an
 * agent with no art of its own still has cutouts it can reach by name.
 *
 * The handheld drift is NOT implemented here. It is `overlay.motion`, owned by
 * the renderer (`src/player/OverlayMotion.tsx`) and available to every
 * template; this one just declares it as its `defaultMotion` so a sticker
 * still moves for free. A spec turns it off with `motion: { style: "none" }`.
 */
const Sticker = (raw: Record<string, unknown>) => {
  const p = useMemo(() => schema.parse(raw), [raw]);
  const rem = useRem();
  const brand = useBrand();
  const timing = useOverlayTiming();
  const { exit } = useInOut();

  const popIn = usePop(0, { damping: 12, stiffness: 140 });
  const entranceScale = p.entrance === "pop" ? 0.6 + 0.4 * Math.min(popIn, 1.08) : 1;
  const entranceOpacity =
    p.entrance === "none" ? 1 : Math.min(1, Math.max(0, popIn) * (p.entrance === "pop" ? 2.4 : 1.6));

  // The renderer owns the exit whenever the spec asked for one (including
  // "vanish"); the native fade only covers specs that did not.
  const nativeExit = timing.exit ? 1 : exit;

  const shadow =
    p.shadow === "none"
      ? undefined
      : p.shadow === "soft"
        ? `drop-shadow(0 ${rem(18)}px ${rem(30)}px rgba(0,0,0,0.28))`
        : `drop-shadow(0 ${rem(26)}px ${rem(26)}px rgba(0,0,0,0.42))`;

  // Border first: filter lists pipe, so the shadow that follows is cast by the
  // OUTLINED silhouette. Reversed, the art would cast the shadow and the
  // outline would sit on top of a shadow that disagrees with its edge.
  const borderId = `sticker-border-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const filter = [p.border ? `url(#${borderId})` : undefined, shadow]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div
      style={{
        width: `${p.sizePct}%`,
        height: `${p.sizePct}%`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: entranceOpacity * nativeExit,
        transform: `scale(${entranceScale})`,
        willChange: "transform, opacity",
      }}
    >
      <PropSfx sfx={p.sfx} at={0} volume={0.4} />
      {p.border ? (
        <BorderFilter
          id={borderId}
          radiusPx={rem(p.border.width)}
          color={colorForToken(p.border.color, brand)}
        />
      ) : null}
      <Img
        src={resolveSrc(resolveStickerArt(p.src))}
        alt={p.alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: p.fit,
          filter,
        }}
      />
    </div>
  );
};

export const stickerDef: TemplateDef = {
  slug: "sticker",
  title: "Sticker",
  tier: "free",
  category: "Brand",
  description:
    "A transparent cutout dropped straight onto the footage: no card, no frame. Pops in, drifts like it is held in a hand, and leaves with the spec's exit (pair with exit \"vanish\").",
  sourceContract: "overlay",
  regions: ["center", "corner-br", "corner-bl", "corner-tr", "corner-tl", "right-panel", "left-panel"],
  schema,
  defaultMotion: { style: "shake" },
  demoProps: {
    src: "/brand/overlaymotion-mark.png",
    alt: "OverlayMotion mark",
    sizePct: 70,
    // Spelled out even though it is the default: the copyable JSON is where a
    // caller learns the cue has a NAME, and that the name is theirs to change.
    sfx: "pop",
  },
  demoDurationSec: 4,
  component: Sticker,
};
