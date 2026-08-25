import { useMemo } from "react";
import { z } from "zod/v3";
import { Img, useVideoConfig } from "remotion";
import { useBrand, withAlpha } from "../../theme/themes";
import { PropSfx } from "../../sound/Sfx";
import { templateSfx } from "../../sound/config";
import { pop, useInOut } from "../../player/motion";
import { resolveSrc } from "../../player/resolve-src";
import { useRem } from "../../player/scale";
import { shakeTransform } from "../../player/shake";
import type { TemplateDef } from "../types";

const photoSchema = z.object({
  src: z.string().min(1).describe("High-resolution image path or URL"),
  focus: z.string().default("center"),
});

export const photoStackSchema = z.object({
  photos: z.array(photoSchema).min(2).max(6),
  secondsPerPhoto: z.number().min(0.45).max(2).default(0.72),
  photoSfx: templateSfx
    .default("shutter")
    .describe(
      "Camera cue as each photo lands. `false` is silence; a cue name or audio path swaps it.",
    ),
});

const ROTATIONS = [-8, 6, -3.5, 7.5, -5, 3];
const OFFSETS = [
  { x: -34, y: 17 },
  { x: 32, y: 10 },
  { x: -12, y: -7 },
  { x: 19, y: 8 },
  { x: -23, y: 3 },
  { x: 7, y: -5 },
];

const PhotoStack = (raw: Record<string, unknown>) => {
  const p = useMemo(() => photoStackSchema.parse(raw), [raw]);
  const brand = useBrand();
  const rem = useRem();
  const { fps } = useVideoConfig();
  const { frame } = useInOut();
  const per = Math.round(p.secondsPerPhoto * fps);
  const firstAt = 0;
  const finalPhotoAt = firstAt + (p.photos.length - 1) * per;
  const swayAt = finalPhotoAt + Math.round(fps * 0.55);
  const sway =
    frame >= swayAt
      ? shakeTransform((frame - swayAt) / fps, {
          style: "sway-3d",
          amount: 0.42,
          frequency: 0.18,
          seed: 7,
          rampSec: 0.5,
          rampOutSec: 0,
        })
      : "none";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: rem(680),
          height: rem(760),
          perspective: rem(1500),
          transform:
            sway === "none" ? "none" : `perspective(${rem(1400)}px) ${sway}`,
          // The cards must remain one flat stack. Preserving their individual 3D
          // planes makes a dropping card intersect cards already underneath it.
          transformStyle: "flat",
          transformOrigin: "center center",
          willChange: "transform",
        }}
      >
        {p.photos.map((photo, index) => {
          const at = firstAt + index * per;
          const photoIn = pop(frame, fps, at, { damping: 14, stiffness: 125 });
          const baseRotation = ROTATIONS[index];
          const offset = OFFSETS[index];
          const enterY = (1 - photoIn) * rem(-380);
          const enterScale = 0.72 + Math.min(1, photoIn) * 0.28;

          return (
            <div
              key={`${photo.src}-${index}`}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: rem(550),
                height: rem(688),
                marginLeft: rem(-275),
                marginTop: rem(-344),
                zIndex: index + 1,
                padding: rem(10),
                background: brand.colors.surface,
                borderRadius: rem(Math.max(brand.radius, 18)),
                boxShadow: `0 ${rem(30)}px ${rem(70)}px rgba(0,0,0,.24), 0 0 0 ${rem(1)}px ${withAlpha(brand.colors.onSurface, 0.1)}`,
                // A translucent card crossing the stack creates a muddy double exposure.
                // Keep frame zero empty, then show each card fully opaque for its drop.
                opacity: frame > at ? 1 : 0,
                transform: `translate3d(${rem(offset.x)}px, ${rem(offset.y) + enterY}px, 0) rotateZ(${baseRotation + (1 - photoIn) * -16}deg) rotateX(${(1 - photoIn) * 9}deg) scale(${enterScale})`,
                transformOrigin: "center center",
                backfaceVisibility: "hidden",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  overflow: "hidden",
                  borderRadius: rem(Math.max(brand.radius - 7, 11)),
                  background: brand.colors.background,
                }}
              >
                <Img
                  src={resolveSrc(photo.src)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: photo.focus,
                    imageRendering: "auto",
                    backfaceVisibility: "hidden",
                  }}
                />
              </div>
              <PropSfx sfx={p.photoSfx} at={at} volume={0.42} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const photoStackDef: TemplateDef = {
  slug: "photo-stack",
  title: "Photo Stack",
  tier: "free",
  category: "Social",
  description:
    "Two to six high-resolution photos drop into a clean tactile stack, then the finished stack gently sways in 3D.",
  sourceContract: "overlay",
  regions: ["center", "fullscreen"],
  schema: photoStackSchema,
  demoProps: {
    photos: [
      { src: "/demo/photo-stack-storyboard.png" },
      { src: "/demo/photo-stack-camera.png", focus: "center 42%" },
      { src: "/demo/photo-stack-review.png", focus: "center 40%" },
    ],
  },
  demoDurationSec: 7,
  component: PhotoStack,
};
