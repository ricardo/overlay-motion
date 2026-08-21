import { z } from "zod/v3";
import {
  editSpec,
  MUSIC_BED_MAX_VOLUME_UNDER_SPEECH,
  type EditSpec,
} from "./types";
import { contractNeedsSourceVideo } from "../templates/types";
import { TEMPLATE_MAP } from "../templates/registry";
import { resolveWindow } from "./time";
import { cameraPresetZooms } from "../player/camera";

/**
 * Full spec validation: zod shape plus source-contract cross-checks against
 * the template registry. `editSpec` alone cannot see the registry (it would
 * be a circular import), so every entry point that accepts a hand-written
 * spec goes through here instead of `editSpec.parse`.
 */
const checkedSpec = editSpec.superRefine((spec, ctx) => {
  let wrapping: string | null = null;
  const timelineContext = {
    fps: spec.fps,
    totalFrames: Math.round(spec.durationSec * spec.fps),
  };
  const validateCameraWindows = (
    cameraSpec: typeof spec.camera,
    path: Array<string | number>,
  ) => {
    if (!cameraSpec) return;
    const cameras = Array.isArray(cameraSpec) ? cameraSpec : [cameraSpec];
    const windows = cameras
      .map((camera, index) => ({
        camera,
        index,
        ...resolveWindow(camera.time, timelineContext),
      }))
      .sort((a, b) => a.from - b.from);

    windows.forEach((window) => {
      const timePath = Array.isArray(cameraSpec)
        ? [...path, window.index, "time"]
        : [...path, "time"];
      if (window.from + window.durationInFrames > timelineContext.totalFrames) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: timePath,
          message: "Camera window extends past the composition duration",
        });
      }
      if (
        window.camera.preset === "push-in-fast-out" &&
        window.durationInFrames < Math.round(spec.fps * 3)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: timePath,
          message: "push-in-fast-out needs a camera window of at least 3 seconds for a readable arrival, hold, and return",
        });
      }
      const { inSec, outSec, preset, rest, amount } = window.camera;
      if (rest > 0) {
        const restPath = Array.isArray(cameraSpec) ? [...path, window.index] : path;
        if (!cameraPresetZooms(preset)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: restPath,
            message: `rest is a resting ZOOM and ${preset} does not zoom; drop it or pick a zoom preset`,
          });
        } else if (rest > amount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: restPath,
            message: `rest ${rest} exceeds amount ${amount}: a camera cannot settle further in than the furthest point of its own move`,
          });
        }
      }
      if (inSec !== undefined || outSec !== undefined) {
        const phasePath = Array.isArray(cameraSpec) ? [...path, window.index] : path;
        if (preset === "handheld" || preset.startsWith("pan-")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: phasePath,
            message: `inSec/outSec only apply to the zoom presets, not ${preset}`,
          });
        } else if (preset === "push-in" && outSec !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: phasePath,
            message: "push-in has no return phase; use push-in-out or push-in-fast-out for outSec",
          });
        } else if (preset === "pull-out" && inSec !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: phasePath,
            message: "pull-out has no approach phase; use push-in-out or push-in-fast-out for inSec",
          });
        } else {
          const windowSec = window.durationInFrames / spec.fps;
          if ((inSec ?? 0) + (outSec ?? 0) > windowSec) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: phasePath,
              message: `inSec + outSec exceed the ${windowSec.toFixed(2)}s camera window; nothing would be left to hold`,
            });
          }
        }
      }
    });

    for (let index = 1; index < windows.length; index += 1) {
      const previous = windows[index - 1];
      const current = windows[index];
      if (current.from < previous.from + previous.durationInFrames) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, current.index, "time"],
          message: `Camera windows may not overlap in one scope; this window overlaps camera ${previous.index}`,
        });
      }
    }
  };

  validateCameraWindows(spec.camera, ["camera"]);
  if (spec.source.type === "video") {
    validateCameraWindows(spec.source.camera, ["source", "camera"]);
  }

  // A bed that plays under speech has one job and it is not to be heard over
  // the speaker. The ceiling only applies when there IS speech: a spec with no
  // source audio, or a muted one, is a music video and may run the track loud.
  if (spec.music) {
    const carriesSpeech = spec.source.type === "video" && !spec.source.muted;
    if (carriesSpeech && spec.music.volume > MUSIC_BED_MAX_VOLUME_UNDER_SPEECH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["music", "volume"],
        message:
          `A music bed under unmuted source audio may not exceed ${MUSIC_BED_MAX_VOLUME_UNDER_SPEECH}; ` +
          `got ${spec.music.volume}. Music masters are typically louder than recorded speech, so a bed ` +
          `near 1 is louder than the person talking. Measure both with ffmpeg's ebur128 filter and set ` +
          `the gain that puts the bed 15 to 20 LU under the voice, or mute the source if the music is ` +
          `meant to lead.`,
      });
    }
  }

  spec.overlays.forEach((o, index) => {
    const def = TEMPLATE_MAP[o.template];
    const path = ["overlays", index, "template"];
    if (!def) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `Unknown template "${o.template}"`,
      });
      return;
    }
    const propsResult = def.schema.safeParse(o.props);
    if (!propsResult.success) {
      propsResult.error.issues.forEach((issue) => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["overlays", index, "props", ...issue.path],
          message: issue.message,
        });
      });
    }
    if (contractNeedsSourceVideo(def.sourceContract) && spec.source.type !== "video") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message:
          def.sourceContract === "wraps-video"
            ? `"${o.template}" renders the base video inside its layout; set source.type to "video"`
            : `"${o.template}" annotates the base footage; set source.type to "video"`,
      });
    }
    if (def.sourceContract === "visualizes-audio" && spec.source.type !== "audio") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `"${o.template}" visualizes a standalone audio file; set source.type to "audio"`,
      });
    }
    if (def.sourceContract === "wraps-video") {
      if (wrapping) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `Only one overlay may wrap the base video; "${wrapping}" already does`,
        });
      } else {
        wrapping = o.template;
      }
    }
    const overlayWindow = resolveWindow(o.time, timelineContext);
    if (overlayWindow.from + overlayWindow.durationInFrames > timelineContext.totalFrames) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["overlays", index, "time"],
        message: "Overlay window extends past the composition duration",
      });
    }
  });

  if (spec.source.type === "video" && spec.source.reframes) {
    const windows = spec.source.reframes
      .map((reframe, index) => ({
        index,
        ...resolveWindow(reframe.time, timelineContext),
      }))
      .sort((a, b) => a.from - b.from);
    for (let index = 1; index < windows.length; index += 1) {
      const previous = windows[index - 1];
      const current = windows[index];
      if (current.from < previous.from + previous.durationInFrames) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["source", "reframes", current.index, "time"],
          message: `Source reframes may not overlap; this window overlaps reframe ${previous.index}`,
        });
      }
    }
    windows.forEach((window) => {
      if (window.from + window.durationInFrames > timelineContext.totalFrames) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["source", "reframes", window.index, "time"],
          message: "Source reframe extends past the composition duration",
        });
      }
    });
  }
}).transform((spec) => ({
  ...spec,
  overlays: spec.overlays.map((overlay) => {
    const def = TEMPLATE_MAP[overlay.template];
    return def
      ? { ...overlay, props: def.schema.parse(overlay.props) as Record<string, unknown> }
      : overlay;
  }),
}));

/** Safe variant: returns a zod result instead of throwing. */
export const validateSpec = (raw: unknown) => checkedSpec.safeParse(raw);

/** Throwing variant for trusted call sites (site examples, tests). */
export const parseSpec = (raw: unknown): EditSpec => checkedSpec.parse(raw);
