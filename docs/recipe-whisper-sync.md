# Recipe: forced-aligned subtitles and speech triggers

Goal: checklist ticks (or captions, or any timed prop) land exactly when the
speaker says each thing. Everything runs on the agent's machine; nothing on ours.

## The route

```bash
bash scripts/agent-bootstrap.sh --need captions          # transcriber + aligner
python3 scripts/align-words.py --audio cut-audio.wav --transcript copy.txt
python3 scripts/build-caption-props.py --dir <project> --source cut-proxy.mp4
python3 scripts/check-caption-sync.py --audio cut-audio.wav \
    --props render-props.json --delivery delivery.mp4
```

Transcription drafts the words. **Forced alignment decides every timestamp.**
That split is the whole recipe; the rest of this page is why each step exists
and how to read what it prints.

Whisper is a transcriber. Asked what was said, it is excellent. Asked when each
word was said, it answers from segment and token boundaries that drift a tenth
of a second or more, and drift differently on either side of a cut. A CTC
aligner is asked a narrower question, given these exact words and this exact
audio, where does each word start, and it answers to the frame. Captions timed
from the first question have shipped visibly wrong and were rejected on review.

## 1. Lock cuts and extract final edit audio

Do not finalize captions from the original media when the edit contains cuts.
Render a cut-only proxy first; `align-words.py` extracts mono 16kHz PCM from
whatever you hand it, so pass that proxy:

```bash
python3 scripts/align-words.py --audio cut-proxy.mp4 --transcript copy.txt
```

Alignment times belong to the timeline of the file you pass. Passing the
original media instead of the cut proxy produces times that are correct for a
video nobody will watch.

## 2. Verify the words, then align them

With a verified transcript, one command does everything:

```bash
python3 scripts/align-words.py --audio cut-audio.wav --transcript copy.txt
```

Without one, the same command drafts a transcript with `whisper-cli` first,
aligns that draft, and marks the result `transcriptVerified: false`. The timing
is real; the wording is a guess. Read it back against the audio, fix names,
brands, contractions and punctuation, and re-run with `--transcript`.
`build-caption-props.py` stops on an unverified draft, because a perfectly
timed wrong word is still a wrong word.

Numbers and letters spoken as words carry no alignable letters. Write them the
way they are said and keep the drawn form after a pipe:

```
Do it for about twelve|12 seconds
```

Backends:

- `mms_fa` (default) is `torchaudio.pipelines.MMS_FA` +
  `torchaudio.functional.forced_align`, running in the venv that
  `agent-bootstrap.sh` provisions. It times every word you give it.
- `whisperx` (`--backend whisperx`) transcribes and aligns in one pass through
  `uvx whisperx`, no install left behind. It leaves words it cannot align
  untimed, and the script fails rather than inventing their cadence.

Two traps behind the default backend, both already handled by the script and
both worth knowing when it breaks: torch and torchaudio must be a matched pair,
and a mismatch fails only at import; and torchaudio >= 2.11 routes
`torchaudio.load` through torchcodec, so the WAV is read with stdlib `wave` +
numpy instead. `align-words.py` re-execs itself under a python that has both,
so calling it with the system python3 is fine.

## 3. Read the alignment

`aligned-words.json` is an envelope, not a bare list:

```json
{
  "alignment": "forced-phoneme-or-ctc",
  "aligner": "mms_fa",
  "transcriptVerified": true,
  "words": [[5.26, 5.52, "marketing,", 0.91]]
}
```

The envelope is what `build-caption-props.py` and `check-caption-sync.py`
check. Numbers alone cannot show which question they answered, so a file that
does not name its aligner is refused rather than rendered.

Reject an alignment yourself when a low score clusters where the audio is
clear, when the mouth disagrees at a checkpoint, or when a phrase covers a
pause you can hear. Never infer cadence by evenly dividing a phrase.

## 4. Build readable caption phrases

`build-caption-props.py` groups words into cues and writes `render-props.json`.
It breaks where the speech breaks, at a sentence end, a comma or a pause over
0.6s, and caps a cue at 4 words. Phrase start is `firstWord.start - 0.08`,
phrase end is at most `lastWord.end + 0.18` and never overlaps the next cue.
Meaningful pauses stay empty.

Placement defaults to a band a little above the lower platform controls
(`--y`, `--x`, `--region-h`, `--region-w`). Override only after checking
subject and overlay collisions at representative frames.

The shape it writes:

```json
{
  "template": "caption-classic",
  "region": "caption-zone",
  "time": {},
  "props": {
    "preset": "classic",
    "grouping": { "mode": "explicit", "maxWords": 4 },
    "highlight": { "mode": "word", "duringGaps": "none", "badgeMarginX": 6 },
    "appearance": { "mode": "fade-up", "durationSec": 0.18, "distance": 18 },
    "track": {
      "timebase": "composition",
      "cues": [
        {
          "start": 1.17,
          "end": 2.44,
          "words": [
            { "text": "Hi,", "start": 1.25, "end": 1.49 },
            { "text": "my", "start": 1.51, "end": 1.61 },
            { "text": "name", "start": 1.63, "end": 1.75 },
            { "text": "is", "start": 1.77, "end": 1.83 },
            { "text": "Ricardo.", "start": 1.87, "end": 2.41, "marks": ["buzzword"] }
          ]
        }
      ]
    },
    "styles": {
      "buzzword": { "fontRole": "serif", "fontStyle": "italic" }
    }
  }
}
```

## 5. Map aligned words to other timed props

Pick the trigger word for each step and use its `start`. Make the overlay span
the whole video (`"time": {}`) so step times equal the transcript's absolute
times: no arithmetic. (If the overlay has its own `start`, subtract it.)

```json
{
  "template": "checklist-steps",
  "region": "lower-third",
  "time": {},
  "props": {
    "title": "What you can make",
    "steps": [
      { "text": "Social media clips", "at": "4.34s" },
      { "text": "Marketing videos", "at": "5.26s" },
      { "text": "Product demos", "at": "5.96s" }
    ]
  }
}
```

With timed steps the card slides in 0.6s before the first tick and leaves 1.5s
after the last one, so the overlay window can stay `{}`.

## 6. Check timing, including delivered audio

```bash
python3 scripts/check-caption-sync.py --audio cut-audio.wav \
    --props render-props.json --delivery delivery.mp4
```

It fails when the first word starts before the audio speaks, when a word spends
most of its length inside a detected silence, when words run backwards or leave
the clip, when a cue does not contain its own words or overlaps the next one,
and when delivered audio has moved more than 20ms from the audio the alignment
used. Exit status is 1 on any of those, so it can gate a render.

A word's release decays under the noise floor, so the last word of a phrase
legitimately reaches into the silence after it; the check looks at how much of
the word the silence holds rather than at raw overlap.

When the delivery offset check fails, shift delivery audio by the measured
amount and re-run. Positive delta means delivery audio is late and its leading
`delta` must be trimmed; negative means it needs matching delay. Never hardcode
one clip's offset.

Approval still needs your eyes at the opening phrase, one fast phrase, every
cut boundary, one meaningful pause and the final phrase. The script proves the
numbers agree with the waveform; it cannot tell you the words are right.
