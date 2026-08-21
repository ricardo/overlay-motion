import { createContext, useContext } from "react";
import type { CSSProperties } from "react";
import type { BrandTheme } from "../spec/types";

/**
 * Preset brands prove the promise: same template, your tokens.
 * Fonts are system stacks with distinct personalities so the font token
 * visibly changes between presets without webfont loading.
 */
export const PRESET_THEMES: BrandTheme[] = [
  {
    name: "Arctic Glass",
    colors: {
      primary: "#5B5CE2",
      secondary: "#8B5CF6",
      accent: "#06B6D4",
      onPrimary: "#FFFFFF",
      surface: "#FFFFFF",
      onSurface: "#17182B",
      muted: "#70738C",
      background: "#EEF2FF",
    },
    fonts: {
      heading: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      body: "'Inter', 'SF Pro Text', system-ui, sans-serif",
    },
    radius: 34,
    logoText: "Arctic",
    style: {
      backgroundGradient: { from: "#F8FAFF", to: "#DDE7FF", angle: 135 },
      surfaceGradient: { from: "#FFFFFF", to: "#EEF2FF", angle: 135 },
      surface: "glass",
      blur: 28,
      opacity: 0.5,
      borderColor: "#FFFFFF",
    },
  },
  {
    name: "Aurora Glass",
    colors: {
      primary: "#3F5CCB",
      secondary: "#173B8F",
      accent: "#6B83E8",
      onPrimary: "#F7F9FF",
      surface: "#14254A",
      onSurface: "#F5F7FF",
      muted: "#94A6CB",
      background: "#050B18",
    },
    fonts: {
      heading: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      body: "'Inter', 'SF Pro Text', system-ui, sans-serif",
    },
    radius: 44,
    logoText: "Aurora",
    style: {
      backgroundGradient: { from: "#050B18", to: "#112D69", angle: 145 },
      // Slate, not navy. At the tint the glass actually uses, a saturated blue
      // surface over bright footage lifts into periwinkle and the card stops
      // reading as dark glass. Desaturated and dropped in value, it stays a
      // dark blue-gray pane whatever is behind it.
      surfaceGradient: { from: "#2A3342", to: "#12161D", angle: 145 },
      surface: "glass",
      // Frostier than Arctic. A dark pane has to hide more of what is behind
      // it before the copy reads, so this one is the deep-frost variant and
      // Arctic stays the light, barely-there glass.
      blur: 50,
      opacity: 0.6,
      // The rim doubles as the specular sheen on dark glass, so an indigo here
      // paints violet across the whole pane and undoes the slate above.
      borderColor: "#7C8FAE",
      borderOpacity: 0.4,
    },
  },
  {
    name: "Nova",
    colors: {
      primary: "#2563EB",
      secondary: "#4F46E5",
      accent: "#06B6D4",
      onPrimary: "#FFFFFF",
      surface: "#FFFFFF",
      onSurface: "#0F172A",
      muted: "#64748B",
      background: "#EDF2FB",
    },
    fonts: {
      heading: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      body: "'Inter', 'SF Pro Text', system-ui, sans-serif",
    },
    radius: 24,
    logoText: "Nova",
  },
  {
    name: "Ember",
    colors: {
      primary: "#F97316",
      secondary: "#EF4444",
      accent: "#FBBF24",
      onPrimary: "#1A120B",
      surface: "#1C1917",
      onSurface: "#FAFAF9",
      muted: "#A8A29E",
      background: "#0C0A09",
    },
    fonts: {
      heading: "'Iowan Old Style', 'Georgia', serif",
      body: "'Avenir Next', 'Segoe UI', system-ui, sans-serif",
    },
    radius: 24,
    logoText: "Ember",
  },
  {
    name: "Mint",
    colors: {
      primary: "#10B981",
      secondary: "#059669",
      accent: "#2DD4BF",
      onPrimary: "#022C22",
      surface: "#ECFDF5",
      onSurface: "#064E3B",
      muted: "#4D7C6F",
      background: "#D6F5E6",
    },
    fonts: {
      heading: "'Futura', 'Avenir', 'Century Gothic', sans-serif",
      body: "'Avenir', 'Futura', system-ui, sans-serif",
    },
    radius: 36,
    logoText: "Mint",
  },
  {
    // The classic Dracula scheme: purple on #282A36, mono headings.
    name: "Dracula",
    colors: {
      primary: "#BD93F9",
      secondary: "#FF79C6",
      accent: "#8BE9FD",
      onPrimary: "#282A36",
      surface: "#282A36",
      onSurface: "#F8F8F2",
      muted: "#6272A4",
      background: "#191A21",
    },
    fonts: {
      heading: "'SF Mono', 'Menlo', 'Cascadia Code', 'Consolas', monospace",
      body: "'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
    },
    radius: 14,
    logoText: "Dracula",
  },
  {
    name: "Royal",
    colors: {
      primary: "#D4AF37",
      secondary: "#8B5E18",
      accent: "#E8D48A",
      onPrimary: "#1C1405",
      surface: "#141B33",
      onSurface: "#F4EFE3",
      muted: "#8B93AC",
      background: "#0B1024",
    },
    fonts: {
      heading: "'Palatino', 'Book Antiqua', 'Georgia', serif",
      body: "'Optima', 'Segoe UI', system-ui, sans-serif",
    },
    radius: 6,
    logoText: "Royal",
  },
  {
    name: "Sorbet",
    colors: {
      primary: "#FF5A5F",
      secondary: "#FF8A65",
      accent: "#FBBFAD",
      onPrimary: "#FFFFFF",
      surface: "#FFF7F2",
      onSurface: "#43272B",
      muted: "#B98A85",
      background: "#FFE8DC",
    },
    fonts: {
      heading: "ui-rounded, 'Arial Rounded MT Bold', 'Avenir Next', sans-serif",
      body: "'Avenir Next', 'Trebuchet MS', system-ui, sans-serif",
    },
    radius: 44,
    logoText: "Sorbet",
  },
];

