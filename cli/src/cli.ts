import { invokeCommand } from "./commands/invoke.js";
import { schemaCommand } from "./commands/schema.js";
import { serveCommand } from "./commands/serve.js";

type CommandHandler = (args: string[]) => Promise<void>;

const COMMANDS: Record<string, CommandHandler> = {
  invoke: invokeCommand,
  schema: schemaCommand,
  serve: serveCommand,
};

export async function dispatch(argv: string[]): Promise<number> {
  const command = argv[0];

  if (!command) {
    process.stderr.write("Usage: mcp-pipeline <command> [options]\n\n");
    process.stderr.write("Commands:\n");
    process.stderr.write("  invoke     Invoke a tool on the car: --op <id> --device <serial> [--args '<json>' --user --package --timeout --req-id --json]\n");
    process.stderr.write("  schema     Export upstream-Agent function schemas: --analysis <analysis.json> [--out <file> --format bridge|mcp|openai|anthropic|all]\n");
    process.stderr.write("  serve      Run the MCP server (stdio): --analysis <analysis.json> --device <serial> [--user --package --include-broken]\n");
    return 1;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`Unknown command: ${command}\n`);
    process.stderr.write("Run 'mcp-pipeline' without arguments for usage.\n");
    return 1;
  }

  try {
    await handler(argv.slice(1));
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
