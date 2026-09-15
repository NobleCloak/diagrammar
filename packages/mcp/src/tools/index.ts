import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../fs.js';
import { register as registerSchema } from './schema.js';
import { register as registerIcons } from './icons.js';
import { register as registerList } from './list.js';
import { register as registerDescribe } from './describe.js';
import { register as registerValidate } from './validate.js';
import { register as registerCreate } from './create.js';
import { register as registerEdit } from './edit.js';
import { register as registerRender } from './render.js';

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerSchema(server, ctx);
  registerIcons(server, ctx);
  registerList(server, ctx);
  registerDescribe(server, ctx);
  registerValidate(server, ctx);
  registerCreate(server, ctx);
  registerEdit(server, ctx);
  registerRender(server, ctx);
}
