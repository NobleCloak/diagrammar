import { walkthrough as buildWalkthrough } from './walkthrough/index.js';
import type { WalkthroughOptions } from './walkthrough/index.js';
import { parse as parseForWalkthrough } from './parse.js';
import { ValidationError as WalkthroughValidationError } from './errors.js';

export const VERSION = '0.1.0';

export * from './errors.js';

export { shutdown } from './engine/index.js';

export { parse } from './parse.js';
export type { ParseResult } from './parse.js';
export { validate } from './validate.js';
export type { ValidationResult } from './validate.js';
export { createDocument } from './create.js';

export { fileResolver, memoryResolver, isPathRef, normalizeRelativePath } from './assets/index.js';
export type { AssetResolver, FileResolverOptions } from './assets/index.js';
export {
  PRESETS,
  PRESET_NAMES,
  isPresetName,
  presetTheme,
  buildTheme,
  mergeStyle,
  parseThemeFile,
  resolveTheme,
  checkThemeRef,
  ThemeFileSchema,
  generateThemeJsonSchema,
} from './theme/index.js';
export type {
  PresetName,
  PresetSpec,
  ThemeMode,
  OverrideSlot,
  Palette,
  ThemeDefaults,
  ResolvedTheme,
  ThemeFileInput,
  ThemeParseResult,
  StyleTarget,
} from './theme/index.js';

export {
  ICON_SET_REF_RE,
  ICON_MAX_BYTES,
  ICON_SET_DATA_FILE,
  ICON_SET_INDEX_FILE,
  isIconPathRef,
  parseIconRef,
  sanitizeSvg,
  memoryIconSet,
  openIconSetDir,
  svgDataUri,
  IconRegistry,
  rankMatches,
  resolveIcons,
  checkIconRefs,
  iconSites,
} from './icons/index.js';
export type {
  IconRef,
  SanitizeOptions,
  IconLicense,
  IconMatch,
  IconSet,
  IconSetIndex,
  ResolvedIcon,
  ResolvedIcons,
} from './icons/index.js';

export { render } from './render.js';
export type { RenderOptions, RenderResult } from './render.js';
export type { LayoutSidecar, LayoutEntry } from './overlay/types.js';

export { FLOWCHART_SHAPES, ARCHITECTURE_SHAPES, indexElements } from './model/types.js';
export type {
  DiagramType,
  Direction,
  LayoutEngine,
  Theme,
  Style,
  GraphShape,
  Side,
  ParticipantKind,
  MessageStyle,
  FragmentKind,
  NodeModel,
  GroupModel,
  EdgeModel,
  ParticipantModel,
  MessageModel,
  FragmentModel,
  SequenceItem,
  NoteModel,
  CalloutModel,
  ViewModel,
  DiagramBase,
  GraphDiagram,
  SequenceDiagram,
  Diagram,
  ElementModel,
  ElementIndex,
} from './model/types.js';
export { resolveSelector } from './model/selectors.js';
export type { Selector, SelectorError } from './model/selectors.js';

export type {
  StyleInput,
  NodeInput,
  GroupInput,
  EdgeInput,
  ParticipantInput,
  MessageInput,
  FragmentInput,
  SequenceItemInput,
  NoteInput,
  CalloutInput,
  ViewInput,
  SelectorRefInput,
  DiagramFile,
  GraphFileInput,
  SequenceFileInput,
} from './schema/index.js';

// Value export (contract §5 / §11 item 5): Plan 06's `diagrammar_schema` MCP
// tool and `diagrammar://schema/v1` resource call this directly rather than
// importing a precomputed constant, so the JSON Schema they serve is always
// generated from whatever DiagramFileSchema currently is.
export { generateJsonSchema } from './schema/json-schema.js';

export { DiagramDocument, type OpResult } from './document/index.js';
export { OpSchema, parseOp, type Op, type OpApplyResult } from './document/index.js';
export {
  describe,
  type Description,
  type DescribedElement,
  type DescribedNote,
  type DescribedCallout,
  type DescribedView,
} from './document/index.js';
export { JsonPatchOpSchema, type JsonPatchOp } from './document/index.js';

export type { WalkthroughOptions } from './walkthrough/index.js';

/** Parses `yaml`, then emits the Markdown walkthrough (spec §6.6). Throws `ValidationError` on invalid YAML. */
export function walkthrough(yaml: string, opts: WalkthroughOptions = {}): string {
  const parsed = parseForWalkthrough(yaml);
  if (!parsed.ok) throw new WalkthroughValidationError(parsed.issues);
  return buildWalkthrough(parsed.diagram, opts);
}
