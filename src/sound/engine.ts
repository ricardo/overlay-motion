/**
 * Web Audio engine for UI sound cues in the Player (preview) environment.
 *
 * Why not remotion <Audio> in the preview: cues route through the Player's
 * shared AudioContext, and the Player auto-mutes itself permanently when that
 * context takes >1s to resume (RESUME_WAIT_TIMEOUT in use-playback). Real
 * audio hardware (CoreAudio waking up, Bluetooth) regularly misses that
 * deadline, so sfx died after a few loops. Decoded AudioBuffers played on our
 * own context have no media elements, no tag pool and no player coupling.
 * Rendering still uses declarative <Audio> (see Sfx.tsx).
 */

type EngineState = {
  ctx: AudioContext | null;
  buffers: Map<string, AudioBuffer>;
  pending: Map<string, Promise<AudioBuffer | null>>;
  lastPlay: Map<string, number>;
  activeSources: Map<AudioBufferSourceNode, { preview: boolean }>;
  muted: boolean;
  playerPlaying: boolean;
  playerVolume: number;
  /** Invalidates async starts queued before pause/mute and scopes deduping. */
  playbackGeneration: number;
  /** Player whose timeline cues may currently use the shared Web Audio engine. */
  activeScope: string | null;
};

const state: EngineState = {
  ctx: null,
  buffers: new Map(),
  pending: new Map(),
  lastPlay: new Map(),
  activeSources: new Map(),
  muted: false,
  playerPlaying: false,
  playerVolume: 1,
  playbackGeneration: 0,
  activeScope: null,
};

type PlaybackListener = (playing: boolean, scope: string | null) => void;
const playbackListeners = new Set<PlaybackListener>();

/** Lets active timeline cues restore their remaining audio after pause/mute. */
export const subscribeSfxPlayback = (listener: PlaybackListener) => {
  playbackListeners.add(listener);
  return () => {
    playbackListeners.delete(listener);
  };
};

const notifyPlayback = (playing: boolean) => {
  for (const listener of playbackListeners) listener(playing, state.activeScope);
};

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  if (!state.ctx) {
    state.ctx = new AudioContext({ latencyHint: "interactive" });
    // Any user gesture resumes the context; keep listening so we also recover
    // if the browser suspends it again later.
    document.addEventListener(
      "pointerdown",
      () => {
        if (state.ctx && state.ctx.state !== "running") void state.ctx.resume();
      },
      { capture: true }
    );
  }
  return state.ctx;
};

/** Stops timeline-owned cues without interrupting sound-showcase previews. */
export const stopPlayerSfx = (scope: string | null = null) => {
  if (scope !== null && scope !== state.activeScope) return;
  for (const [source, active] of state.activeSources) {
    if (active.preview) continue;
    state.activeSources.delete(source);
    try {
      source.stop();
    } catch {
      // Source already ended between iteration and stop().
    }
  }
};

/** Wired from the Player host: cues follow the player's mute button. */
export const setSfxMuted = (muted: boolean) => {
  if (state.muted === muted) return;
  state.muted = muted;
  state.playbackGeneration += 1;
  if (muted) {
    stopPlayerSfx();
    notifyPlayback(false);
  } else if (state.playerPlaying) {
    notifyPlayback(true);
  }
};

/** Wired from the Player host: paused timelines cannot start or retain cues. */
export const setSfxPlaying = (playing: boolean, scope: string | null = null) => {
  if (!playing && scope !== null && scope !== state.activeScope) return;
  const scopeChanged = playing && state.activeScope !== scope;
  if (state.playerPlaying === playing && !scopeChanged) return;
  if (scopeChanged) {
    stopPlayerSfx();
    state.activeScope = scope;
  }
  state.playerPlaying = playing;
  state.playbackGeneration += 1;
  if (!playing) stopPlayerSfx();
  notifyPlayback(playing && !state.muted);
};

/** Wired from the Player host: cues follow the player's volume slider. */
export const setSfxPlayerVolume = (volume: number) => {
  state.playerVolume = Math.max(0, Math.min(1, volume));
};

const load = (src: string): Promise<AudioBuffer | null> => {
  const cached = state.buffers.get(src);
  if (cached) return Promise.resolve(cached);
  let pending = state.pending.get(src);
  if (!pending) {
    const ctx = getCtx();
    if (!ctx) return Promise.resolve(null);
    pending = fetch(src)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        state.buffers.set(src, buf);
        return buf;
      })
      .catch(() => null);
    state.pending.set(src, pending);
  }
  return pending;
};

export const preloadSfx = (src: string) => {
  void load(src);
};

export type PlaySfxOptions = {
  /** Showcase previews ignore the player's mute and volume state. */
  preview?: boolean;
  /** Stop at this wall-clock duration; useful for timeline-bounded continuous cues. */
  durationSec?: number;
  /** Repeat short media until `durationSec` elapses. */
  loop?: boolean;
  /** Resume within the source instead of restarting it from zero. */
  offsetSec?: number;
  /** Stable identity of the Player that owns this timeline cue. */
  scope?: string | null;
};

export const playSfx = (
  src: string,
  gain: number,
  options: boolean | PlaySfxOptions = false
) => {
  // Boolean stays supported for the sound showcase's historical `preview` call.
  const { preview = false, durationSec, loop = false, offsetSec = 0, scope = null } =
    typeof options === "boolean" ? { preview: options } : options;
  const ctx = getCtx();
  if (!preview && scope !== state.activeScope) return;
  if (!ctx || ((!state.playerPlaying || state.muted) && !preview)) return;
  const finalGain = gain * (preview ? 1 : state.playerVolume);
  if (finalGain <= 0) return;

  // Dedupe re-fires within 30ms (StrictMode double effects, loop edges).
  const generation = state.playbackGeneration;
  const dedupeKey = preview ? `preview:${src}` : `${generation}:${src}`;
  const now = performance.now();
  if (now - (state.lastPlay.get(dedupeKey) ?? 0) < 30) return;
  state.lastPlay.set(dedupeKey, now);

  if (ctx.state !== "running") void ctx.resume(); // fire-and-forget; cue plays when it lands
  void load(src).then((buf) => {
    if (!buf || ((!state.playerPlaying || state.muted) && !preview)) return;
    // A pause/mute happened while fetch/decode was pending. Only a fresh
    // resume request may start audio in the new playback generation.
    if (!preview && generation !== state.playbackGeneration) return;
    const rawOffset = Math.max(0, offsetSec);
    const startOffset = loop
      ? buf.duration > 0
        ? rawOffset % buf.duration
        : 0
      : rawOffset;
    if (!loop && startOffset >= buf.duration) return;
    const g = ctx.createGain();
    g.gain.value = finalGain;
    g.connect(ctx.destination);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    s.connect(g);
    s.onended = () => {
      state.activeSources.delete(s);
      s.disconnect();
      g.disconnect();
    };
    s.start(0, startOffset);
    state.activeSources.set(s, { preview });
    if (durationSec !== undefined) {
      s.stop(ctx.currentTime + Math.max(0.001, durationSec));
    }
    if (typeof window !== "undefined") {
      (window as unknown as { __sfxFired?: number }).__sfxFired =
        ((window as unknown as { __sfxFired?: number }).__sfxFired ?? 0) + 1;
    }
  });
};
