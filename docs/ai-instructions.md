# AI instructions

You are an agent producing a video with OverlayMotion. This page is the compiler
model: how a request becomes a spec. Editorial behavior is normative in the
[Editing agent playbook](agent-playbook.md), and the playbook's routing table
says which feature page a given request needs.

## What you produce

One JSON edit spec. You never write React and never touch template internals. The
spec declares a base source, overlay templates with `region` (space) and `time`
(timeline), optional cameras, and sound. `parseSpec` in `src/spec/validate.ts` is
the gate: it checks shape AND template contracts, and its error messages name the
exact overlay to fix.

## Rules that keep output correct

1. **Pick templates by source contract.** `overlay` templates work over anything;
   `annotates-video` and `wraps-video` require `source.type: "video"`;
   `visualizes-audio` requires `source.type: "audio"`. Only one `wraps-video`
   overlay per spec. The contract is in each template's registry entry.
2. **Camera moves the frame, templates move the content.** Want the eye to
   travel? Use `spec.camera` (scene), `source.camera` (footage) or
   `overlay.camera` (one card). Want a card to slide, spring or type? Use `enter`,
   `reveal`, `exit` and template props. Never both for the same idea.
3. **Stay inside the canonical motion language** unless asked otherwise: `reveal`
   fade-up | blur-in | typewriter; `enter` slide-left | slide-right | spring |
   mask; `exit` blur-out | fade-down | shrink. Omitting them is always safe: every
   template has a designed native entrance.
4. **Time grammar:** `"3s"` seconds, `"66%"` of the owner timeline, `"-2s"` from
   the end. `appear` paces the entrance, `hold` keeps the finished overlay on
   screen; `appear + hold` defines the window when `duration` is absent. Sequence
   overlays with about 1s gaps so handoffs read cleanly.
5. **Brand comes from the theme, never from props.** No hex colors in props; the
   `BrandTheme` carries colors, heading/body/optional serif fonts, radius, and
   glass or solid surface. Style overrides reference these roles.

## Workflow

1. Analyze the media and write an Edit Decision Plan from the playbook.
2. Open the feature page for anything the request names (captions, background
   removal, tracking, voice cleanup, music, sound). Several of their rules decide
   things before a render.
3. Read the template list (`src/templates/registry.ts` or the gallery) and pick
   by contract and purpose.
4. Draft the spec.
5. Validate with `parseSpec`. Fix what the error names.
6. Check targeted frames and a full preview, then render once:

   ```bash
   npx remotion render remotion/index.ts custom out.mp4 --props=./edit.json
   ```

   Props JSON is `{"spec": ..., "theme": ...}`.

Technical reference: [Edit Spec v1](edit-spec.md). Camera grammar:
[Camera motion](camera-motion-spec.md).
