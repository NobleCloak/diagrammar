export { ICON_SET_REF_RE, isIconPathRef, parseIconRef } from './ref.js';
export type { IconRef } from './ref.js';
export { ICON_MAX_BYTES, sanitizeSvg } from './sanitize.js';
export type { SanitizeOptions } from './sanitize.js';
export type { IconLicense, IconMatch, IconSet, ResolvedIcon, ResolvedIcons } from './types.js';
export {
  ICON_SET_DATA_FILE,
  ICON_SET_INDEX_FILE,
  memoryIconSet,
  openIconSetDir,
  svgDataUri,
} from './set.js';
export type { IconSetIndex } from './set.js';
export { IconRegistry, rankMatches } from './registry.js';
export { resolveIcons, checkIconRefs, iconSites } from './resolve.js';
