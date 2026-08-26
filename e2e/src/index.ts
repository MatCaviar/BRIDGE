#!/usr/bin/env node

/**
 * MCP Gateway — CLI entry point.
 *
 * Usage:
 *   npx tsx src/index.ts                    # Uses default config.yaml
 *   npx tsx src/index.ts --config my.yaml   # Custom config
 */
import path from "node:path";
import { loadConfig } from "./config.js";
import { McpConnector } from "./mcp/connector.js";
import { createLLMClient } from "./llm/factory.js";
import { run } from "./orchestrator.js";
import * as logger from "./utils/logger.js";

const E2E_ROOT = path.resolve(import.meta.dirname, "..");

async function main(): Promise<void> {
  // Parse CLI args
  const args = process.argv.slice(2);
  let configPath = path.join(E2E_ROOT, "config-cockpit.yaml");

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--config" || args[i] === "-c") && args[i + 1]) {
      configPath = path.resolve(args[i + 1]);
      i++;
    }
  }

  logger.info("gateway", `Loading config from ${configPath}`);

  // Load config (with ${ENV_VAR} expansion)
  const config = loadConfig(configPath);

  logger.info("gateway", `LLM: ${config.llm.provider}/${config.llm.model}`);
  logger.info("gateway", `MCP servers: ${config.mcpServers.map(s => s.name).join(", ")}`);
  logger.info("gateway", `Task: "${config.task.userMessage.substring(0, 60)}..."`);

  // Initialize components
  const connector = new McpConnector(config.mcpServers);
  await connector.connectAll();

  const llm = createLLMClient(config.llm);

  // Run the orchestration loop
  try {
    const result = await run(llm, connector, config);

    // Output final result to stdout (this is the user-facing output)
    console.log("\n" + "=".repeat(60));
    console.log("FINAL RESPONSE:");
    console.log("=".repeat(60));
    console.log(result);
    console.log("=".repeat(60));
  } finally {
    await connector.disconnect();
  }
}

main().catch((error) => {
  logger.error("gateway", `Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
