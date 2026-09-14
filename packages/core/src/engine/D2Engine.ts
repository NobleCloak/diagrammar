import { D2 } from '@d2lang/d2';
import type { CompileOptions, CompileResponse, Connection, Shape } from '@d2lang/d2';
import { DiagrammarError } from '../errors.js';
import { loadFonts } from './fonts.js';
import type {
  EngineOptions,
  EngineResult,
  LaidOutConnection,
  LaidOutDiagram,
  LaidOutShape,
  Point,
  Theme,
} from './types.js';

const THEME_ID: Record<Theme, number> = { light: 0, dark: 200 };
const PAD = 24;
const SCALE = 1;

let instance: D2 | undefined;
let queue: Promise<void> = Promise.resolve();

function getInstance(): D2 {
  instance ??= new D2();
  return instance;
}

/** Serializes calls through the single D2 instance, per contract §6. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

interface FontsB64 {
  regular: string;
  italic: string;
  bold: string;
  semibold: string;
}

let fontsB64: Promise<FontsB64> | undefined;

/**
 * Base64-encodes the bundled fonts once per process and caches the result,
 * instead of re-encoding ~1.6 MB of font bytes on every compileAndRender
 * call. See toCompileOptions's doc comment for why base64 is required at
 * all.
 */
function loadFontsB64(): Promise<FontsB64> {
  fontsB64 ??= loadFonts()
    .then((fonts) => ({
      regular: toBase64(fonts.regular),
      italic: toBase64(fonts.italic),
      bold: toBase64(fonts.bold),
      semibold: toBase64(fonts.semibold),
    }))
    .catch((error: unknown) => {
      // Reset the cache on failure so a transient error is retryable instead
      // of permanently poisoning every later compileAndRender() call.
      fontsB64 = undefined;
      throw error;
    });
  return fontsB64;
}

interface CompileOptionsWithBase64Fonts extends Omit<
  CompileOptions,
  'fontRegular' | 'fontItalic' | 'fontBold' | 'fontSemibold'
> {
  fontRegular?: string;
  fontItalic?: string;
  fontBold?: string;
  fontSemibold?: string;
}

/**
 * @d2lang/d2 0.1.34's shipped index.d.ts declares fontRegular/fontItalic/fontBold/
 * fontSemibold as Uint8Array, but the worker bridges every compile() call through
 * `JSON.stringify()` before crossing into the Go/WASM boundary
 * (dist/node-esm/worker.js's `compile` case does `o.compile(JSON.stringify(c))`).
 * JSON.stringify on a Uint8Array produces an index-keyed object, not a byte
 * array or a base64 string, and Go's `[]byte` unmarshaling (which expects
 * base64, per Go's encoding/json convention for byte slices) rejects it with
 * `Error: invalid JSON input`. A base64 string round-trips correctly.
 * Verified empirically against the pinned version — see
 * docs/spikes/2026-09-11-d2-resvg-spike.md. This is the only
 * `as unknown as` cast in this plan (see the plan's "Contract deviations").
 */
function toCompileOptions(options: CompileOptionsWithBase64Fonts): CompileOptions {
  return options as unknown as CompileOptions;
}

function findAllSvgViewBoxes(
  svg: string,
): Array<{ x: number; y: number; width: number; height: number }> {
  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
  const tagRe = /<svg\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(svg)) !== null) {
    const tag = match[0];
    const vb = /\sviewBox="([-\d.eE]+)[ ,]+([-\d.eE]+)[ ,]+([-\d.eE]+)[ ,]+([-\d.eE]+)"/.exec(tag);
    const x = vb?.[1];
    const y = vb?.[2];
    const width = vb?.[3];
    const height = vb?.[4];
    if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
      boxes.push({ x: Number(x), y: Number(y), width: Number(width), height: Number(height) });
    }
  }
  return boxes;
}

function toLaidOutShape(shape: Shape): LaidOutShape {
  return {
    id: shape.id,
    type: shape.type,
    pos: { x: shape.pos.x, y: shape.pos.y },
    width: shape.width,
    height: shape.height,
    level: shape.level,
  };
}

interface RoutePoint {
  x: number;
  y: number;
}

