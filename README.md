# OverlayMotion

Video templates that wear the customer's brand. One JSON document in, a rendered
branded video out. Built on [Remotion](https://www.remotion.dev).

**[overlaymotion.com](https://overlaymotion.com)** &middot;
[Template gallery](https://overlaymotion.com/templates) &middot;
[Examples](https://overlaymotion.com/examples) &middot;
[Docs](https://overlaymotion.com/docs)

28 templates, a validated edit-spec grammar, word-timed captions, camera motion
and a sound engine. Nobody writes motion code: you send a brand theme and an
edit spec, and the library owns everything between them.

## The idea

A customer, or the AI agent working for them, sends two things.

**A brand theme.** Design tokens: colors, fonts, radius, logo. Templates read
tokens and nothing else, so the same template renders in any identity.

**An edit spec.** A small JSON saying which template, where, and when. `region`
is space and `time` is timeline, so "at two thirds of the video, at the bottom,
for three seconds" has exactly one meaning:

```json
{
  "version": 1,
  "format": "vertical",
  "fps": 30,
  "durationSec": 18,
  "source": { "type": "video", "src": "intro.mp4" },
  "overlays": [
    {
      "template": "news-highlight",
      "region": "lower-third",
      "time": { "start": "66%", "duration": "3s" },
      "props": { "kicker": "Breaking", "headline": "Q3 revenue doubled" }
    }
  ]
}
```

`SpecRenderer` compiles spec and theme into a Remotion composition. The same
component drives the website player, Remotion Studio and headless renders, so a
preview and a final file cannot disagree.

## Install

Node 20.19+, git, and `ffmpeg` / `ffprobe` on PATH. Python 3.10+ and a forced
aligner are needed for subtitles only.

```bash
git clone https://github.com/ricardo/overlay-motion.git
cd overlay-motion
npm install
bash scripts/agent-bootstrap.sh   # report only: what is ready, what is missing
```

`agent-bootstrap.sh` downloads nothing until you ask it to. Run it first and it
tells you what is missing instead of letting a render discover it halfway
through. Add `--need captions` to install the caption aligner.

## Run

```bash
npm run demo-audio                  # generate the demo audio track (once)
npm run sfx                         # generate the premade UI sound pack (once)
npm run studio                      # Remotion Studio, one composition per template
npm run render <template> out.mp4   # render one, or `custom` with --props
npm test                            # spec, camera, caption and template tests
npm run typecheck
```

[docs/quick-start.md](docs/quick-start.md) goes from clone to rendered file.

## Templates

All 28 are free and source-available: audiogram, b-roll, bar-chart,
before-after, blur-focus-text, bullet-steps, caption-classic, chat-bubbles,
checklist-steps, countdown, face-bubble, hero-title, like-subscribe,
like-subscribe-bell, line-chart, logo-sting, news-highlight, numbered-steps,
prompt-box, quote-card, recording-frame, speaker-card, stat-counter, sticker,
ticker-tape, tweet-card, video-card, world-globe.

Each one is animated in the [gallery](https://overlaymotion.com/templates).

Template contract: read `useBrand()` tokens only, own your motion, declare your
inputs in the manifest. `src/templates/registry.ts` lists every template with
its source contract, preferred regions and props schema.

## Docs

| Page | What it answers |
| --- | --- |
| [Quick start](docs/quick-start.md) | Clone to rendered file |
| [Edit Spec v1](docs/edit-spec.md) | The grammar: regions, time, source contracts, motion, themes |
| [Camera motion](docs/camera-motion-spec.md) | Push-ins, pull-outs, pans, and what validation rejects |
| [Agent playbook](docs/agent-playbook.md) | The editorial contract, and which page a request needs |
| [AI instructions](docs/ai-instructions.md) | How a request becomes a spec |
| [Agent toolkit](docs/agent-toolkit.md) | Capability contracts for external tools |
| `docs/features/` | One page per job: captions, background removal, tracking, voice cleanup, music, sound, delivery color |

## For AI agents

[AGENTS.md](AGENTS.md) is the entry point, and it is short on purpose. It
routes: a caption job never has to read the background-removal page. The rules
that are not negotiable live there too, the sharpest being that captions are
timed by forced alignment or not shipped at all.

## Layout

```
src/spec/        edit-spec types (zod), time parsing, region boxes
src/theme/       BrandTheme contract, preset brands, context
src/player/      SpecRenderer, DemoFootage, motion and scale helpers
src/templates/   28 templates: components, zod schemas, manifests
src/sound/       cue resolution and the SFX engine
src/agent/       the machine-readable agent contract
remotion/        Studio and CLI entry point
scripts/         bootstrap, caption alignment, asset generators
```

## Updates

```bash
npm run om:check
```

Compares this checkout against the latest release. A patch or minor applies
itself, a major stops and asks. It refuses to touch the repo while there are
uncommitted or unpushed changes, so it cannot swallow work in progress.

## License

Source-available under the
[OverlayMotion Sustainable Use License](LICENSE). The short version, with
[LICENSE](LICENSE) as the text that actually governs:

- **Your videos are yours.** Outputs are outside the license entirely. Publish
  them, sell them, deliver them to clients, no royalty. Rendering videos for
  sale counts as internal business use, so paid client work is fine.
- **Use and modify it** for your own internal business, personal or
  non-commercial purposes.
- **Redistribute it** only free of charge, only non-commercially, and only with
  the license text attached.
- **You may not** sell it or charge for access, ship it inside a template pack,
  starter kit or component library, or run it as a hosted service whose main
  value to the customer is access to the library itself rather than the videos
  it produces.

Anything outside that, including a commercial license, needs an agreement:
[overlaymotion.com/pro](https://overlaymotion.com/pro), or open an issue.

Built on Remotion and not affiliated with it. Remotion carries its own license,
free for individuals and companies up to three people, with a Company License
beyond that. Check [remotion.dev/license](https://www.remotion.dev/license)
against your own situation before shipping.
