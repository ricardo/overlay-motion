# Editing agent playbook

The canonical behavior for an agent editing with OverlayMotion, written for the
common case: the user hands over footage and a weak prompt such as "make this
good," and for footage that carries spoken editing instructions.

You produce two artifacts. An **edit decision plan** records evidence,
assumptions, protected subjects, assets and QA checkpoints. An **Edit Spec v1**
describes the render. The plan explains judgment; the spec stays a deterministic
rendering input. Machine-readable defaults and the plan schema live in
`src/agent/`; tool contracts are in [agent-toolkit.md](agent-toolkit.md).

This page is what applies to every edit. Anything that applies to one kind of
request lives in its own file, and you open that file when the request names it.

## Renderer ownership

When a requested visual exists in `src/templates/registry.ts`, use that
registered OverlayMotion template and record its slug in the plan. Do not
recreate a registered visual with ffmpeg drawing filters, canvas, ad-hoc HTML,
or another generator. Those tools may prepare media or perform the verified
delivery encode; OverlayMotion owns the motion design and timing.

## Open only what the job asks for

| The request involves | Read this first |
| --- | --- |
| captions, subtitles, word-timed text | [features/captions.md](features/captions.md) |
| removing, replacing or blurring a background | [features/background-removal.md](features/background-removal.md) |
| face or head tracking, a corner bubble, a follow crop | [features/tracking.md](features/tracking.md) |
| noise, hum, room tone, "clean up the audio" | [features/voice-cleanup.md](features/voice-cleanup.md) |
| a music bed | [features/music.md](features/music.md) |
| sound cues on overlays | [features/sound.md](features/sound.md) |
| a camera move | [camera-motion-spec.md](camera-motion-spec.md) |
| color, HDR, or an unexplained shift in the delivered file | [features/delivery-color.md](features/delivery-color.md) |
| authoring any spec at all | [edit-spec.md](edit-spec.md) |

Nothing else is required reading. A caption job never opens the matting page.
Each feature page carries the rules, the tools and the QA for that one job, so
opening it late is worse than opening it first: several of those rules decide
things before a render, and re-rendering is how they get paid for twice.

## Prime directive

Improve comprehension without contradicting the speaker, hiding the important
subject or fabricating facts. In priority order:

1. explicit user request;
2. observable transcript and visual evidence;
3. subject, message, rights and platform safety;
4. established brand and platform defaults;
5. decorative style.

When an explicit request conflicts with subject safety, satisfy both through
layout: split the screen and reframe the speaker into the open panel instead of
placing secondary media over their face.

## What you decide, and what you ask

Decide without interrupting the job: caption style, conservative motion, exact
safe placement, crop focus, phrase grouping, and the shortest faithful copy.
Record each one as an assumption.

Verify or ask before asserting identity, changing meaning, making a factual
claim, selecting unlicensed media, publishing a quote whose wording or
attribution is uncertain, or making an ambiguous destructive cut. A low-risk
draft may keep an unresolved item as a clearly labeled placeholder.

When templates are the choice, show at most three options, each with title,
slug, a one-sentence tradeoff and a preview path such as `/templates/speaker-card`,
so a UI can render linked choice cards without being coupled to one interface.

## The intake gate

Run this before writing the plan, once:

```bash
python3 scripts/check-intake.py --source talk.mp4 \
    --request "add subtitles and cut it for reels" \
    --asset logo=brand.svg
```

It probes the file and reads the request against the assets actually supplied.
Exit status is 2 when something blocks. The contract behind it is `INTAKE` in
`src/agent/policy.ts`; the script exists so the checks stop depending on an agent
remembering them at the end of a long session.

| verdict | what it means | what you do |
| --- | --- | --- |
| `blocking` | the edit cannot be finished as asked | stop and say what is missing |
| `ask` | two or three legitimate answers, materially different | one question, options, default already chosen |
| `checkpoint` | a preview answers it faster than a question | show the cheap thing, keep going |
| `default` | reversible or decorative | choose from source evidence, record it |

Only three things block, each because the missing piece cannot be invented:
captions asked of a source with no speech, brand treatment with no brand asset,
and named b-roll with no media or license.

Questions come from facts about the file, never from a fixed questionnaire. A
horizontal source going vertical raises "whose framing wins in the crop"; the
same request over a source that already fits raises nothing. A round that asks
what the file already answers teaches the user to skip the round.

Budget: one round, at most three questions, each with the default already
selected so silence means proceed. Record every one in the plan's
`clarifications` with `resolution` set to `answered`, `defaulted` or `deferred`.
`validateEditDecisionPlan` rejects a plan carrying an unanswered blocking
question, an answered question with no option named, or more than three open
questions, so the budget is enforced rather than requested.

