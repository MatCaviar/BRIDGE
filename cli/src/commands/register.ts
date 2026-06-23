import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, basename } from "path";
import { readState, writeState, createInitialState, updateStep } from "../state/manager.js";

const SAFE_NAME_RE = /^@?[a-z0-9][-a-z0-9\/]*[a-z0-9]$/;

export async function registerCommand(args: string[]): Promise<void> {
  const dirIdx = args.indexOf("--dir");
  const gatewayIdx = args.indexOf("--gateway");

  if (dirIdx === -1 || gatewayIdx === -1) {
    throw new Error("Usage: mcp-pipeline register --dir <project-dir> --gateway <gateway-dir>");
  }

  const dirArg = args[dirIdx + 1];
  const gatewayArg = args[gatewayIdx + 1];

  if (!dirArg || dirArg.startsWith("--") || !gatewayArg || gatewayArg.startsWith("--")) {
    throw new Error("--dir and --gateway require values");
  }

  const projectDir = resolve(dirArg);
  const gatewayDir = resolve(gatewayArg);

  if (!existsSync(projectDir)) {
    throw new Error("Project directory not found: " + projectDir);
  }

  const configPath = resolve(gatewayDir, "config.yaml");
  if (!existsSync(configPath)) {
    throw new Error("Gateway config not found: " + configPath);
  }

  const pkg = JSON.parse(readFileSync(resolve(projectDir, "package.json"), "utf-8"));
  const appName = String(pkg.name ?? "unknown");

  if (!SAFE_NAME_RE.test(appName)) {
    throw new Error("Invalid app name: " + appName + ". Must match " + SAFE_NAME_RE.source);
  }

  let state = readState(appName) ?? createInitialState(appName, projectDir);
  try {
    state = updateStep(state, "register", { status: "in_progress" });
    writeState(state);
  } catch {}

  const entryPath = resolve(projectDir, "dist", "index.js");
  const configContent = readFileSync(configPath, "utf-8");

  const namePattern = new RegExp("^- name:\\s*\"?" + escapeRegex(appName) + "\"?(\\s|$)", "m");
  if (namePattern.test(configContent)) {
    try {
      state = updateStep(state, "register", { status: "completed" });
      writeState(state);
    } catch {}
    process.stdout.write("Already registered: " + appName + "\n");
    return;
  }

  const updated = configContent.trimEnd() + "\n" +
    "\n# Auto-registered by mcp-pipeline\n" +
    "- name: \"" + appName + "\"\n" +
    "  command: node\n" +
    "  args:\n" +
    "    - \"" + entryPath + "\"\n";

  try {
    writeFileSync(configPath, updated, "utf-8");
    try {
      state = updateStep(state, "register", { status: "completed" });
      writeState(state);
    } catch {}
    process.stdout.write("Registered: " + appName + " -> " + configPath + "\n");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    try {
      state = updateStep(state, "register", { status: "failed", error: errorMsg });
      writeState(state);
    } catch {}
    throw error;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
}
