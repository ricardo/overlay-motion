import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { resolveSrc } from "./resolve-src";
import type { EditSpec, BrandTheme, SpecMusic } from "../spec/types";
import { resolveWindow } from "../spec/time";
import { resolveRegion } from "../spec/regions";
import { backgroundStyle, BrandProvider } from "../theme/themes";
import { mergeSound } from "../sound/config";
import { PreviewSoundScopeProvider, SoundProvider } from "../sound/Sfx";
import { OverlayTimingProvider } from "./motion";
import { OverlayCamera } from "./OverlayCamera";
import { OverlayMotion } from "./OverlayMotion";
import { OverlayTransform } from "./OverlayTransform";
import { SceneCamera } from "./SceneCamera";
import { TEMPLATE_DEFAULT_MOTION, TEMPLATE_MAP } from "../templates/registry";
import { DemoFootage } from "./DemoFootage";
import { sourceLayoutAtFrame } from "./source-layout";

/**
 * How early a `wraps-video` template is mounted before its own window, so the
 * video element it renders has seeked by the time it is first painted. One
 * second is far longer than a seek needs and costs one extra second of decode.
 */
const WRAP_LEAD_SEC = 1;

export type SpecRendererProps = {
  spec: EditSpec;
  theme: BrandTheme;
  /** Stable SFX owner for pages containing multiple mounted Players. */
  sfxScope?: string;
};

const SourceLayer = ({
  spec,
  forceMuted = false,
  ignoreReframes = false,
}: {
  spec: EditSpec;
  forceMuted?: boolean;
  /** A wraps-video template owns layout; source reframes belong only to the base layer. */
  ignoreReframes?: boolean;
}) => {
  if (spec.source.type === "video") {
    const frame = useCurrentFrame();
    const { fps, durationInFrames } = useVideoConfig();
    const layout = sourceLayoutAtFrame({
      frame,
      fps,
      totalFrames: durationInFrames,
      defaultFit: spec.source.fit ?? "cover",
      defaultPosition: spec.source.position ?? "center",
      reframes: ignoreReframes ? [] : spec.source.reframes,
    });
    const media = spec.source.src === "demo" ? (
      <DemoFootage />
    ) : (
      <OffthreadVideo
        src={resolveSrc(spec.source.src)}
        muted={forceMuted || spec.source.muted}
        style={{
          width: "100%",
          height: "100%",
          objectFit: layout.fit,
          objectPosition: layout.position,
          transform: spec.source.flipHorizontal ? "scaleX(-1)" : undefined,
        }}
      />
    );
    const footage = (
      <div
        style={{
          position: "absolute",
          left: `${layout.region.x}%`,
          top: `${layout.region.y}%`,
          width: `${layout.region.w}%`,
          height: `${layout.region.h}%`,
          overflow: "hidden",
        }}
      >
        {media}
      </div>
    );
    return <SceneCamera camera={spec.source.camera}>{footage}</SceneCamera>;
  }
  if (spec.source.type === "audio") {
    return <Audio src={resolveSrc(spec.source.src)} />;
  }
  return null;
};

/**
 * The music bed. It sits outside every camera and every Sequence on purpose:
 * a bed belongs to the composition, not to a shot, so nothing that reframes
 * the picture may reframe it.
 *
 * The fades are computed against composition frames rather than handed to the
 * file, because a bed is almost always longer than the edit and its own tail
 * is nowhere near the last frame.
 */