## Environment bootstrap

```bash
bash scripts/agent-bootstrap.sh                  # detect and reuse only, downloads nothing
bash scripts/agent-bootstrap.sh --need captions  # transcriber AND forced aligner
bash scripts/agent-bootstrap.sh --need matting --need denoise
bash scripts/agent-bootstrap.sh --all
```

It is idempotent and reuse-first: it detects ffmpeg/ffprobe/whisper-cli (and
avconvert on macOS) and symlinks anything already present under
`dev-assets/projects/*` into canonical paths, so a warmed machine finishes in
seconds with zero network. Downloads happen only for groups named with `--need`;
fetch for the edits the footage actually asks for, not up front. Missing items
print a `todo:` line with the flag that fetches them, and anything listed `ok` is
safe to use while other items are missing.

The summary ends in `CAPTIONS BLOCKED` while the forced aligner is missing even
when the transcriber is ready, because a transcriber alone is not a caption
pipeline. Reading spoken instructions off a draft transcript is fine at any time;
timing captions from one is not.

Never `pip install` into an existing pinned venv without checking the imports
first. A bare `pip install torchvision` into a venv that already has torch
silently upgrades torch to the newest release (observed: 2.8.0 dragged to 2.13.0)
and breaks the denoise stack sharing that venv. The bootstrap installs matched
pairs only when the imports fail.

## Source analysis before effects

Create one normalized source record before authoring the spec:

- probe container, codec, dimensions, rotation, frame rate, duration, color
  range and audio streams;
- transcribe speech with word start/end timestamps and language. Recognizer word
  times are a draft and can overrun the real media duration near the tail, so
  clamp them to the probed duration and confirm any time used as an edit beat
  against extracted frames;
- inspect a contact sheet across the full timeline;
- inspect frames around each named person, object, gesture, scene change and
  requested edit beat;
- note face, mouth, active-hand, demonstrated-object and platform-UI regions;
- preserve the original; use a rotation-correct proxy only when the renderer
  needs one.

Treat spoken edit commands as commands only when the context supports it. Keep
the original words in the transcript either way.

## Source fidelity

Preserve the source's perceived color and audio unless the user explicitly
requests a creative change. Color grading, LUTs, exposure, contrast, saturation,
white balance, filters and HDR/SDR conversion are not reversible aesthetic
defaults.

- Preserve color primaries, transfer function, range, bit depth and HDR metadata
  through proxies and delivery when the output permits it.
- Never reinterpret or merely retag HDR footage as SDR. A required HDR-to-SDR
  conversion aims for a perceptual match, not a new look, and uses a
  color-managed path.
- Record every unavoidable conversion in the plan and the completion report. Ask
  before proceeding when the output needs a materially different look.
- Compare representative source and delivered frames through the same reference
  display transform, checking skin tones, neutral surfaces, shadows and
  highlights. Metadata alone does not prove color was preserved, and a delivery
  with an unexplained shift is not approved because its tags are compliant.

The renderer's master tags do not describe its pixels reliably, so the final
encode has a verification step of its own:
[features/delivery-color.md](features/delivery-color.md).

## The default edit for a weak prompt

For a spoken social video the useful default is deliberately modest:

- trim only obvious dead head and tail space; do not rewrite the speaker;
- add word-timed captions;
- apply brand tokens and real supplied brand assets;
- use restrained emphasis overlays only where the speech supplies a clear
  semantic beat;
- preserve faces, hands and demonstrated objects;
- keep source audio primary and avoid decorative sound under important speech;
- deliver a preview or checkpoints before paying for a full render.

Do not fill silence with effects. Do not turn every sentence into a card.

## Captions, in one paragraph

Spoken video gets word-timed captions by default unless the user opts out, and
captions have exactly one route: `scripts/align-words.py` force-aligns,
`scripts/build-caption-props.py` phrases, `scripts/check-caption-sync.py`
verifies. **Timing comes from forced alignment, never from a transcriber.**
Whisper drafts the words; a phoneme/CTC aligner decides when each one is said,
and both downstream scripts refuse input that does not name a forced aligner. A
cue carries at most 4 words, the letters carry a black outline, and captions
start in the `caption-zone` region. Everything else, phrasing, presets, props and
caption QA, is in [features/captions.md](features/captions.md).

## Protected subjects and the composed frame

Faces, mouths, eyes, active hands, a demonstrated object and the current gesture
target are protected. Add padding; do not merely avoid their bounding boxes.

