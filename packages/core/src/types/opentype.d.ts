declare module 'opentype.js' {
  export interface Font {
    getEnglishName(nameKey: string): string | undefined;
    getAdvanceWidth(text: string, fontSize?: number, options?: Record<string, unknown>): number;
  }

  interface OpentypeExports {
    parse(buffer: ArrayBufferLike): Font;
  }

  const opentype: OpentypeExports;
  export default opentype;
}
