/**
 * Configuration loader — reads YAML config with environment variable expansion.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { LLMConfig } from "./llm/types.js";
import type { McpServerConfig } from "./mcp/types.js";

export interface TaskConfig {
  readonly systemPrompt: string | null;
  readonly userMessage: string;
  readonly maxTurns: number;
}

export interface UiSyncRule {
  readonly tool: string;
  readonly argKey: string;
  readonly map: Readonly<Record<string, string>>;
}

export interface GatewayConfig {
  readonly llm: LLMConfig;
  readonly mcpServers: readonly McpServerConfig[];
  readonly task: TaskConfig;
  /** 状态类 app UI 同步: 工具执行成功后自动点击"当前状态"对应控件(走 app 交互路径刷新, 无感)。 */
  readonly uiSync?: readonly UiSyncRule[];
}

/**
 * Expand ${ENV_VAR} references in string values.
 */
function expandEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      throw new Error(`Environment variable ${varName} is not set`);
    }
    return envValue;
  });
}

/**
 * Recursively expand env vars in all string values of an object.
 */
function expandDeep<T>(obj: T): T {
  if (typeof obj === "string") {
    return expandEnvVars(obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(expandDeep) as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandDeep(value);
    }
    return result as T;
  }
  return obj;
}

/**
 * Load and validate gateway configuration from a YAML file.
 */
export function loadConfig(configPath: string): GatewayConfig {
  const resolved = path.resolve(configPath);
  const configDir = path.dirname(resolved);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, "utf-8");
  const parsed = expandDeep(yaml.load(raw) as Record<string, unknown>);

  // Validate required fields
  if (!parsed.llm || typeof parsed.llm !== "object") {
    throw new Error("Config missing 'llm' section");
  }
  const llm = parsed.llm as Record<string, unknown>;

  if (!llm.provider || !llm.model || !llm.api_key) {
    throw new Error("Config 'llm' section requires: provider, model, api_key");
  }

  if (!parsed.mcp_servers || !Array.isArray(parsed.mcp_servers)) {
    throw new Error("Config missing 'mcp_servers' array");
  }

  if (!parsed.task || typeof parsed.task !== "object") {
    throw new Error("Config missing 'task' section");
  }
  const task = parsed.task as Record<string, unknown>;

  const mcpServers = (parsed.mcp_servers as McpServerConfig[]).map((server) => ({
    ...server,
    cwd: server.cwd ? path.resolve(configDir, server.cwd) : configDir,
  }));

  return {
    llm: {
      provider: String(llm.provider),
      model: String(llm.model),
      apiKey: String(llm.api_key),
      baseUrl: llm.base_url ? String(llm.base_url) : undefined,
      temperature: llm.temperature ? Number(llm.temperature) : undefined,
      maxTokens: llm.max_tokens ? Number(llm.max_tokens) : undefined,
    },
    mcpServers,
    uiSync: (parsed.ui_sync as Array<Record<string, unknown>> | undefined)?.map((r) => ({
      tool: String(r.tool),
      argKey: String(r.arg_key ?? r.argKey ?? ""),
      map: (r.map ?? {}) as Record<string, string>,
    })),
    task: {
      systemPrompt: task.system_prompt != null ? String(task.system_prompt) : null,
      userMessage: String(task.user_message ?? ""),
      maxTurns: Number(task.max_turns ?? 15),
    },
  };
}
