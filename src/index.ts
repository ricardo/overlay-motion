/**
 * Root entry of the engine package. Deliberately small: the spec grammar, the
 * gate that validates it, the template registry and the brand themes. That is
 * everything a consumer needs to go from JSON to a rendered composition.
 *
 * Anything more specific (a single player component, the sound engine, the
 * agent contract) has its own subpath in package.json `exports`, so importing
 * one piece never drags the whole library in.
 */
export { editSpec, formats, overlayMotion } from "./spec/types";
export type {
  BrandTheme,
  Camera,
  EditSpec,
  Format,
  OverlayMotionSpec,
} from "./spec/types";
export { parseSpec, validateSpec } from "./spec/validate";
export { demoSpecFor, displaySpecFor, TEMPLATES, TEMPLATE_MAP } from "./templates/registry";
export type { TemplateDef } from "./templates/types";
export { PRESET_THEMES } from "./theme/themes";
