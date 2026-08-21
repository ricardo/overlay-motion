import { staticFile } from "remotion";

/** Public-folder paths work in the site (vite) AND in Remotion renders via staticFile. */
export const resolveSrc = (src: string) =>
  /^(https?:|data:|blob:|file:)/.test(src) ? src : staticFile(src.replace(/^\//, ""));
