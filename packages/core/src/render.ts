import { parse } from './parse.js';
import { ValidationError } from './errors.js';
import type { Warning } from './errors.js';
import { compile, createKeyMap } from './compile/index.js';
import { compileAndRender } from './engine/index.js';
import { applyOverlay } from './overlay/index.js';
import type { LayoutSidecar } from './overlay/types.js';
import { getRasterizer } from './raster/index.js';
import type { AssetResolver } from './assets/resolver.js';
import { resolveTheme } from './theme/load.js';
import type { LayoutEngine } from './model/types.js';
import type { IconRegistry } from './icons/registry.js';
import { resolveIcons } from './icons/resolve.js';

export interface RenderOptions {
  /** Output format, default `png`. */
  format?: 'png' | 'svg';
  /** ID of a view to focus; others dimmed. */
  view?: string;
  /** Raster scale factor for PNG, 1 or 2, default 1. */
  scale?: 1 | 2;
  /**
   * Overrides the document's `theme:`. A preset name or a relative theme
   * path, resolved exactly like the file's own value (spec §3.1).
   */
  theme?: string;
  /**
   * Supplies theme files and path-form icons named by relative path.
   * Required whenever the document or `theme` uses the path form;
   * `fileResolver(dirname(file))` is the usual choice. See spec §6.
   */
  resolver?: AssetResolver;
  /** Draw the callout legend, default true. */
  legend?: boolean;
  /** Include the compiled D2 text in the result. */
  emitD2?: boolean;
  /**
   * Icon sets available to `icon:` references in the set form
   * (`lucide/database`). Path-form icons go through `resolver`. Without a
   * registry a set-form reference fails with `icon_unknown` (spec §5.1).
   */
  icons?: IconRegistry;
}

export interface RenderResult {
  /** The format actually produced. */
  format: 'png' | 'svg';
  /** PNG bytes, or the UTF-8 SVG bytes when format is svg. */
  bytes: Uint8Array;
  /** The annotated SVG, always present. */
  svg: string;
  /** Model key → bounding box sidecar for DOM wrappers. */
  layout: LayoutSidecar;
  /** Non-fatal overlay warnings. */
  warnings: Warning[];
  /** Compiled D2 text, only when `emitD2`. */
  d2?: string;
}

/**
 * Renders a Diagrammar YAML file end to end: parse -> compile -> D2 engine
 * -> annotation overlay -> optional raster. Throws `ValidationError` if the
 * YAML fails schema/semantic validation, or `DiagrammarError` (code
 * `unknown_view`, raised by `compile()`) if `opts.view` names a view that
 * does not exist on the diagram. Engine failures (D2 compile/render or
 * rasterization) surface as `DiagrammarError` with code `engine`, thrown by
 * the engine layer. Malformed SVG reaching the overlay stage (missing
 * viewBox, no closing `</svg>`, no opening `<svg ...>` tag, or an empty
 * connection route) surfaces as `DiagrammarError` with code `overlay`,
 * thrown by the overlay layer. Theme resolution (`opts.theme`, or the
 * document's own `theme:`) surfaces as `DiagrammarError` with code
 * `theme_invalid`, `asset_resolver_missing`, `asset_not_found`, or
 * `asset_outside_base`, thrown by `resolveTheme()` before the engine runs.
 * Icon resolution (`icon:` references on groups, nodes, or participants)
 * surfaces as `DiagrammarError` with code `icon_unknown` or `icon_invalid`,
 * thrown by `resolveIcons()` before the engine runs.
 */
export async function render(yaml: string, opts: RenderOptions = {}): Promise<RenderResult> {
  const parsed = parse(yaml);
  if (!parsed.ok) throw new ValidationError(parsed.issues);
  const model = parsed.diagram;

  const format = opts.format ?? 'png';
  const theme = await resolveTheme(opts.theme ?? model.theme, opts.resolver);
  const icons = await resolveIcons(model, opts.icons, opts.resolver);
  const layout: LayoutEngine = model.layout;
  const legend = opts.legend ?? true;

  const { d2 } = compile(model, opts.view, theme, icons);
  const { svg, laidOut } = await compileAndRender(d2, { layout, themeId: theme.d2ThemeId });
  const keyMap = createKeyMap(model, laidOut);

  const overlayResult = await applyOverlay(
    svg,
    laidOut,
    model,
    keyMap,
    // `exactOptionalPropertyTypes` forbids assigning `string | undefined` to
    // `OverlayOptions.view?: string` directly; spread it in only when set.
    { theme, legend, ...(opts.view !== undefined ? { view: opts.view } : {}) },
  );

  let bytes: Uint8Array;
  if (format === 'png') {
    bytes = await getRasterizer().rasterize(overlayResult.svg, { scale: opts.scale ?? 1 });
  } else {
    bytes = new TextEncoder().encode(overlayResult.svg);
  }

  const result: RenderResult = {
    format,
    bytes,
    svg: overlayResult.svg,
    layout: overlayResult.layout,
    warnings: overlayResult.warnings,
  };
  if (opts.emitD2 === true) result.d2 = d2;
  return result;
}