/** Perceived luminance 0..1 of a hex color; drives light-vs-dark styling decisions. */
export const luminance = (hex: string): number => {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/** Custom brand from a single picked color: on-color chosen by luminance. */
export const customTheme = (primary: string): BrandTheme => ({
  ...PRESET_THEMES[0],
  name: "Custom",
  colors: {
    ...PRESET_THEMES[0].colors,
    primary,
    onPrimary: luminance(primary) > 0.55 ? "#111111" : "#FFFFFF",
  },
  logoText: "Yours",
});

const gradientCss = (gradient: { from: string; to: string; angle: number }) =>
  `linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})`;

/** Composition background, supporting gradients without breaking old themes. */
export const backgroundStyle = (theme: BrandTheme): CSSProperties =>
  theme.style?.backgroundGradient
    ? { backgroundColor: theme.colors.background, backgroundImage: gradientCss(theme.style.backgroundGradient) }
    : { backgroundColor: theme.colors.background };

/**
 * Card surface shared by templates that opt into the surface token. Glass
 * themes receive a translucent gradient, chrome edge, inset highlight,
 * frosted backdrop, and a soft specular sheen.
 */
export const surfaceStyle = (
  theme: BrandTheme,
  unit: (value: number) => number = (value) => value,
): CSSProperties => {
  const gradient = theme.style?.surfaceGradient;
  if (theme.style?.surface !== "glass") {
    return { background: gradient ? gradientCss(gradient) : theme.colors.surface };
  }

  const from = gradient?.from ?? theme.colors.surface;
  const to = gradient?.to ?? theme.colors.surface;
  const angle = gradient?.angle ?? 135;
  const accent = theme.colors.accent ?? theme.colors.primary;
  const blur = theme.style.blur ?? 28;
  // How much of the surface color the glass keeps. Low values let whatever is
  // behind the card through, which reads as a sticker over a busy frame and
  // puts skin tones under the copy; the token is the theme's own answer to
  // that, so it belongs here rather than as a constant.
  const tint = theme.style.opacity ?? 0.2;
  // Scales the rim's own alphas. The chrome edge sells the material at full
  // strength on a light pane, but on a dark one it hardens into a drawn
  // outline, so a theme can dial it back without losing the corner glints.
  const rimAlpha = (alpha: number) => alpha * (theme.style?.borderOpacity ?? 1);
  const lightSurface = luminance(theme.colors.surface) > 0.55;
  // Light glass must not reuse onSurface for its chrome and shadows: that
  // token is intentionally near-black for readable copy and muddies the
  // translucent material. Prefer the theme's rim color and an icy tint.
  const edge = lightSurface
    ? (theme.style.borderColor ?? "#FFFFFF")
    : (theme.style.borderColor ?? theme.colors.onSurface);
  const sheen = lightSurface ? "#FFFFFF" : edge;
  const shadow = lightSurface ? theme.colors.primary : "#000000";
  const dropShadowAlpha = lightSurface ? 0.14 : 0.5;
  const insetAlpha = lightSurface ? 0.42 : 0.22;
  // The rim is the only layer that reaches the border strip: the other two
  // clip to the padding box. Painting it as bare highlight leaves that strip
  // showing raw frosted backdrop, so a weak rim reads as a bright halo
  // instead of a soft edge and no alpha can ever remove it. Compositing each
  // stop over the pane's own tint means a rim of zero lands exactly on the
  // surface color and the edge really does disappear.
  const rimStop = (alpha: number, position: number) =>
    colorOver(edge, rimAlpha(alpha), mixHex(from, to, position), tint);

  return {
    borderWidth: unit(2.5),
    borderStyle: "solid",
    borderColor: "transparent",
    background:
      `radial-gradient(closest-side at 76% -8%, ${withAlpha(sheen, 0.14)}, ${withAlpha(accent, 0.07)} 36%, transparent 66%) padding-box, ` +
      `linear-gradient(${angle}deg, ${withAlpha(from, tint)}, ${withAlpha(to, tint)}) padding-box, ` +
      `linear-gradient(50deg, ${rimStop(0.9, 0)}, ${rimStop(0.12, 0.3)} 30%, ${rimStop(0.08, 0.62)} 62%, ${rimStop(0.9, 1)}) border-box`,
    boxShadow: `inset 0 ${-unit(4)}px ${unit(12)}px ${withAlpha(edge, insetAlpha)}, 0 ${unit(28)}px ${unit(90)}px ${withAlpha(shadow, dropShadowAlpha)}`,
    backdropFilter: `blur(${unit(blur)}px) saturate(140%)`,
    WebkitBackdropFilter: `blur(${unit(blur)}px) saturate(140%)`,
  };
};

const BrandContext = createContext<BrandTheme>(PRESET_THEMES[0]);
export const BrandProvider = BrandContext.Provider;
export const useBrand = (): BrandTheme => useContext(BrandContext);

/** Mix two hex colors: `amount` 0 keeps `from`, 1 lands on `to`. */
export const mixHex = (from: string, to: string, amount: number): string => {
  const parse = (value: string) => {
    const hex = value.replace("#", "");
    const normalized = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
    return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
  };
  const start = parse(from);
  const end = parse(to);
  if (!start || !end) return from;
  const channel = (index: number) =>
    Math.round(start[index] + (end[index] - start[index]) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
};

/**
 * Source-over compositing of two translucent hex colors, returning the single
 * rgba that renders identically to the pair. Lets one gradient stop carry both
 * a highlight and the surface underneath it, which a single background layer
 * otherwise cannot express.
 */
export const colorOver = (
  top: string,
  topAlpha: number,
  bottom: string,
  bottomAlpha: number,
): string => {
  const outAlpha = topAlpha + bottomAlpha * (1 - topAlpha);
  if (outAlpha <= 0) return "rgba(0, 0, 0, 0)";
  const channels = (hex: string) => {
    const h = hex.replace("#", "");
    const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [0, 2, 4].map((offset) => parseInt(n.slice(offset, offset + 2), 16));
  };
  const t = channels(top);
  const b = channels(bottom);
  const channel = (index: number) =>
    Math.round((t[index] * topAlpha + b[index] * bottomAlpha * (1 - topAlpha)) / outAlpha);
  return `rgba(${channel(0)}, ${channel(1)}, ${channel(2)}, ${Number(outAlpha.toFixed(3))})`;
};

/** Mix a hex color with the surface at `alpha`: cheap neutral tone for secondary marks. */
export const withAlpha = (hex: string, alpha: number): string => {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
