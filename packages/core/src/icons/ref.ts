import { normalizeRelativePath } from '../assets/paths.js';
import { DiagrammarError } from '../errors.js';

/** Spec §3.2: `<set>/<name>` — set id is a registered `IconSet.id`, name is the upstream slug. */
export const ICON_SET_REF_RE = /^[a-z][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type IconRef = { kind: 'set'; set: string; name: string } | { kind: 'path'; path: string };

/** The path form is any reference ending in `.svg` (spec §3.2); it follows the theme path rules. */
export function isIconPathRef(ref: string): boolean {
  return /\.svg$/i.test(ref);
}

/**
 * Shared preamble for every `icon_invalid` message: every rejection — set
 * form or path form — must name both accepted forms, so a caller who typed
 * one wrong doesn't need to know the other syntax already existed.
 */
const ICON_REF_FORMS_MESSAGE =
  'must be "<set>/<name>" (e.g. lucide/database) or a relative path ending in .svg';

/**
 * Splits an `icon:` value into its set or path form. Throws `icon_invalid`
 * for anything else, so validation and resolution share one grammar.
 */
export function parseIconRef(ref: string): IconRef {
  if (isIconPathRef(ref)) {
    try {
      normalizeRelativePath(ref);
    } catch (error) {
      throw new DiagrammarError(
        `icon "${ref}" ${ICON_REF_FORMS_MESSAGE}; ${error instanceof Error ? error.message : String(error)}`,
        'icon_invalid',
      );
    }
    return { kind: 'path', path: ref };
  }
  const match = ICON_SET_REF_RE.exec(ref);
  if (match === null) {
    throw new DiagrammarError(`icon "${ref}" ${ICON_REF_FORMS_MESSAGE}`, 'icon_invalid');
  }
  const slash = ref.indexOf('/');
  return { kind: 'set', set: ref.slice(0, slash), name: ref.slice(slash + 1) };
}
