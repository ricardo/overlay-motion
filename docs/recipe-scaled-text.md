# Recipe: zooming text without glyph shimmer

Any template that animates `transform: scale` over live DOM text (zoom-in,
zoom-out, Ken Burns drift) makes letters wiggle slightly while the scale
changes. This is not a template bug and not spring jitter: Chromium
re-rasterizes glyphs with fresh hinting at every new effective scale, so stems
snap to different subpixels frame by frame. Proven on tweet-card: with the zoom
disabled, settled frames are pixel-identical; the shimmer only exists while
scale changes.

## The fix, in the template

Put this on the element that carries the animated `scale` (the card/root, not
each text node; `text-rendering` and `font-smoothing` inherit):

```tsx
transform: `scale(${scale}) translateZ(0)`,
willChange: "transform",
backfaceVisibility: "hidden",
WebkitFontSmoothing: "antialiased",
textRendering: "geometricPrecision",
```

- `translateZ(0)` + `will-change` promote the element to its own compositor
  layer: the browser scales the cached texture instead of re-hinting glyphs.
- `geometricPrecision` positions glyphs geometrically, no hinting snap.
- `antialiased` swaps subpixel AA for grayscale, killing RGB fringing shimmer.

This fully fixes the site player preview (real compositor). See
`src/templates/tweet-card/index.tsx` for the reference implementation.

## The fix, in final renders

The headless renderer screenshots every frame, so it re-rasterizes anyway and
the CSS only helps partially. For final files of any zooming template,
supersample and downscale:

```bash
npx remotion render remotion/index.ts <slug> out.mp4 --props=props.json --scale=2
npx remotion ffmpeg -y -i out.mp4 -vf "scale=1080:1920:flags=lanczos" \
  -c:v libx264 -crf 18 -pix_fmt yuv420p out-1080.mp4
```

Halves the shimmer amplitude and melts the rest into antialiasing.

## Measuring (to verify a new zoom effect)

1. Sanity: render two stills AFTER the motion settles with the zoom disabled.
   They must be pixel-identical (`PIL ImageChops.difference` bbox = None).
   If not, some spring/interpolation never settles; clamp it.
2. Shimmer metric: render two stills 0.2s apart mid-zoom, measure the card
   width on both to get the scale ratio, LANCZOS-resample still A by that ratio
   around the scale origin, diff against still B over the text area. Pure
   resample noise floor is ~1.0 mean abs diff; DOM text re-hinting shows ~2.5+.

## Other rules for scale animations

- Never animate `fontSize` or layout for a zoom: text re-wraps and genuinely
  jumps. Always `transform: scale`.
- End the settle at exactly scale 1 so the resting card is sharp.
- `Easing.inOut` spreads a long drift across the whole window; `Easing.out`
  front-loads it and the tail looks static.
- Derive every frame constant from `fps` (`fps * seconds`, never bare frame
  counts) so 30/60 fps specs keep the same wall-clock timing.
