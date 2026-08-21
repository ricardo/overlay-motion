# Sound cues

Read this when an overlay should make a sound, or when a request asks to change,
swap or silence one. For the bed under the whole edit, see [music.md](music.md).

`sound` at the spec root sets defaults; each overlay may override with its own
`sound` block. Cues resolve to built-in names, arbitrary audio paths, or `false`
to silence one cue. Cues default on. The curated core palette, which is what to
reach for first: `click`, `pop`, `whoosh`, `ding`, `typewriter` (`CORE_SFX` in
`src/sound/config.ts`).

## Two scopes, and picking the wrong one is the usual mistake

- **A template's own cue is a prop**, and every template that makes a sound has
  one. It is never a boolean: `false` is silence, a premade name swaps the cue
  (`"sfx": "ding"`), and any path or URL plays your own file
  (`"sfx": "/sfx/library/my-stamp.wav"`). Omit it and the template's default cue
  plays. `true` is rejected on purpose, because a boolean can only mean "whatever
  the template picked", which is the one choice that belongs to the caller.

  Naming is uniform: one sound is `sfx`, and a template with several names each
  one (`tickSfx` and `endSfx` on countdown, `typingSfx` on tweet-card and
  chat-bubbles, `exitSfx` on speaker-card, `checkSfx` and `stepSfx` on the step
  lists). Each template's page and its props schema list the ones it has.

- **`sound.sounds` remaps BY CUE NAME**, for everything in scope: `{ "pop":
  "ding" }` on an overlay changes every `pop` that overlay fires, including the one
  `exit: "vanish"` plays. Reach for it when you are restyling a whole edit, and for
  the template's own sound reach for the prop.

```json
{ "template": "sticker", "props": { "src": "logo.png", "sfx": "ding" } }
{ "template": "sticker", "props": { "src": "logo.png", "sfx": false } }
{ "template": "countdown", "props": { "from": 3, "tickSfx": "click", "endSfx": false } }
{ "template": "sticker", "sound": { "sounds": { "pop": "/sfx/custom.wav" } },
  "props": { "src": "logo.png" } }
```

## Library cues

Some defaults are **library cues**: a name whose sound is a bundled CC0 file
rather than a pack entry (`quote-word` and `word-settle`, the word-reveal clicks;
`chat-typing`, the typing-dots blip; `list-step`, the non-check list marker). They
behave like any other cue: swap them with a prop, or remap them by name in
`sound.sounds`. `LIBRARY_CUES` is in `src/sound/config.ts`, provenance in
[sfx-library.md](../sfx-library.md).

## Every premade cue

`keyboard-typing-natural`, `mouse-click-press`, `mouse-click-release`,
`typewriter-scissor-metallic-low`, `typewriter-scissor-metallic-bass`,
`typewriter-scissor-metallic-sub`, `typewriter-scissor-metallic`,
`typewriter-scissor-low`, `typewriter-scissor-deep`, `typewriter-laptop`,
`typewriter-chiclet`, `typewriter-scissor`, `click`, `toggle`, `tick`,
`typewriter`, `typewriter-soft`, `typewriter-mechanical`, `typewriter-digital`,
`typewriter-heavy`, `typewriter-thock`, `typewriter-steel`, `typewriter-slam`,
`typewriter-button`, `typewriter-switch`, `typewriter-keycap`, `click-crisp`,
`click-round`, `click-glass`, `pop`, `display`, `bubble`, `ding`, `sparkle`,
`notification`, `whoosh`, `swoop`, `swipe`, `riser`, `glitch`, `success`,
`error`, `impact`, `shutter`, `drop`.

`type` is a compatibility alias for `typewriter`.

The premade pack is synthesized in-house and license-free; regenerate it with
`npm run sfx`. `keyboard-typing-natural`, `mouse-click-press` and
`mouse-click-release` are CC0 recordings with source metadata beside each WAV.

For a complete physical click use `<MouseClickSfx at={frame} />`: it plays
`mouse-click-press`, then `mouse-click-release` after a 67 ms hold.

## Two rules templates already follow

Chat Bubbles deliberately avoids looping keyboard audio: the typing-dot onset
uses `bubble` and message arrival uses a short `pop`. The longer `notification`
chime confirms Like + Subscribe's subscribed state and the bell variant's
enabled state.

Player previews preserve cues across pause/resume and mute/unmute. Active cues
stop while playback is paused, then continue from their timeline-relative
source offset; audio queued from a previous playback state is discarded.

Avoid decorative sound under important speech.