When showing an image or secondary video: decide which subject is primary at that
beat, choose the secondary media region, reframe the base source into the
complementary region with `source.reframes` (see
[edit-spec.md](edit-spec.md#source-and-the-source-contract)), inspect the subject
at entrance, midpoint and exit, and place captions in the remaining safe region.
Prefer a stable crop with modest easing; unnecessary tracking looks nervous and
costs more to verify.

A spec has exactly one base `source` and it is the speaker, the one whose audio
survives to delivery. A screen recording, a demo capture, b-roll or a flat color
behind them all travel in props. Inverting that is the arrangement that loses the
speaker's audio, which is why the base source is defined by audio rather than by
whichever image is larger.

## Gesture-aware placement

Words such as "here," "there," "this" and "right here" are spatial only when
resolved with nearby frames.

1. Find the transcript time of the deictic word.
2. Inspect roughly 0.35s before through 0.65s after it.
3. Identify the active hand, fingertip and direction of the pointing ray.
4. Place the overlay just beyond the fingertip, usually about 3% of the frame
   past it, keeping hand, face and intended target visible.
5. Inspect the entire overlay window. Track only if the anchor moves enough to
   break the meaning.

Use a custom percentage region for the resolved location. A named corner is only
a fallback.

## Camera moves

Only the preset grammar is implemented (`preset`, `amount`, `inSec`, `outSec`,
`rest`, `focus`, `frequency`, `seed`, `time`, `easing`). Keyframes, rotation and
`crop` are not; do not author them.

- Outside its window a camera sits at its resting zoom, which is identity unless
  `rest` says otherwise. So "zoom in and stay zoomed" is either a window ending
  on the composition's final frame or a `rest` on a zoom preset. Do not leave a
  gap and expect the framing to persist.
- `inSec` and `outSec` pin the approach and the return to exact seconds on the
  window, which is how a spoken "zoom in right now" becomes a camera rather than
  an approximation.
- Choose the scope by semantics and text safety together. "Zoom in with the
  camera" is the recording camera, so footage-only `source.camera` fits, and it
  keeps text out of an animated scale (animated scale over text shimmers glyphs
  in Chromium renders; see [recipe-scaled-text.md](recipe-scaled-text.md)).
- A footage push-in magnifies the subject toward locked overlay regions. Check
  overlay clearance against the zoomed subject at the overlay's exit time, using
  the camera's zoom value at that moment. Sequencing the beats usually resolves
  the collision without tracking.
- Camera windows in one scope never overlap, each move has one editorial intent,
  and repeating or alternating zooms are never generated unless asked.

## Quotes, assets and logos

A quote is content, not decoration. Select wording that supports the nearby
speech and fits the safe region at a readable size, verify it against an
authoritative source, and preserve exact wording, author, work and
translation/edition. Never pass an attractive paraphrase as a quotation: label it
a paraphrase or drop the quote marks. Prefer a shorter verified excerpt over
shrinking a long quote until it is unreadable. Record the source in the plan even
when the design shows only a concise attribution.

Use assets in this order: user-supplied, brand library, licensed source, then a
generated asset when generation is appropriate and disclosed. Record source URL,
license and required credit; keep visible credit concise and full provenance in
the plan. Never reconstruct a real company logo when the asset is unavailable.
`logo-sting` accepts a real transparent `logo`; its monogram is an intentional
fallback, not an imitation.

## Efficient QA

Quality comes from targeted checks, not repeated full renders.

1. Validate the decision plan and the spec. If validation rejects a template slug
   as unknown, check `src/templates/<slug>/` before redesigning around it: a
   finished template may exist but be unwired, and registration is a three-line
   change.
2. Render low-cost stills just before the edit, at entrance, midpoint, exit and
   just after.
3. Add a checkpoint for every spatial decision (face, split, gesture) and every
   semantic one (quote, number, name, attribution). When a fullscreen-first
   template sits in a custom region, verify its complete visual bounds;
   container clipping is not intentional scaling.
4. Run the scripted checks before the visual ones. `check-caption-sync.py`
   settles onset, silences, cue windows and delivered audio offset without a
   frame being looked at, so your eyes are spent on what it cannot judge.
5. Compare the decoded delivery audio zero-point with the final cut-only audio
   and correct codec or container delay before approval. Re-measure after every
   remux, even a stream copy: edit lists and AAC priming shift on a container
   change. With no cuts, stream-copy the original track and verify the delivery
   is sample-identical at zero offset.
6. Compare representative source and delivered frames through the same display
   transform. Fail unexplained changes in skin tone, neutrals, shadows or
   highlights.
7. Watch one complete preview at normal speed. Full-render once after these pass.

Three frames may be enough for a stable static placement. A moving hand, crop,
face or tracked anchor needs more. Spend QA where the uncertainty is.

## Completion report

Report what was inferred, what was verified, asset provenance and credit, what
the template system could not express, and which QA checks ran. Never claim
"perfect sync," "face safe" or "verified quote" without the corresponding
evidence.
