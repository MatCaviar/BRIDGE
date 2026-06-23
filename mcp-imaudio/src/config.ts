import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

export interface AdbConfig {
  readonly path: string;       // 解析后的绝对路径
  readonly use_host: boolean;
  readonly timeout_ms: number;
}

export interface ServerConfig {
  readonly adapter: {
    readonly mock_mode: boolean;
  };
  readonly adb: AdbConfig;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseMockMode(yaml: string): boolean {
  const m = yaml.match(/adapter:[\s\S]*?mock_mode:\s*(\w+)/);
  return m && m[1] ? m[1] !== "false" : true;
}

function parseAdb(yaml: string): AdbConfig {
  const DEFAULT_PATH = resolve(__dirname, "..", "..", "tools", "adb", "adb.exe");
  const pathMatch = yaml.match(/adb:[\s\S]*?path:\s*["']?([^"'\n]+)["']?/);
  const hostMatch = yaml.match(/adb:[\s\S]*?use_host:\s*(\w+)/);
  const timeoutMatch = yaml.match(/adb:[\s\S]*?timeout_ms:\s*(\d+)/);
  const rawPath = pathMatch && pathMatch[1] ? pathMatch[1].trim() : DEFAULT_PATH;
  // 相对路径基于 conf/ 目录解析为绝对路径（不依赖运行时 cwd）
  const absPath = resolve(__dirname, "..", "conf", rawPath);
  return {
    path: absPath,
    use_host: hostMatch && hostMatch[1] ? hostMatch[1] !== "false" : true,
    timeout_ms: timeoutMatch && timeoutMatch[1] ? parseInt(timeoutMatch[1], 10) : 10000,
  };
}

export function readConfig(configPath?: string): ServerConfig {
  const path = configPath ?? resolve(__dirname, "..", "conf", "config.yaml");
  if (!existsSync(path)) {
    return {
      adapter: { mock_mode: true },
      adb: { path: resolve(__dirname, "..", "..", "tools", "adb", "adb.exe"), use_host: true, timeout_ms: 10000 },
    };
  }
  try {
    const raw = readFileSync(path, "utf-8");
    return { adapter: { mock_mode: parseMockMode(raw) }, adb: parseAdb(raw) };
  } catch {
    return {
      adapter: { mock_mode: true },
      adb: { path: resolve(__dirname, "..", "..", "tools", "adb", "adb.exe"), use_host: true, timeout_ms: 10000 },
    };
  }
}
