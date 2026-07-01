import { validateCommand } from "./commands/validate.js";
import { scaffoldCommand } from "./commands/scaffold.js";
import { testCommand } from "./commands/test.js";
import { buildCommand } from "./commands/build.js";
import { registerCommand } from "./commands/register.js";
import { verifyCommand } from "./commands/verify.js";
import { validateConfigCommand } from "./commands/validate-config.js";
import { wireCheckCommand } from "./commands/wire-check.js";
import { curateCommand } from "./commands/curate.js";
import { schemaPreviewCommand } from "./commands/schema-preview.js";

type CommandHandler = (args: string[]) => Promise<void>;

const COMMANDS: Record<string, CommandHandler> = {
  validate: validateCommand,
  validate_config: validateConfigCommand,
  wire_check: wireCheckCommand,
  scaffold: scaffoldCommand,
  test: testCommand,
  build: buildCommand,
  register: registerCommand,
  verify: verifyCommand,
  curate: curateCommand,
  schema_preview: schemaPreviewCommand,
};

export async function dispatch(argv: string[]): Promise<number> {
  const command = argv[0];

  if (!command) {
    process.stderr.write("Usage: mcp-pipeline <command> [options]\n\n");
    process.stderr.write("Commands:\n");
    process.stderr.write("  validate   Validate analysis.json against schema\n");
    process.stderr.write("  validate_config  Validate config.json (coverage + dispatchable)\n");
    process.stderr.write("  wire_check Statically verify config wire matches proxy source\n");
    process.stderr.write("  scaffold   Generate MCP Server project skeleton\n");
    process.stderr.write("  test       Run tests and collect results\n");
    process.stderr.write("  build      Build the MCP Server\n");
    process.stderr.write("  register   Register to gateway config\n");
    process.stderr.write("  verify     Verify connectivity and tool discovery\n");
  process.stderr.write("  curate     Enumerate MCP-ifiable capabilities\n");
  process.stderr.write("  schema_preview <analysis.json> [<rpc/config.json>]  Project MCP schema to tools-schema.json (no build)\n");
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
