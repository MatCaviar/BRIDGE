import { spawn } from "node:child_process";
import type { AdbConfig } from "../config.js";

export interface ExecResult {
  readonly success: boolean;
  readonly rawOutput: string;
  readonly parsed?: unknown;
}

type CommandHandler = (args: Record<string, unknown>) => string;

const commandRegistry = new Map<string, CommandHandler>();

export function registerCommand(name: string, handler: CommandHandler): void {
  commandRegistry.set(name, handler);
}

export function clearCommands(): void {
  commandRegistry.clear();
}

export function getRegisteredCommands(): string[] {
  return Array.from(commandRegistry.keys());
}

export async function execute(
  commandName: string,
  args: Record<string, unknown>,
  config: AdbConfig,
): Promise<ExecResult> {
  const handler = commandRegistry.get(commandName);
  if (!handler) {
    return { success: false, rawOutput: `unknown command: ${commandName}` };
  }
  const argString = handler(args);
  const fullArgs = [
    ...(config.use_host ? ["-host"] : []),
    ...argString.split(/\s+/).filter(Boolean),
  ];

  return new Promise<ExecResult>((resolveResult) => {
    let stdout = "";
    const child = spawn(config.path, fullArgs, { timeout: config.timeout_ms });
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.on("error", (err) => {
      resolveResult({ success: false, rawOutput: `spawn error: ${err.message}` });
    });
    child.on("close", (code) => {
      const trimmed = stdout.trim();
      if (code === 0 && trimmed.startsWith("SUCCESS:")) {
        const jsonPart = trimmed.slice("SUCCESS:".length).trim();
        let parsed: unknown = undefined;
        try {
          parsed = JSON.parse(jsonPart);
        } catch {
          // 非 JSON，保留 rawOutput
        }
        resolveResult({ success: true, rawOutput: trimmed, parsed });
      } else {
        resolveResult({ success: false, rawOutput: trimmed || `exit code ${code}` });
      }
    });
  });
}

// 单点：注册 sendlink（泛化时在此追加 dbus-call 等）
registerCommand("sendlink", (args) => `shell sendlink ${String(args.url)}`);
// 通用 shell：rpc 桥用它写 cmd / cat result（adb -host shell <cmd>）
registerCommand("shell", (args) => `shell ${String(args.cmd)}`);
