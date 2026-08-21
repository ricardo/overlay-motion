# Working in this repo as an agent

OverlayMotion turns one JSON document into a branded, rendered video. You write
the spec; the library owns the motion.

## Once per session

```bash
npm run om:check
```

It compares this checkout against the latest release. A patch or minor release
applies itself; a major, or anything flagged breaking, stops and tells you to ask
the user. It refuses to touch the repo when there are uncommitted or unpushed
changes, so it can never swallow work in progress. The result is cached for 12
hours, so calling it again costs nothing. Do not build your own version check on
top of it, and do not skip it because the last session ran one.

The final line is written for you to parse:

```
om:check result=<up-to-date|apply|ask|blocked|unavailable> kind=<none|patch|minor|major> local=<v> latest=<v>
```

`unavailable` means the release feed did not answer. That is not an error and not
a reason to stop working.

## Before the first edit

```bash
bash scripts/agent-bootstrap.sh                                  # what this machine has
python3 scripts/check-intake.py --source <video> --request "<the ask>"
```

The first is report-only: it downloads nothing and prints what is ready and what
is not. Node 20.19+, git, ffmpeg and ffprobe are required; Python 3.10+ and a
forced aligner are required only for subtitles. Tell the user what is missing in
one line, with the command that fixes it. Do not start work you cannot finish.

The second probes the source and reads the request against it. `blocking` stops
the edit, `ask` is worth the user's attention, `checkpoint` is something to show
instead of asking, `default` is a choice to make and record. Exit status is 2 when
anything blocks. Ask at most three questions, in one round, each with a default
already chosen so silence means proceed, and record every one in the plan's
`clarifications`.

## What to read

- [docs/agent-playbook.md](docs/agent-playbook.md) is the contract, and it carries
  a table saying which page to open for the job in front of you. Read it before
  editing real footage.
- [docs/edit-spec.md](docs/edit-spec.md) is the grammar: regions, time, source
  contracts, motion, themes.
- `docs/features/` is one page per job (captions, background removal, tracking,
  voice cleanup, music, sound). Open the one the request names; a caption job has
  no reason to read the matting page.
- [docs/quick-start.md](docs/quick-start.md) is clone to rendered file.
- `src/templates/registry.ts` is the template list, with each one's source
  contract, preferred regions and props schema.

## Rules that are not negotiable

- Validate the spec before rendering. `parseSpec` is the same gate the renderer
  uses; a spec that fails it is not "almost right".
- **Never time captions from a transcriber.** Forced alignment or no captions.
  Whisper drafts the words, `scripts/align-words.py` decides when each one is
  said, and the two downstream caption scripts refuse anything else. If the
  aligner will not run, the fix is
  `bash scripts/agent-bootstrap.sh --need captions`, not a fallback. Subtitles
  that drift are the most visible way this product fails.
  [docs/features/captions.md](docs/features/captions.md).
- **A music bed is always much quieter than the voice.** Measure both with
  `ffmpeg -i <file> -af ebur128 -f null -` and set `music.volume` so the bed lands
  15 to 20 LU under the speech. Do not reach for 1.0: a commercial music master is
  typically LOUDER than recorded speech, so unity gain puts the track on top of
  the speaker. Validation rejects a bed above 0.3 under unmuted source audio.
  [docs/features/music.md](docs/features/music.md).
- Never invent a fact, a quote, an attribution, a logo, or asset rights.
- Preserve the source's perceived color and audio unless the user asked for a
  change.
- Preview before a full render. Rendering is the expensive way to discover a
  mistake you could have seen in a frame.
- Ask one concise question when a required input is missing or when two or three
  valid choices would change the result materially. Otherwise choose the safest
  reversible default and say what you chose.
