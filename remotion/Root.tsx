import { Composition, staticFile } from "remotion";
import { SpecRenderer, type SpecRendererProps } from "../src/player/SpecRenderer";
import { FORMAT_DIMENSIONS, type EditSpec } from "../src/spec/types";
import { parseSpec } from "../src/spec/validate";
import { PRESET_THEMES } from "../src/theme/themes";
import { TEMPLATES, demoSpecFor } from "../src/templates/registry";

/**
 * The renderer parses its own props, and this is the only place it can.
 *
 * `parseSpec` validates AND normalizes, and the render path used to take only
 * the first half: `--props` JSON went straight to `SpecRenderer`, so a spec
 * that passed the gate rendered with every schema default still missing. That
 * is not a cosmetic gap. `motion: { style, amount }` arrived at
 * `shakeTransform` without `seed` or `rampSec`, the envelope computed NaN, the
 * transform string came out `translate(NaN%, NaN%)`, and invalid CSS leaves the
 * previous value in place, so the sticker silently never moved. A still frame
 * looked correct the whole time.
 *
 * `calculateMetadata` is the fix's home because it runs once before render in
 * both Studio and the CLI, and Remotion feeds the props it returns to the
 * component. Metadata then reads the PARSED spec, so a default that decides
 * duration or format can no longer disagree with the frames.
 */
export const parsedMetadata = ({ props }: { props: SpecRendererProps }) => {
  const spec = parseSpec(props.spec);
  const dim = FORMAT_DIMENSIONS[spec.format];
  return {
    props: { ...props, spec },
    fps: spec.fps,
    durationInFrames: Math.round(spec.durationSec * spec.fps),
    width: dim.width,
    height: dim.height,
  };
};

/**
 * Default for the `custom` composition: a self-contained placeholder so the
 * composition always renders without local footage. Real use passes
 * `--props='{"spec": ..., "theme": ...}'` (or a props file) and
 * calculateMetadata resizes to that spec.
 */
const CUSTOM_DEFAULT_SPEC: EditSpec = {
  version: 1,
  format: "vertical",
  fps: 60,
  durationSec: 8,
  source: { type: "none" },
  camera: undefined,
  sound: undefined,
  overlays: [
    {
      template: "hero-title",
      region: "center",
      time: { start: "0.5s", appear: 1, hold: 6 },
      props: {
        title: "OverlayMotion",
        subtitle: "Pass --props to render your own spec",
      },
    },
  ],
};

/**
 * Remotion Studio / CLI entry: one composition per template plus `custom`,
 * the render-any-spec entry. `npm run studio` to inspect,
 * `npx remotion render remotion/index.ts <slug|custom> out.mp4` to render.
 */
export const Root = () => (
  <>
    <Composition
      id="custom"
      component={SpecRenderer}
      durationInFrames={Math.round(CUSTOM_DEFAULT_SPEC.durationSec * CUSTOM_DEFAULT_SPEC.fps)}
      fps={CUSTOM_DEFAULT_SPEC.fps}
      width={FORMAT_DIMENSIONS[CUSTOM_DEFAULT_SPEC.format].width}
      height={FORMAT_DIMENSIONS[CUSTOM_DEFAULT_SPEC.format].height}
      defaultProps={{ spec: CUSTOM_DEFAULT_SPEC, theme: PRESET_THEMES[0] }}
      calculateMetadata={parsedMetadata}
    />
    {TEMPLATES.map((def) => {
      const spec = demoSpecFor(def, "vertical");
      if (spec.source.type === "audio") {
        spec.source = { type: "audio", src: staticFile("demo/demo-audio.wav") };
      }
      const { width, height } = FORMAT_DIMENSIONS[spec.format];
      return (
        <Composition
          key={def.slug}
          id={def.slug}
          component={SpecRenderer}
          durationInFrames={Math.round(spec.durationSec * spec.fps)}
          fps={spec.fps}
          width={width}
          height={height}
          defaultProps={{ spec, theme: PRESET_THEMES[0] }}
          calculateMetadata={parsedMetadata}
        />
      );
    })}
  </>
);
