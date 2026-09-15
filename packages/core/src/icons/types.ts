export interface IconLicense {
  spdx: string;
  url: string;
  notice?: string;
}

/** An installed icon set (spec §5.1). Sets load lazily on first use. */
export interface IconSet {
  readonly id: string;
  readonly version: string;
  readonly license: IconLicense;
  load(): Promise<void>;
  /**
   * Returns the sanitized SVG for `name`, or `undefined` if the set has not
   * been loaded yet or does not own that name. Throws `icon_invalid` for an
   * icon that fails sanitization.
   */
  get(name: string): string | undefined;
  names(): readonly string[];
  aliases(name: string): readonly string[];
}

export interface IconMatch {
  set: string;
  name: string;
  rank: 1 | 2 | 3 | 4 | 5;
}

export interface ResolvedIcon {
  set: IconSet;
  name: string;
  svg: string;
}

/** Model key (node/group/participant id) -> `data:image/svg+xml;base64,...`. */
export type ResolvedIcons = ReadonlyMap<string, string>;
