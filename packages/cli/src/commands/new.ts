import { parseArgs } from 'node:util';
import { createDocument, DiagramDocument, type DiagramType } from '@noblecloak/diagrammar-core';
import { seedRemovalOps, writeAtomic } from '@noblecloak/diagrammar-mcp';

export const help = `diagrammar new <file> --type flowchart|architecture|sequence [--title "..."]

Creates a new, minimal valid Diagrammar YAML file with no seed elements.
Refuses to overwrite an existing file.

Options:
  --type   Required. One of: flowchart, architecture, sequence.
  --title  Optional diagram title.

Exit codes: 0 success, 1 usage error, the file already exists, or an IO error.
`;

const VALID_TYPES: readonly DiagramType[] = ['flowchart', 'architecture', 'sequence'];

function isDiagramType(value: string): value is DiagramType {
  return (VALID_TYPES as readonly string[]).includes(value);
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      type: { type: 'string' },
      title: { type: 'string' },
    },
    allowPositionals: true,
  });
  const file = positionals[0];
  if (file === undefined) {
    console.error('new: a file path is required');
    return 1;
  }
  if (values.type === undefined || !isDiagramType(values.type)) {
    console.error('new: --type is required and must be one of flowchart, architecture, sequence');
    return 1;
  }
  const init: { type: DiagramType; title?: string } = { type: values.type };
  if (values.title !== undefined) init.title = values.title;
  const doc = DiagramDocument.from(createDocument(init));
  const stripped = doc.apply(seedRemovalOps(values.type));
  if (!stripped.ok) {
    console.error(
      `new: internal error building document: ${stripped.issues.map((issue) => issue.message).join('; ')}`,
    );
    return 1;
  }
  const text = doc.toString();
  try {
    // Atomic + exclusive (I6): writes to a sibling temp file, then links it
    // into place — failing with EEXIST rather than silently overwriting —
    // so a crash mid-write never leaves a partial file at `file`.
    await writeAtomic(file, text, { exclusive: true });
  } catch (err) {
    if (isErrnoException(err)) {
      if (err.code === 'EEXIST') {
        console.error(`new: ${file} already exists`);
        return 1;
      }
      if (err.code === 'ENOENT') {
        console.error(`new: cannot write ${file}: parent directory does not exist`);
        return 1;
      }
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        console.error(`new: permission denied: ${file}`);
        return 1;
      }
    }
    throw err;
  }
  console.log(`Created ${file}`);
  return 0;
}
