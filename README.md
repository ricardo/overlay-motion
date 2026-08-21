# OverlayMotion

🎬 Video templates that wear your brand. You describe the edit, your coding
agent does it, and a finished video comes out the other side.

- 🌐 [overlaymotion.com](https://overlaymotion.com)
- 🎨 [Template gallery](https://overlaymotion.com/templates)
- 🚀 [Quick start](https://overlaymotion.com/quick-start)
- 📖 [Docs](https://overlaymotion.com/docs)

Built on [Remotion](https://www.remotion.dev).

## The idea

**Ask Claude Code, Codex or any coding agent to edit your videos.**

Point it at this repo and say what you want in a sentence:

> Use https://github.com/ricardo/overlay-motion
>
> Add subtitles to "video.mov"

That is the whole interface. The agent reads the contract in this repo, picks
the template, times the words against the real audio, and renders the file. You
never open an editor and you never write motion code.

Ask for more and it keeps working the same way:

> Put my logo in the corner for the first three seconds.

> Add a countdown before the intro, then a lower third with my name.

> Same video, but in my brand colors and square for Instagram.

## 📦 What is in the box

- 🎨 **28 templates**, all free: captions, lower thirds, countdowns, chat
  bubbles, charts, quote and tweet cards, audiograms, b-roll frames, steps,
  tickers, stickers and more. Every one is animated in the
  [gallery](https://overlaymotion.com/templates).
- 🖌️ **Your brand, not ours.** Templates read design tokens and nothing else,
  so the same template renders in any identity.
- 🎯 **Subtitles that land on the word.** Timed by forced alignment against the
  audio, never by a transcriber's guess.
- 🔊 **Sound and camera.** Cues fire when things appear, a music bed sits under
  the speech at a level validation enforces, and push-ins, pull-outs and pans
  work on the footage, one overlay, or the whole composition.

## What you need

Node 20.19 or newer, git, and ffmpeg. Subtitles also need Python and a forced
aligner.

You do not have to check any of that yourself. The repo ships a report that
says what is ready and what is missing before a render can fail halfway
through, and your agent runs it first. The
[quick start](https://overlaymotion.com/quick-start) walks through the first
render.

## Docs

| Page | What it answers |
| --- | --- |
| [Quick start](docs/quick-start.md) | Clone to rendered file |
| [Edit Spec v1](docs/edit-spec.md) | The grammar: regions, time, source contracts, motion, themes |
| [Camera motion](docs/camera-motion-spec.md) | Push-ins, pull-outs, pans, and what validation rejects |
| [Agent playbook](docs/agent-playbook.md) | The editorial contract, and which page a request needs |
| [AI instructions](docs/ai-instructions.md) | How a request becomes an edit |
| [Agent toolkit](docs/agent-toolkit.md) | Capability contracts for external tools |
| [Features](docs/features/) | One page per job: captions, background removal, tracking, voice cleanup, music, sound, delivery color |

## For AI agents

[AGENTS.md](AGENTS.md) is the entry point, and it is short on purpose. It
routes rather than carries: a caption job never has to read the
background-removal page. The rules that are not negotiable live there too, the
sharpest being that captions are timed by forced alignment or not shipped.

## License

Source-available under the
[OverlayMotion Sustainable Use License](LICENSE). The short version, with
[LICENSE](LICENSE) as the text that actually governs:

- ✅ **Your videos are yours.** Outputs sit outside the license entirely.
  Publish them, sell them, deliver them to clients, no royalty. Rendering
  videos for sale counts as internal business use, so paid client work is fine.
- ✅ **Use and modify it** for your own internal business, personal or
  non-commercial purposes.
- ⚠️ **Redistribute it** only free of charge, only non-commercially, and only
  with the license text attached.
- ❌ **You may not** sell it or charge for access, ship it inside a template
  pack, starter kit or component library, or run it as a hosted service whose
  main value is access to the library itself rather than the videos it makes.

Anything outside that, including a commercial license, needs an agreement:
[overlaymotion.com/pro](https://overlaymotion.com/pro), or open an issue.

Built on Remotion and not affiliated with it. Remotion carries its own license,
free for individuals and companies up to three people, with a Company License
beyond that. Check [remotion.dev/license](https://www.remotion.dev/license)
against your own situation before shipping.
