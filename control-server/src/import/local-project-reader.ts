import { readFile, readdir, stat } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import type { ImportFile } from "./workspace-manager.js";

const SOURCE_EXTENSIONS = new Set([".aidl", ".c", ".cc", ".cpp", ".gradle", ".h", ".hpp", ".java", ".json", ".kt", ".kts", ".md", ".properties", ".toml", ".ts", ".tsx", ".xml", ".yaml", ".yml"]);
const SOURCE_NAMES = new Set(["android.bp", "gradlew"]);
const SKIP = new Set([".git", ".gradle", ".idea", "build", "coverage", "dist", "node_modules"]);

function extension(name: string): string { const index = name.lastIndexOf("."); return index < 0 ? "" : name.slice(index).toLowerCase(); }

export function parseTargetSchema(raw: string): Record<string, unknown> {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("Target schema is empty");
  try {
    const value = JSON.parse(text) as unknown;
    if (Array.isArray(value)) return { format: "mcp-tool-list", tools: value };
    if (value && typeof value === "object") return value as Record<string, unknown>;
  } catch { /* parse adjacent objects below */ }
  const tools: unknown[] = [];
  let offset = 0;
  while (offset < text.length) {
    while (/[\s,]/.test(text[offset] ?? "")) offset += 1;
    if (offset >= text.length) break;
    if (text[offset] !== "{" && text[offset] !== "[") throw new Error(`Invalid target schema at offset ${offset}`);
    const stack: string[] = [text[offset]!]; let quoted = false; let escaped = false; let end = -1;
    for (let index = offset + 1; index < text.length; index += 1) {
      const char = text[index]!;
      if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; continue; }
      if (char === '"') quoted = true;
      else if (char === "{" || char === "[") stack.push(char);
      else if (char === "}" || char === "]") { stack.pop(); if (!stack.length) { end = index + 1; break; } }
    }
    if (end < 0) throw new Error(`Unterminated target schema at offset ${offset}`);
    tools.push(JSON.parse(text.slice(offset, end)));
    offset = end;
  }
  if (!tools.length) throw new Error("Target schema must contain a JSON object");
  return tools.length === 1 && tools[0] && typeof tools[0] === "object" && !Array.isArray(tools[0]) ? tools[0] as Record<string, unknown> : { format: "mcp-tool-list", tools };
}

export async function readLocalSource(sourceDirectory: string): Promise<ImportFile[]> {
  const root = resolve(sourceDirectory);
  if (!(await stat(root)).isDirectory()) throw new Error(`Source directory does not exist: ${root}`);
  const files: ImportFile[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || SKIP.has(entry.name.toLowerCase())) continue;
      const full = resolve(directory, entry.name);
      if (entry.isDirectory()) { await visit(full); continue; }
      const name = basename(full).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(extension(name)) && !SOURCE_NAMES.has(name)) continue;
      files.push({ path: relative(root, full).replaceAll("\\", "/"), contentBase64: (await readFile(full)).toString("base64") });
    }
  }
  await visit(root);
  if (!files.length) throw new Error("Source directory contains no supported source files");
  return files;
}
