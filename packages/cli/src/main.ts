import { shutdown } from '@noblecloak/diagrammar-core';
import { run as runRender, help as renderHelp } from './commands/render.js';
// I5 (spec §7): `@noblecloak/diagrammar`'s entry re-exports the whole `@noblecloak/diagrammar-core`
// public API, alongside this module's own CLI-specific exports below.
export * from '@noblecloak/diagrammar-core';
import { run as runValidate, help as validateHelp } from './commands/validate.js';
import { run as runNew, help as newHelp } from './commands/new.js';
import { run as runDescribe, help as describeHelp } from './commands/describe.js';
import { run as runEdit, help as editHelp } from './commands/edit.js';
import { run as runMcp, help as mcpHelp } from './commands/mcp.js';
import { run as runThemes, help as themesHelp } from './commands/themes.js';

export interface Command {
  run: (argv: string[]) => Promise<number>;
  help: string;
}

export const COMMANDS: Record<string, Command> = {
  render: { run: runRender, help: renderHelp },
  validate: { run: runValidate, help: validateHelp },
  new: { run: runNew, help: newHelp },
  describe: { run: runDescribe, help: describeHelp },
  edit: { run: runEdit, help: editHelp },
  mcp: { run: runMcp, help: mcpHelp },
  themes: { run: runThemes, help: themesHelp },
};

const TOP_HELP = `diagrammar <command> [options]

Commands:
  render <files...>   Render diagrams to PNG, SVG, Markdown, or D2
  validate <files...> Validate diagrams
  new <file>          Create a new diagram file
  describe <file>     Print a structural summary of a diagram
  edit <file>         Apply operations to a diagram file
  mcp                 Run the Diagrammar MCP server
  themes list         List built-in theme presets

Run "diagrammar <command> --help" for command-specific options.
`;

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined) {
    // Failure path (exit 1): usage goes to stderr, not stdout (M13).
    console.error(TOP_HELP);
    return 1;
  }
  if (command === '--help' || command === '-h') {
    console.log(TOP_HELP);
    return 0;
  }
  const entry = COMMANDS[command];
  if (entry === undefined) {
    console.error(`Unknown command: ${command}`);
    console.error(TOP_HELP);
    return 1;
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    console.log(entry.help);
    return 0;
  }
  try {
    return await entry.run(rest);
  } finally {
    await shutdown();
  }
}
