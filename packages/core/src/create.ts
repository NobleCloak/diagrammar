import { stringify } from 'yaml';
import type { DiagramType } from './model/types.js';

const SCHEMA_HEADER =
  '# yaml-language-server: $schema=https://raw.githubusercontent.com/NobleCloak/diagrammar/main/packages/core/schema/diagrammar-v1.json\n';

export function createDocument(init: { type: DiagramType; title?: string }): string {
  const body: Record<string, unknown> = { diagrammar: 1, type: init.type };
  if (init.title !== undefined) {
    body.title = init.title;
  }
  if (init.type === 'sequence') {
    body.participants = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    body.messages = [{ from: 'a', to: 'b', label: 'message' }];
  } else {
    body.nodes = [{ id: 'start', label: 'Start' }];
  }
  return SCHEMA_HEADER + stringify(body);
}
