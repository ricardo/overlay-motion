# Music beds

Read this when the request asks for music. Music is never added to fill silence
and is not part of any default edit.

When it is requested it goes in `spec.music`, and the whole job is the gain.

```json
{ "music": { "src": "/music/bed.wav", "volume": 0.03, "fadeInSec": 1, "fadeOutSec": 1.5 } }
```

`music` is the bed under the whole composition, and it is neither a `source` nor a
cue: the source is whatever audio carries meaning, cues belong to the moments that
fire them, and this is the layer under both. It sits outside every camera, so
nothing that reframes the picture reframes the music.

## The bed is much quieter than the voice, and "much" is a number

Target the bed 15 to 20 LU below the speech, which is where a listener hears it
without having to work past it to follow the words. Nothing about that is a taste
call.

The reason this is a rule and not a preference is that the intuitive default is
wrong. A commercial music master sits near -14 LUFS. Recorded speech from a normal
setup usually sits well below that. So `volume: 1` does not mean "balanced", it
means the track is louder than the person talking, often by more than 10 LU.
`MUSIC_BED_DEFAULT_VOLUME` is 0.08 for that reason, and `validateSpec` rejects
anything above `MUSIC_BED_MAX_VOLUME_UNDER_SPEECH` (0.3) while the source audio is
unmuted, naming the field.

Measure, then compute. Never set the gain by ear in a preview, because the only
thing a preview proves is where your system volume happens to be:

```bash
ffmpeg -hide_banner -nostats -i cut-audio.wav -af ebur128 -f null - 2>&1 | grep -A 2 "Integrated"
ffmpeg -hide_banner -nostats -i bed.wav        -af ebur128 -f null - 2>&1 | grep -A 2 "Integrated"
```

Then `gainDb = (speechLufs - targetSeparationLu) - musicLufs`, and
`volume = 10 ** (gainDb / 20)`. Worked example: speech -27.3 LUFS, bed -14.3 LUFS,
target 18 LU of separation. `gainDb = (-27.3 - 18) - (-14.3) = -31`, so
`volume: 0.03`. At unity that same bed would have been 13 LU LOUDER than the
speaker.

Record both measurements and the arithmetic in the decision plan. A gain with no
measurement behind it is a guess, and it is the guess that ships as the version
nobody can listen to.

**15 to 20 LU is where you start, not where you stop.** Measure to get into that
range, then let the person whose video it is hear it, and set the delivered number
from their answer. Field note: an edit whose bed landed at -46.2 LUFS against
-27.3 LUFS speech, 18.9 LU of separation and textbook by every rule above, came
back as "the volume is too low." It shipped at 11.6 LU. Report the measured
separation in the completion report so the judgement has a number attached to it,
and never argue a reviewer out of their own ears with this table.

## The other fields

- **Fade, never cut.** `fadeInSec` (1) and `fadeOutSec` (1.5) are
  composition-relative, because a bed is usually longer than the edit and its own
  tail is nowhere near the last frame. A bed that starts on frame 0 at full gain
  reads as a mistake even when the level is right.
- **Loop deliberately.** `loop` is off by default. A bed shorter than the edit goes
  silent partway through unless you ask for the loop, and a loop point in the
  middle of a phrase is audible; prefer a bed longer than the composition.
- `trimStartSec` skips the head of the track.

Ducking is not expressed in Edit Spec v1. If the copy genuinely needs the bed to
step back under each sentence, that is a preprocessing job on the bed itself,
recorded in the plan like any other proxy.
