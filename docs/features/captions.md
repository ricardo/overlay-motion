# Captions

Read this before authoring any request for subtitles, captions or word-timed
text. Spoken video gets captions by default unless the user opts out.

## One route, three commands

```bash
python3 scripts/align-words.py --audio <final cut audio> --transcript copy.txt
python3 scripts/build-caption-props.py --dir <project dir> --source <video>
python3 scripts/check-caption-sync.py --audio <final cut audio> \
    --props render-props.json --delivery <rendered file>
```

**Timing comes from forced alignment, never from a transcriber.** Whisper drafts
the words; a phoneme/CTC aligner decides when each one is said. Whisper segment
or token times, patched with silence heuristics, have shipped visibly wrong
caption timing and were rejected on review, so this is not a preference between
two working options. `align-words.py` runs torchaudio `MMS_FA` + `forced_align`
by default and WhisperX wav2vec2 with `--backend whisperx`; the aligner class is
the requirement, the package is not. `build-caption-props.py` and
`check-caption-sync.py` both refuse input that does not name a forced aligner, so
a transcriber's timestamps cannot reach a render even by accident.

If the aligner will not run, the fix is
`bash scripts/agent-bootstrap.sh --need captions`, not a fallback. Subtitles that
drift are the most visible way this product fails. The reasoning and the failure
modes are in [recipe-whisper-sync.md](../recipe-whisper-sync.md).

**Lock every source cut before final caption timing.** Alignment times belong to
the timeline of the file you align against, so align against the cut-only proxy.
Mapping pre-cut timestamps through edit ranges is only a draft.

**Verify the drafted copy before the words are final.** Running `align-words.py`
without `--transcript` drafts one and marks it `transcriptVerified: false`;
`build-caption-props.py` stops there, because a perfectly timed wrong word is
still a wrong word.

Reject an alignment when its first token begins before measured speech, when a
phrase stretches across silence, or when spot checks disagree with the waveform
or mouth timing. Never infer cadence by evenly dividing a phrase.
`check-caption-sync.py` tests the mechanical half of that list and exits 1.

## Phrasing

- **A cue carries at most 4 words**, normally no more than two lines and about 32
  characters per line. Four is a ceiling, not a target: you still phrase each
  cue, and you break where the speech breaks (clause end, comma, pause), not by
  filling every cue to the cap. On continuous speech most cues land at the cap
  anyway; that is the cap doing its job, not a phrasing decision. Raise it
  deliberately with `grouping.maxWords` when the copy needs it. `caption-classic`
  enforces the same ceiling itself, so a caller that groups loosely gets split
  rather than a wall of text: `explicit` mode means your phrasing is respected,
  not that the cap is waived.
- Show a phrase about 80ms before its first word. Highlight using aligned word
  boundaries. Hold the completed phrase for up to 180ms when the next phrase or
  silence permits; do not overlap adjacent phrase windows.
- Preserve pauses as empty time. A caption disappears during a meaningful silence
  rather than stretching across it.
- Keep casing and punctuation readable. Correct obvious transcription mistakes
  only when the audio makes the intended word clear.
- Start captions in the named `caption-zone` region (`{x: 6, y: 65, w: 88,
  h: 20}`), slightly above the lower platform-control area. Move it only after
  visual checks, keeping captions away from the face, mouth, active hands and any
  media carrying the current meaning.

**Captions carry a black outline on the letters.** This is the `classic` preset
default, not decoration. Subtitles do not get to choose what is behind them, and
a drop shadow alone disappears on light footage. Legibility has to come from the
type.

`text.case` (`as-spoken` | `upper` | `lower`) and `text.punctuation` (`keep` |
`strip`) rewrite the drawn copy only. Both stay off unless the user asks. They
never touch the transcript or the timing, and they are applied after grouping, so
punctuation still decides where a phrase breaks even when it is not drawn.
`strip` drops commas and periods only: question and exclamation marks carry
meaning a reader cannot recover from the words.

## The template

`caption-classic` is the caption renderer. New specs pass one
composition-relative `track`; legacy overlay-relative `lines` remains valid.
`region` controls the outer position.

```json
{
  "template": "caption-classic",
  "region": "caption-zone",
  "time": {},
  "props": {
    "preset": "classic",
    "grouping": {
      "mode": "auto",
      "targetWords": 3,
      "maxWords": 4,
      "maxLines": 2,
      "maxCharactersPerLine": 32
    },
    "layout": { "textAlign": "center", "verticalAlign": "bottom" },
    "highlight": { "mode": "word", "duringGaps": "none", "badgeMarginX": 6 },
    "appearance": {
      "mode": "fade-up",
      "durationSec": 0.18,
      "distance": 18,
      "staggerSec": 0.07
    },
    "styles": { "buzzword": { "fontRole": "serif", "fontWeight": 800 } },
    "track": {
      "timebase": "composition",
      "cues": [
        {
          "start": 1.1,
          "end": 2.4,
          "words": [
            { "text": "Build", "start": 1.18, "end": 1.45 },
            { "text": "OverlayMotion", "start": 1.46, "end": 2.05, "marks": ["buzzword"] }
          ]
        }
      ]
    }
  }
}
```

