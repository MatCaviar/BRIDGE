import { invokeCommand } from "./commands/invoke.js";
import { schemaCommand } from "./commands/schema.js";
import { serveCommand } from "./commands/serve.js";
import { callCommand } from "./commands/call.js";

type CommandHandler = (args: string[]) => Promise<void>;

const COMMANDS: Record<string, CommandHandler> = {
  invoke: invokeCommand,
  schema: schemaCommand,
  serve: serveCommand,
  call: callCommand,
};

export async function dispatch(argv: string[]): Promise<number> {
  const command = argv[0];

  if (!command) {
    process.stderr.write("Usage: mcp-pipeline <command> [options]\n\n");
    process.stderr.write("Commands:\n");
    process.stderr.write("  call       Validated invocation: --analysis <file> --op <capability> [--args '<json>' --device <serial>]\n");
    process.stderr.write("  invoke     Low-level Android dispatch: --op <id> --device <serial> [--args '<json>' --user --package --timeout --req-id --json]\n");
    process.stderr.write("  schema     Export upstream-Agent function schemas: --analysis <analysis.json> [--out <file> --format bridge|mcp|openai|anthropic|all]\n");
    process.stderr.write("  serve      Run the MCP server (stdio): --analysis <analysis.json> [--device <serial> --user --package --preconditions-file <path> --include-broken]\n");
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
