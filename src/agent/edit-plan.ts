import { z } from "zod/v3";
import { rectPct, region, timeWindow } from "../spec/types";
// The template owns the preset list. Restating it here let the plan schema
// drift behind `punch` and `extruded`.
import { captionPresetName } from "../templates/caption-classic/schema";

export const evidenceKind = z.enum([
  "explicit-user",
  "transcript",
  "visual",
  "verified-source",
  "editorial-default",
]);

export const confidence = z.enum(["high", "medium", "low"]);

export const clarificationReason = z.enum([
  "missing-required-input",
  "multiple-valid-templates",
  "meaning-or-rights-risk",
  "ambiguous-destructive-edit",
]);

/**
 * A reasoning/provenance artifact written before Edit Spec v1. It keeps
 * editorial inference auditable without coupling the renderer to an LLM.
 */
export const editDecisionPlan = z.object({
  version: z.literal(1),
  objective: z.string().min(1),
  assumptions: z
    .array(
      z.object({
        choice: z.string().min(1),
        basis: evidenceKind,
        confidence,
        reversible: z.boolean(),
        reason: z.string().optional(),
      }),
    )
    .default([]),
  clarifications: z
    .array(
      z.object({
        question: z.string().min(1),
        reason: clarificationReason,
        blocking: z.boolean(),
        options: z
          .array(
            z.object({
              id: z.string().min(1),
              label: z.string().min(1),
              description: z.string().optional(),
              templateSlug: z.string().optional(),
              previewPath: z.string().optional(),
            }),
          )
          .min(2)
          .max(3),
        resolution: z.enum(["answered", "defaulted", "deferred"]),
        selectedOptionId: z.string().optional(),
        resolutionNote: z.string().optional(),
      }),
    )
    .default([]),
  protectedSubjects: z
    .array(
      z.object({
        kind: z.enum(["face", "mouth", "eyes", "active-hand", "gesture-target", "object"]),
        time: timeWindow.optional(),
        region: rectPct.optional(),
        paddingPct: z.number().min(0).max(25).default(6),
      }),
    )
    .default([]),
  /**
   * Person segmentation, when the edit used it. Edit Spec v1 expresses none of
   * this: the matting runs first and its composite becomes the spec's video
   * source, so the plan is the only place the treatment is recorded.
   *
   * `outline` absent means no outline was drawn. It is an effect the user asks
   * for, never a byproduct of matting, so its presence carries `basis` for the
   * same reason a template choice does.
   */
  cutout: z
    .object({
      backend: z.string().min(1).describe("e.g. rvm-mobilenetv3, apple-vision, modnet"),
      checkpoint: z.string().min(1),
      inferenceScale: z.number().positive().max(1).optional(),
      expandPx: z.number().min(0).max(12),
      featherPx: z.number().min(0).max(12),
      background: z.object({
        kind: z.enum(["transparent", "color", "blur", "media"]),
        value: z.string().optional().describe("#RRGGBB for color, asset path for media"),
        dim: z.number().min(0).max(1).optional(),
        basis: evidenceKind,
      }),
      outline: z
        .object({
          widthPx: z.number().positive().max(120),
          color: z.string().min(1),
          basis: evidenceKind,
        })
        .optional(),
      colorPath: z.string().min(1),
      confidence,
    })
    .optional(),
  decisions: z.array(
    z.object({
      intent: z.string().min(1),
      evidence: z.array(evidenceKind).min(1),
      time: timeWindow.optional(),
      template: z.string().optional(),
      placement: region.optional(),
      sourceReframe: rectPct.optional(),
      confidence,
      notes: z.string().optional(),
    }),
  ),
  captions: z.object({
    enabled: z.boolean(),
    timing: z.enum(["word", "segment", "none"]),
    transcriptSource: z.string().optional(),
    language: z.string().optional(),
    preset: captionPresetName.optional(),
    placement: region.optional(),
    highlight: z.enum(["word", "none"]).optional(),
    appearance: z
      .enum(["instant", "fade", "fade-up", "pop", "word-by-word"])
      .optional(),
    grouping: z
      .object({
        targetWords: z.number().int().min(1).max(20),
        maxWords: z.number().int().min(1).max(24),
        maxLines: z.number().int().min(1).max(4),
        maxCharactersPerLine: z.number().int().min(8).max(80),
      })
      .optional(),
    styledWords: z
      .array(
        z.object({
          words: z.array(z.string().min(1)).min(1),
          mark: z.enum(["buzzword", "emphasis"]),
        }),
      )
      .optional(),
  }),
  assets: z
    .array(
      z.object({
        role: z.string().min(1),
        src: z.string().min(1),
        provenance: z.enum(["user-supplied", "brand-library", "licensed", "generated"]),
        sourceUrl: z.string().url().optional(),
        license: z.string().optional(),
        credit: z.string().optional(),
      }),
    )
    .default([]),
  qa: z.object({
    checkpoints: z.array(z.string()).min(1),
    checks: z.array(z.string()).min(1),
  }),
})
  /**
   * `blocking` used to be a field the plan carried and nothing read. A plan
   * could declare a question it called blocking, defer it, and still validate,
   * which is the exact shape of the failure the field exists to prevent: the
   * render happens, the user pays for it, and the question is still open.
   */
  .superRefine((plan, ctx) => {
    plan.clarifications.forEach((clarification, index) => {
      if (clarification.blocking && clarification.resolution !== "answered") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["clarifications", index, "resolution"],
          message:
            `Blocking clarification "${clarification.question}" is ${clarification.resolution}. ` +
            "A blocking question is answered before the edit runs, or it is not blocking. " +
            "Ask the user, or drop blocking and record the default you chose.",
        });
      }

      // An answered question with no answer recorded reads as resolved to
      // every later reader, including the completion report.
      if (clarification.resolution === "answered" && !clarification.selectedOptionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["clarifications", index, "selectedOptionId"],
          message: "An answered clarification names the option that was chosen.",
        });
      }

      if (
        clarification.selectedOptionId &&
        !clarification.options.some((option) => option.id === clarification.selectedOptionId)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["clarifications", index, "selectedOptionId"],
          message: `selectedOptionId "${clarification.selectedOptionId}" is not one of the options offered.`,
        });
      }
    });

    // The round is one round. A plan carrying more open questions than the
    // budget is an interview, and the user stops reading interviews.
    const open = plan.clarifications.filter((c) => c.resolution !== "answered").length;
    if (open > 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clarifications"],
        message: `${open} unanswered clarifications. Ask at most three, in one round; default the rest from source evidence.`,
      });
    }
  });

export type EditDecisionPlan = z.infer<typeof editDecisionPlan>;

export const validateEditDecisionPlan = (raw: unknown) => editDecisionPlan.safeParse(raw);
