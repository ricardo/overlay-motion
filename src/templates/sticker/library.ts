/**
 * Cutouts that ship WITH the library, as NAME to bundled file.
 *
 * Same shape and same reason as `LIBRARY_CUES` in `src/sound/config.ts`: a
 * caller can only reach an asset they can NAME. A path is something you have to
 * be told; `"pickle"` is something the prop table and the props schema can print,
 * so a bundled cutout is discoverable instead of being a file someone happens
 * to know about.
 *
 * Every entry is first-party art with no third-party license attached
 * (`public/stickers/SOURCES.md`). Anything else stays a path or a URL: the
 * library does not redistribute art it did not make.
 */
export const STICKER_LIBRARY: Record<string, string> = {
  /** Transparent pickle cutout, 1024x1024 RGBA, art fills the square. */
  pickle: "/stickers/pickle.png",
};

/** The names a spec may pass as `props.src`, for docs and error messages. */
export const STICKER_LIBRARY_NAMES = Object.keys(STICKER_LIBRARY);

/**
 * A library NAME resolves to its bundled file; anything else passes through
 * untouched, so a public path, a URL or a data URI still works. Names carry no
 * slash and no extension, so the two can never collide.
 */
export const resolveStickerArt = (src: string): string => STICKER_LIBRARY[src] ?? src;
