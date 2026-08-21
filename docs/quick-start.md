# Quick start

From clone to rendered video in under five minutes. One repo, no extra
services. (The `overlay-motion` npm package is coming; today the repo is the
distribution.)

## 1. Install and explore

```bash
git clone <this-repo> && cd overlay-motion
npm install
npm run studio     # Remotion Studio: every template as a composition
```

Studio is the local gallery: every template is a composition you can scrub,
and the `custom` composition previews any spec you paste into its props.

The browsable version, with a live player and the exact JSON spec beside each
template, is at [overlaymotion.com/templates](https://overlaymotion.com/templates).
Every template page has a copy-spec button.

## 2. Write a spec

An edit is one JSON document. Start from any template's "copy spec" button,
or from scratch:

```json
{
  "version": 1,
  "format": "vertical",
  "fps": 30,
  "durationSec": 8,
  "source": { "type": "none" },
  "overlays": [
    {
      "template": "hero-title",
      "region": "center",
      "time": { "start": "0.5s", "appear": 1, "hold": 6 },
      "props": { "title": "Ship it", "subtitle": "The overlay system for agents" }
    }
  ]
}
```

For an agent editing real footage, start with the [Editing agent
playbook](agent-playbook.md): analyze the source, preserve protected subjects,
record assumptions and validate inexpensive checkpoints. The full rendering
grammar is [Edit Spec v1](edit-spec.md).

Run the agent on the strongest model you have access to, at its highest
reasoning setting. Weaker or low-effort models miss protected subjects and
mis-time overlays. Model names are left out on purpose: they turn over faster
than this document does.

## 3. Preview it

Open Remotion Studio (`npm run studio`): every template is a composition,
and the `custom` composition previews any spec you paste into its
`defaultProps`.

## 4. Render it

Every template is a composition in `remotion/index.ts`; the `custom`
composition renders whatever spec you pass:

```bash
npx remotion render remotion/index.ts hero-title out/hero.mp4
npx remotion render remotion/index.ts custom out/edit.mp4 \
  --props='{"spec": <your-spec>, "theme": <your-theme>}'
```

`--props` accepts a file path too: `--props=./my-edit.json`.

Rendering uses Remotion, which is free for individuals and companies of up
to 3 people; larger companies need a [Remotion Company
License](https://www.remotion.pro/license). See the current [Remotion
license](https://www.remotion.dev/license) for details.

## 5. Brand it

Pass any `BrandTheme` as `theme`: colors, fonts, radius, and glass/solid
surface. Same spec, another theme, rebranded video. Presets live in
`src/theme/themes.tsx`; the site's theme picker shows them all.

## Help shape OverlayMotion

OverlayMotion launched in August 2026, so this is still an early stage
project. Help us develop it: join the
[Discord](https://discord.gg/DgRTAQ3Ne) and tell us what you need. We can
work on your project with you and turn it into more real world templates
everyone gets to use.