const MusicLayer = ({ music }: { music: SpecMusic }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const fadeIn = Math.round(music.fadeInSec * fps);
  const fadeOut = Math.round(music.fadeOutSec * fps);

  return (
    <Audio
      src={resolveSrc(music.src)}
      loop={music.loop}
      trimBefore={music.trimStartSec > 0 ? Math.round(music.trimStartSec * fps) : undefined}
      volume={(f) => {
        const up = fadeIn > 0
          ? interpolate(f, [0, fadeIn], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          : 1;
        const down = fadeOut > 0
          ? interpolate(f, [durationInFrames - fadeOut, durationInFrames - 1], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          : 1;
        return music.volume * up * down;
      }}
    />
  );
};

/**
 * The compiler: an Edit Spec + a Brand Theme in, a composition out.
 * Same component drives the site player, Remotion Studio and server renders.
 */
export const SpecRenderer = ({ spec, theme, sfxScope }: SpecRendererProps) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const ctx = { fps, totalFrames: durationInFrames };

  const wrapping = spec.overlays.find(
    (o) => TEMPLATE_MAP[o.template]?.sourceContract === "wraps-video"
  );
  const wrappingActive = wrapping
    ? (() => {
        const win = resolveWindow(wrapping.time, ctx);
        return frame >= win.from && frame < win.from + win.durationInFrames;
      })()
    : false;

  return (
    <PreviewSoundScopeProvider scope={sfxScope ?? null}>
      <BrandProvider value={theme}>
      <AbsoluteFill
        style={{
          ...backgroundStyle(theme),
          fontFamily: theme.fonts.body,
        }}
      >
        {spec.music ? <MusicLayer music={spec.music} /> : null}
        <SceneCamera camera={spec.camera}>
          <div style={{ position: "absolute", inset: 0, opacity: wrappingActive ? 0 : 1 }}>
            <SourceLayer spec={spec} />
          </div>
          {spec.overlays.map((o, i) => {
            const def = TEMPLATE_MAP[o.template];
            if (!def) return null;
            const { from, durationInFrames: dur, appearFrames } = resolveWindow(o.time, ctx);
            // A wrapping template renders its OWN copy of the base footage, so
            // for one instant the composition holds two video elements for the
            // same file: the base layer, warm and playing, and the wrapper's,
            // mounted this very frame. Hiding the first and revealing the
            // second on the same frame means revealing an element that has not
            // decoded anything yet, and what shows through it is the backdrop.
            // In a render every frame is extracted on demand so nothing is
            // visible; in the Studio preview it is a one-frame flash of the
            // plate, which is exactly what it looks like: a bug.
            //
            // Mounting the wrapper a second early gives its element 30 frames
            // to seek before anyone sees it. The template draws nothing during
            // the lead, so the base layer is still the shot.
            const lead = def.sourceContract === "wraps-video" ? Math.round(fps * WRAP_LEAD_SEC) : 0;
            const seqFrom = Math.max(0, from - lead);
            const leadFrames = from - seqFrom;
            const box = resolveRegion(o.region, def.regions[0]);
            const Comp = def.component;
            const extraProps: Record<string, unknown> = {};
            if (def.sourceContract === "visualizes-audio" && spec.source.type === "audio") {
              extraProps.sourceSrc = resolveSrc(spec.source.src);
            }
            return (
              <Sequence key={i} from={seqFrom} durationInFrames={dur + leadFrames} layout="none">
                <SoundProvider value={mergeSound(spec.sound, o.sound)}>
                  <OverlayTimingProvider
                    value={{
                      appearFrames,
                      reveal: o.reveal ?? null,
                      exit: o.exit ?? null,
                      startFrame: from,
                      durationFrames: dur,
                      leadFrames,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: `${box.x}%`,
                        top: `${box.y}%`,
                        width: `${box.w}%`,
                        height: `${box.h}%`,
                        display: "flex",
                        justifyContent: box.justify,
                        alignItems: box.align,
                      }}
                    >
                      <OverlayTransform scale={o.scale} enter={o.enter} exit={o.exit}>
                        <OverlayCamera camera={o.camera}>
                          {/* Innermost of the three renderer layers: the camera
                              frames the region, object motion moves what is
                              inside it. */}
                          <OverlayMotion motion={o.motion ?? TEMPLATE_DEFAULT_MOTION[o.template]}>
                            <Comp {...o.props} {...extraProps}>
                              {def.sourceContract === "wraps-video" ? (
                                // Cancel the overlay's Sequence offset: the
                                // wrapped footage must keep composition time.
                                // Without this a wrapper that starts at 2s
                                // shows the video's first frame at that
                                // moment, so handing over from the base layer
                                // jumps the shot back to the beginning.
                                <Sequence from={-seqFrom} layout="none">
                                  <SourceLayer spec={spec} forceMuted ignoreReframes />
                                </Sequence>
                              ) : undefined}
                            </Comp>
                          </OverlayMotion>
                        </OverlayCamera>
                      </OverlayTransform>
                    </div>
                  </OverlayTimingProvider>
                </SoundProvider>
              </Sequence>
            );
          })}
        </SceneCamera>
      </AbsoluteFill>
      </BrandProvider>
    </PreviewSoundScopeProvider>
  );
};
