import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generateJsonSchema, generateThemeJsonSchema } from '@noblecloak/diagrammar-core';
import { GUIDE } from './guide.js';
import type { ToolContext } from './fs.js';

const SCHEMA = generateJsonSchema();
const THEME_SCHEMA = generateThemeJsonSchema();

export function registerResources(server: McpServer, _ctx: ToolContext): void {
  server.registerResource(
    'diagrammar-schema',
    'diagrammar://schema/v1',
    { title: 'Diagrammar v1 JSON Schema', mimeType: 'application/json' },
    (uri) =>
      Promise.resolve({
        contents: [
          { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(SCHEMA, null, 2) },
        ],
      }),
  );

  server.registerResource(
    'diagrammar-theme-schema',
    'diagrammar://schema/theme-v1',
    { title: 'Diagrammar theme file v1 JSON Schema', mimeType: 'application/json' },
    (uri) =>
      Promise.resolve({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(THEME_SCHEMA, null, 2),
          },
        ],
      }),
  );

  server.registerResource(
    'diagrammar-guide',
    'diagrammar://guide',
    { title: 'Diagrammar authoring guide', mimeType: 'text/markdown' },
    (uri) =>
      Promise.resolve({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIDE }] }),
  );
}
