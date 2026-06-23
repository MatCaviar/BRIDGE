import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

export interface ServerConfig {
  readonly adapter: {
    readonly mock_mode: boolean;
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG: ServerConfig = {
  adapter: { mock_mode: true },
};

function parseMockMode(yaml: string): boolean {
  // Find adapter: section, then mock_mode: value
  const adapterMatch = yaml.match(/adapter:[\s\S]*?mock_mode:\s*(\w+)/);
  if (adapterMatch && adapterMatch[1]) {
    return adapterMatch[1] !== "false";
  }
  return true; // default to mock
}

export function readConfig(configPath?: string): ServerConfig {
  const path = configPath ?? resolve(__dirname, "..", "conf", "config.yaml");
  if (!existsSync(path)) return DEFAULT_CONFIG;

  try {
    const raw = readFileSync(path, "utf-8");
    return { adapter: { mock_mode: parseMockMode(raw) } };
  } catch {
    return DEFAULT_CONFIG;
  }
}