Highlight mode is `word` or `none`. `duringGaps: "none"` restricts active
treatment to actual aligned word windows; `hold` retains the last started word.
`badgeMarginX` reserves badge clearance on every word whenever the highlighted
style has a badge or pill background; it is never applied per active word,
because a margin that comes and goes with the highlight reflows the centered line
at word cadence and reads as the whole video micro-zooming. Appearance modes are
`instant`, `fade`, `fade-up`, `pop` and `word-by-word`.

## Presets, and which knob answers which request

Presets: `classic`, `minimal`, `editorial`, `punch`, `extruded`. `punch` is the
social hard-outline look: one word at a time, heavy weight, thick black stroke
painted behind the fill and a hard drop shadow, so it stays legible over any
footage without a plate. `extruded` keeps that cadence but replaces the shadow
with a solid extrusion down and to the right, the sticker look. `punch` wants a
heavy grotesk in the brand theme and `extruded` a rounded face (Arial Rounded MT
Bold is the reference); a light system stack will not read as intended.

**A preset spends two fonts at most, and only `classic` spends the second one.**
A track that changes face every few words stops reading as one voice, so the
theme font carries every state and `classic` gives the serif to `buzzword` alone;
`minimal` and `editorial` mark theirs with italic instead. `fontRole: "serif"`
resolves to the theme's `fonts.serif` when it names one and to Georgia when it
does not. Bare `serif` is not used: it lands on Times, which next to a grotesk
reads as a missing font rather than a second voice.

**Outline and shadow belong to the whole line, not to a state.** In `classic`
every state inherits the base `strokeWidth` and the base `textShadow`, so the
active word is marked by colour and its pill alone. A state that turned the
shadow off made the one word the eye is on the one word drawn differently, which
the line showed as a flicker at word cadence. Keep the outline near 9 (Chromium
centers it, so half hides under the fill and 9 draws about 4.5px): thinner and
the shadow is carrying legibility again, thicker and it closes the counters of
a, e and o, and the thin strokes a serif is recognised by.

A preset is a starting point, not a fork: every field it sets stays overridable
through `styles`.

- `strokeWidth` and `strokeColorRole` are the legibility layer, the only one that
  survives arbitrary footage.
- `extrude: { x, y, color }` is depth: a solid repeat of the glyph stepped out to
  `x, y`, which is what reads as a sticker. A single offset copy reads as a
  second word once the offset grows next to the type size, so prefer `extrude`
  over a hard `textShadow`.
- `textShadow` and `dropShadow` are not interchangeable. `textShadow` (`true` for
  the legacy soft shadow, or `{ x, y, blur, color, opacity }`) repeats the glyph
  alone, so under a thick stroke or an extrusion it is swallowed by them.
  `dropShadow` is cast by the whole painted silhouette, outline and extrusion
  included. Any tight offset, a 2px lift under `extruded` for instance, has to be
  `dropShadow` or it will not be visible at all.
- `fontRole` picks a theme role. `fontFamily` overrides it with a literal CSS
  stack (`"'Arial Rounded MT Bold', system-ui, sans-serif"`) when you are matching
  a reference face, which is cheaper than mutating a theme every other overlay
  shares. The family has to be installed already, because Chromium substitutes in
  silence and a wrong name renders as the wrong face instead of failing.
- Any color field accepts a brand token or a `#rrggbb` literal. Presets stay on
  roles, so a theme can still rebrand its own captions.

## Word marks

Word marks are style references, never raw CSS. A word's `marks` names one or
more styles, up to four, applied in order, so a later mark wins only the fields it
sets. `buzzword` and `emphasis` are built in; anything else resolves against
`styles.words`, a map of your own names to the same text style shape:

```json
"styles": {
  "words": {
    "pop": { "colorRole": "accent", "fontWeight": 900, "scale": 1.12 },
    "quote": { "fontRole": "serif", "fontStyle": "italic" }
  }
}
```

Naming the style instead of describing it inline keeps presentation out of the
copy and lets one treatment repeat across a track. A request for serif buzzwords
compiles to `styles.buzzword.fontRole: "serif"`; do not put prose or raw CSS in
word cues. A mark that resolves to nothing is a validation error naming the word,
not an unstyled word: the two are indistinguishable on screen, so the typo has to
fail at the gate or it never fails at all. Presets never ship `words`, because
which words in THIS track deserve a treatment belongs to the edit, not the look.

Text-only cues remain a compatibility fallback.

## Caption QA

Run `check-caption-sync.py` first: it settles onset, silences, cue windows and
delivered audio offset without a frame being looked at. Then check caption onset,
a middle word, phrase disappearance and a pause; for subtitles also inspect a
fast phrase and every cut boundary.

Hard-outline captions need sharp-glyph checkpoints (`w`, `m`, `v`, `W`) and
counter-rich glyphs (`e`, `a`, `o`): reject miter spikes, detached shadow copies
and any background gap between the painted word and its intended connected
shadow.

After render, decode the delivered file and compare its speech zero-point with
the aligned cut-only proxy. Containers and codecs add audio delay; correct that
offset before approval, then re-check the opening phrase, a fast phrase, every cut
boundary and the final phrase. Target no more than 20ms difference between
aligned audio and decoded delivery.

Re-check captions against the closest crop when the edit also tracks or reframes.
A screen-locked caption can collide with a newly centered or enlarged face even
when it was safe before.
