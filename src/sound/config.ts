import { z } from "zod/v3";

/**
 * Sound config: how UI sound cues resolve to actual audio.
 * Lives in the edit spec (root default + per-overlay override), never in
 * template code, so the buyer configures sound the same way they configure
 * region and time.
 */

export const SFX_NAMES = [
  "pop",
  "bubble",
  "tick",
  "ding",
  "whoosh",
  "keyboard-typing-natural",
  "mouse-click-press",
  "mouse-click-release",
  "typewriter-scissor-metallic-low",
  "typewriter-scissor-metallic-bass",
  "typewriter-scissor-metallic-sub",
  "typewriter-scissor-metallic",
  "typewriter-scissor-low",
  "typewriter-scissor-deep",
  "typewriter-laptop",
  "typewriter-chiclet",
  "typewriter-scissor",
  "typewriter",
  "typewriter-soft",
  "typewriter-mechanical",
  "typewriter-digital",
  "typewriter-heavy",
  "typewriter-thock",
  "typewriter-steel",
  "typewriter-slam",
  "typewriter-button",
  "typewriter-switch",
  "typewriter-keycap",
  "click",
  "click-crisp",
  "click-round",
  "click-glass",
  "toggle",
  "success",
  "error",
  "notification",
  "sparkle",
  "swoop",
  "riser",
  "impact",
  "glitch",
  "shutter",
  "swipe",
  "drop",
  "display",
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

/**
 * The curated core palette, the sound half of the canonical motion language.
 * Every name above stays available, but agents and docs should reach for
 * these five first so mixed templates still sound like one design system:
 * click ("click"), pop ("pop"), whoosh ("whoosh"), chime ("ding") and key
 * press ("typewriter").
 */
export const CORE_SFX: readonly SfxName[] = [
  "click",
  "pop",
  "whoosh",
  "ding",
  "typewriter",
] as const;

const SFX_NAME_SET: ReadonlySet<string> = new Set(SFX_NAMES);
export const isSfxName = (value: string): value is SfxName => SFX_NAME_SET.has(value);

/**
 * Cues a template ships from the bundled CC0 library (`docs/sfx-library.md`),
 * as NAME to file. Named rather than inlined in each template because a name
 * is what a spec can remap (`sounds: { "quote-word": "ding" }`) and what a
 * prop default can carry; a raw path is neither, and duplicating it across
 * templates means the next audition has to be won four times.
 */
export const LIBRARY_CUES: Record<string, string> = {
  /** Word-reveal tick: short and neutral, fires once per revealed word. */
  "quote-word": "/sfx/library/kenney-tick-001.ogg",
  /** Same click, quieter, as each blurred word settles into focus. */
  "word-settle": "/sfx/library/kenney-tick-001.ogg",
  /** Typing-dots blip before a chat bubble lands. */
  "chat-typing": "/sfx/library/kenney-uiaudio-rollover2.ogg",
  /** Non-check list markers: a step lands without claiming it is done. */
  "list-step": "/sfx/library/kenney-tick-001.ogg",
};

/**
 * A template's own sound cue, as a template prop.
 *
 * Never a boolean: `false` is silence and EVERY other value NAMES the sound,
 * so swapping a cue is the same gesture as turning it off. A premade name from
 * `SFX_NAMES` plays that cue (and stays remappable through `sound.sounds`), a
 * `LIBRARY_CUES` name plays the bundled CC0 file behind it, and any other
 * string is an audio source (public path, URL, data/blob/file URL), so a
 * caller ships their own file without touching the pack or the spec.
 *
 * `true` is rejected on purpose. A boolean can only say "the sound the
 * template picked", which is exactly the choice that belongs to the caller.
 *
 * Naming convention across templates: the single cue is `sfx`; a template with
 * several distinct sounds names each one (`tickSfx`, `typingSfx`, `exitSfx`).
 */
export const templateSfx = z.union(
  [z.literal(false), z.enum(SFX_NAMES), z.string().min(1)],
  {
    // A union's default "Invalid input" is useless to whoever just typed
    // `true` out of habit, and that is the exact migration this type causes.
    errorMap: () => ({
      message:
        'Sound props name a cue: false to silence it, a premade name like "ding", or a path/URL to your own audio file. `true` is not a sound.',
    }),
  },
);
export type TemplateSfx = z.infer<typeof templateSfx>;

/** `<Sfx>` inputs for a `templateSfx` value; `null` means the caller silenced it. */
export const resolveTemplateSfx = (
  value: TemplateSfx,
): { cue: string; src?: string } | null => {
  if (value === false) return null;
  if (isSfxName(value)) return { cue: value };
  // A library cue keeps its NAME as the cue and gains the bundled file as its
  // source; a caller's own path travels as BOTH, since `Sfx` keys the
  // `sound.sounds` lookup on the cue and the path must stay remappable too.
  return { cue: value, src: LIBRARY_CUES[value] ?? value };
};

export const soundConfig = z.object({
  /** Master switch for every cue in scope. */
  enabled: z.boolean().default(true),
  /** Master gain, multiplied with each cue's own volume. */
  volume: z.number().min(0).max(2).default(1),
  /**
   * Per-cue remap: cue name to a premade sound name ("pop" plays "ding"),
   * any audio source string (public path, URL, data/blob/file URL), or `false`.
   * File extensions are deliberately unrestricted; browser/Remotion codec
   * support decides whether wav, mp3, ogg, m4a, aac, and other media can play.
   */
  sounds: z.record(z.union([z.string(), z.literal(false)])).default({}),
});
export type SoundConfig = z.infer<typeof soundConfig>;

export const DEFAULT_SOUND: SoundConfig = { enabled: true, volume: 1, sounds: {} };

/** Later layers win; `sounds` maps merge key by key. */
export const mergeSound = (
  ...layers: (Partial<SoundConfig> | undefined)[]
): SoundConfig => {
  const out: SoundConfig = { ...DEFAULT_SOUND, sounds: {} };
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.enabled !== undefined) out.enabled = layer.enabled;
    if (layer.volume !== undefined) out.volume = layer.volume;
    if (layer.sounds) out.sounds = { ...out.sounds, ...layer.sounds };
  }
  return out;
};
