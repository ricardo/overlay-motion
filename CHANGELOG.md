# Changelog

Every release is a git tag plus a GitHub release. `npm run om:check` reads that
feed, so this file and the release notes are the same story told twice: here
for humans reading the repo, there for the updater.

## How releases behave

- **Patch and minor** apply themselves. An agent running `om:check` pulls them
  without asking.
- **Major** stops and asks the user first.
- A release can force the ask regardless of its number by putting `om:breaking`
  in the release body. That exists because 0.x semver allows a minor to break,
  and the numbers alone would not warn anyone.

Anything that changes the edit spec grammar, renames a template, or removes a
prop is breaking, whatever the version number says.

## Unreleased

Nothing yet.

## 0.7.0

First public release. The version jumps from the private beta's 0.1.0 on
purpose: the library spent six iterations behind a closed repo and the number
should say so rather than present mature work as a first draft.

Everything below is what changed since that beta. A reader arriving fresh does
not need it; it is here because the reasoning is worth more than the summary.

### Added
- **The intake gate.** `scripts/check-intake.py` probes the source, reads the
  request against the assets actually supplied, and returns findings as
  `blocking`, `ask`, `checkpoint` or `default`. Three things block, because the
  missing piece cannot be invented: captions asked of a source with no speech, a
  real logo with no asset, named b-roll with no media or license. Contract in
  `INTAKE` (`src/agent/policy.ts`).
- **The contract routes instead of carrying.** `docs/agent-playbook.md` is the
  part that applies to every edit plus a table naming which page answers which
  request; captions, background removal, tracking, voice cleanup, music, sound
  and delivery color are one page each under `docs/features/`, opened only when
  a request names them. The always-read path went from 11,375 words to 4,935,
  and a caption job no longer pays for the matting page. `AGENT_GUIDE` is now
  generated from the playbook (`npm run agent:guide`) instead of being a second
  hand-written copy that drifted from it.
- `validateEditDecisionPlan` now enforces the round it always described: a
  blocking clarification that is not `answered` fails, an `answered` one names
  an option that exists, and more than three open questions fails. `blocking`
  had been a field the plan carried and nothing read.
- `npm run om:check`: version check and self-update for agents. Cached for 12
  hours so it is free to repeat, refuses to touch a dirty or unpushed
  checkout, and never applies a major on its own.
- `AGENTS.md` as the single entry point for any agent, with `CLAUDE.md`
  pointing at it so per-tool instructions cannot drift apart.
- `exports` map in `package.json`: the engine's public API, so consumers import
  by package name instead of reaching into `src/`.
- `scripts/align-words.py`: forced alignment as one command. Prepares the
  audio, drafts a transcript when none is given, aligns with torchaudio MMS_FA
  or WhisperX, and writes an envelope that names the aligner it used.
- `scripts/check-caption-sync.py`: fails a render when the first word starts
  before the audio speaks, a word sits inside a silence, cues overlap, or
  delivered audio drifted more than 20ms from the aligned proxy.

### Changed
- **Captions have one route.** Timing comes from forced alignment, never from a
  transcriber. `build-caption-props.py` and `check-caption-sync.py` reject an
  `aligned-words.json` that does not name a forced aligner, and reject copy no
  human has verified. Whisper's own timestamps had shipped visibly wrong
  captions; prose forbidding it was not enough while the tooling made it the
  easiest path.
- `agent-bootstrap.sh --need captions` installs the aligner, not only a
  transcriber, and reports `CAPTIONS BLOCKED` until one is present. It used to
  fetch a whisper model and call captions ready.
- `agent-bootstrap.sh` checks **node and git**, with node's 20.19 floor. It
  verified ffmpeg, whisper and torch but never the two things nothing here works
  around, while `AGENTS.md` told the agent to report them from its output.
- `om:check` tells a missing git apart from a directory that is not a checkout.
  Both used to arrive as "this checkout is not on a branch", which is advice for
  a problem the reader does not have: `git()` turns every failure into an empty
  string, and an empty `symbolic-ref` reads as detached. `TreeState.git` is now
  `ok | missing | not-a-checkout` and each says what to do.
- The `om:check` mirror moved from `overlaymotion.com/api/version.json`, which
  never existed, to `overlaymotion.com/version.json`, which the site generates
  from the release feed at build time. `/api` is exact-match php-fpm routes on
  the box, so a file there needs an nginx edit to be reachable, and a mirror
  that needs a server change to exist is one that quietly stops existing.
- `face-bubble` cuts straight to the bubble. `enterSec` now defaults to `0` and
  accepts `0`, where the old floor of `0.1` made a cut inexpressible and every
  bubble opened with a collapse from full frame. Set `enterSec: 0.8` for the
  old behavior, which is worth it only when handing over from a full-frame shot
  mid-take.
- The website moved to its own repo. This repo is the engine: templates, edit
  spec, player, themes, sound, docs and the agent contract.
- The camera page documented keyframes, rotation and `crop` as authorable
  schema. None of them exist, so a spec written from that page fails
  validation. They are gone from the docs, and `rest`, `inSec` and `outSec`,
  which do exist and lived only inside a code comment, are documented.
- Every Remotion package is pinned to one exact version. Remotion refuses to
  run when a tree holds two, and `@remotion/media-utils` had floated apart.
- `docs/quick-start.md` no longer points at a local site this repo does not
  serve.

### Removed
- The `focus-ring` template. A spec naming it no longer validates, so this is
  breaking for anyone who wrote one. The welded ring itself is not gone: it
  lives in `src/player/weld.tsx` and `prompt-box` still draws it. Library count
  is 28.
- The stdio agent server (`mcp/`, its three npm scripts and the SDK
  dependency). It is out of scope for the August launch: an agent already reads
  the contract, the docs and the template registry straight from the checkout,
  and the website was advertising an install command for a package that was
  never published. It comes back when there is something to gate behind a
  license key.
- `public/projects` is not tracked. It held 524M of field-test footage that a
  clone used to hand over.

## Before 0.7.0

The library was built in a private repository and reached a 0.1.0 beta there:
26 templates, the v1 edit spec, camera and object motion, word-timed captions,
brand themes and the sound engine. That history is not part of this repository,
and no release before 0.7.0 was ever installable.