/**
 * @d2lang/d2's shipped types declare `Connection.route` as `(any | undefined)[]`.
 * Narrow through `unknown` and a runtime check instead of trusting that `any`.
 */
function isRoutePoint(value: unknown): value is RoutePoint {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.x === 'number' && typeof candidate.y === 'number';
}

function toLaidOutConnection(connection: Connection): LaidOutConnection {
  const rawRoute: unknown[] = connection.route;
  const route: Point[] = [];
  for (const point of rawRoute) {
    if (isRoutePoint(point)) {
      route.push({ x: point.x, y: point.y });
    }
  }
  return {
    id: connection.id,
    src: connection.src,
    dst: connection.dst,
    route,
  };
}

/** @internal Testing only. Computes the outer viewBox from raw D2 SVG output. */
export function computeViewBox(svg: string): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const boxes = findAllSvgViewBoxes(svg);
  const outer = boxes[0];
  if (outer === undefined) {
    throw new DiagrammarError('D2 output has no root viewBox attribute', 'engine');
  }
  return outer;
}

/**
 * D2 nests a second <svg> inside the root one, with the inner viewBox offset
 * by D2's internal padding (verified:
 * docs/spikes/2026-09-11-d2-resvg-spike.md). `origin` is the
 * offset to add to a shape's raw `pos` so the result lands in the OUTER
 * <svg>'s coordinate space. This is an invariant, not a best-effort parse:
 * the spike found exactly two `<svg>` tags with the inner and outer viewBox
 * sharing the same width/height, on every layout engine tested against the
 * pinned D2 version. If a future D2 version ever emits a different shape
 * (a single `<svg>`, more than two, or mismatched outer/inner sizes), this
 * throws loudly instead of silently returning a wrong-but-plausible origin.
 * @internal Exported for unit tests only; not part of the public API.
 */
export function computeOrigin(svg: string): Point {
  const boxes = findAllSvgViewBoxes(svg);
  const outer = boxes[0];
  const inner = boxes[1];
  if (
    boxes.length !== 2 ||
    outer === undefined ||
    inner === undefined ||
    inner.width !== outer.width ||
    inner.height !== outer.height
  ) {
    throw new DiagrammarError(
      'D2 SVG structure changed: expected an outer and an inner <svg> with matching viewBox size (see docs/spikes/2026-09-11-d2-resvg-spike.md)',
      'engine',
    );
  }
  return { x: -inner.x, y: -inner.y };
}

export async function compileAndRender(
  d2Source: string,
  opts: EngineOptions,
): Promise<EngineResult> {
  return enqueue(async () => {
    const fonts = await loadFontsB64();
    const d2 = getInstance();
    let compiled: CompileResponse;
    try {
      compiled = await d2.compile(
        d2Source,
        toCompileOptions({
          layout: opts.layout,
          themeID: THEME_ID[opts.theme],
          pad: PAD,
          scale: SCALE,
          fontRegular: fonts.regular,
          fontItalic: fonts.italic,
          fontBold: fonts.bold,
          fontSemibold: fonts.semibold,
        }),
      );
    } catch (error) {
      throw new DiagrammarError(
        `D2 failed to compile: ${error instanceof Error ? error.message : String(error)}`,
        'engine',
      );
    }
    let svg: string;
    try {
      svg = await d2.render(compiled.diagram, compiled.renderOptions);
    } catch (error) {
      throw new DiagrammarError(
        `D2 failed to render: ${error instanceof Error ? error.message : String(error)}`,
        'engine',
      );
    }
    const laidOut: LaidOutDiagram = {
      shapes: compiled.diagram.shapes.map(toLaidOutShape),
      connections: compiled.diagram.connections.map(toLaidOutConnection),
      origin: computeOrigin(svg),
      viewBox: computeViewBox(svg),
    };
    return { svg, laidOut };
  });
}

/** Disposes the D2 worker. A later `compileAndRender` call re-creates it. */
export function shutdown(): Promise<void> {
  return enqueue(async () => {
    const current = instance;
    if (current !== undefined) {
      try {
        await current.dispose();
      } finally {
        // Clear only after dispose settles, so a rejected dispose can't
        // leave the old (undisposed) worker un-referenced while a new one
        // gets created underneath it.
        instance = undefined;
      }
    }
  });
}
