import { useEffect } from "react";
import type { RefObject } from "react";
import type { PlayerRef } from "@remotion/player";
import {
  setSfxMuted,
  setSfxPlayerVolume,
  setSfxPlaying,
  stopPlayerSfx,
} from "./engine";

/**
 * Keeps the Web Audio sfx engine in sync with a Player's full lifecycle.
 * Pass the values that force the <Player> to remount (its `key` inputs) so
 * listeners re-attach to the fresh player instance.
 */
export const usePlayerSfxSync = (
  ref: RefObject<PlayerRef | null>,
  remountDeps: readonly unknown[] = []
) => {
  useEffect(() => {
    // The Player usually mounts later than this effect (SSR `mounted` gates
    // plus lazy SpecPlayer), so poll until the ref fills instead of silently
    // attaching to nothing: that left detail pages with a deaf sfx engine.
    let retry: number | null = null;
    let detach: (() => void) | null = null;

    const attach = () => {
      const p = ref.current;
      if (!p) {
        retry = window.setTimeout(attach, 100);
        return;
      }

      const syncMediaControls = () => {
        setSfxMuted(p.isMuted());
        setSfxPlayerVolume(p.getVolume());
      };
      const syncPlayback = () => setSfxPlaying(p.isPlaying());
      const startPlayback = () => setSfxPlaying(true);
      const stopPlayback = () => setSfxPlaying(false);
      const stopSeekedSfx = () => stopPlayerSfx();

      syncMediaControls();
      syncPlayback();
      p.addEventListener("mutechange", syncMediaControls);
      p.addEventListener("volumechange", syncMediaControls);
      p.addEventListener("play", startPlayback);
      p.addEventListener("pause", stopPlayback);
      p.addEventListener("resume", syncPlayback);
      p.addEventListener("waiting", stopPlayback);
      p.addEventListener("ended", stopPlayback);
      p.addEventListener("seeked", stopSeekedSfx);

      detach = () => {
        p.removeEventListener("mutechange", syncMediaControls);
        p.removeEventListener("volumechange", syncMediaControls);
        p.removeEventListener("play", startPlayback);
        p.removeEventListener("pause", stopPlayback);
        p.removeEventListener("resume", syncPlayback);
        p.removeEventListener("waiting", stopPlayback);
        p.removeEventListener("ended", stopPlayback);
        p.removeEventListener("seeked", stopSeekedSfx);
        setSfxPlaying(false);
      };
    };

    attach();
    return () => {
      if (retry !== null) window.clearTimeout(retry);
      detach?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...remountDeps]);
};
