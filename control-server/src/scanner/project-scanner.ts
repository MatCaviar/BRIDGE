import type { SourceIndex, SourceNode } from "@bridge/workbench-contracts";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { extractTypeScript } from "./typescript-extractor.js";

const SKIP = new Set(["node_modules", ".git", ".gradle", ".idea", "build", "dist", "coverage", ".workbench-runtime"]);
const TEXT_EXTENSIONS = new Set([".aidl", ".c", ".cc", ".cpp", ".gradle", ".h", ".hpp", ".java", ".json", ".kt", ".kts", ".md", ".properties", ".toml", ".ts", ".tsx", ".js", ".jsx", ".xml", ".yaml", ".yml"]);
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_NODES = 10_000;

export type ProjectScan = SourceIndex;

function extension(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index).toLowerCase();
}

export async function scanProject(projectRoot: string): Promise<ProjectScan> {
  const root = resolve(projectRoot);
  const nodes: SourceNode[] = [];
  const edges: SourceIndex["edges"][number][] = [];
  const evidence: SourceIndex["evidence"][number][] = [];
  const findings: string[] = [];

  async function visit(directory: string, parentId?: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (nodes.length >= MAX_NODES) return;
      if (SKIP.has(entry.name) || entry.isSymbolicLink()) continue;
      const full = resolve(directory, entry.name);
      const path = relative(root, full).replaceAll("\\", "/");
      const id = `source:${path}`;
      if (entry.isDirectory()) {
        nodes.push({ id, path, kind: "directory", label: entry.name, parentId });
        await visit(full, id);
        continue;
      }
      nodes.push({ id, path, kind: "file", label: basename(path), parentId });
      if (!TEXT_EXTENSIONS.has(extension(path))) continue;
      let source = "";
      try { if ((await stat(full)).size > MAX_TEXT_BYTES) continue; source = await readFile(full, "utf8"); } catch { continue; }
      const ext = extension(path);
      const patterns: [RegExp, SourceNode["symbolKind"]][] = [];
      if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
        const extracted = extractTypeScript(path, source, id);
        nodes.push(...extracted.nodes);
        edges.push(...extracted.edges);
        evidence.push(...extracted.evidence);
      }
      if ([".kt", ".kts"].includes(ext)) patterns.push(
        [/\b(?:data\s+|sealed\s+|open\s+|abstract\s+)?(?:class|interface|object)\s+([A-Za-z_$][\w$]*)/g, "class"],
        [/\b(?:override\s+)?(?:suspend\s+)?fun\s+([A-Za-z_$][\w$]*)\s*\(/g, "method"],
      );
      if ([".java", ".aidl"].includes(ext)) patterns.push(
        [/\b(?:class|interface|enum)\s+([A-Za-z_$][\w$]*)/g, "class"],
        [/\b(?:public\s+|protected\s+|private\s+|static\s+|abstract\s+)*(?:void|boolean|byte|short|int|long|float|double|char|String|[A-Za-z_$][\w$<>?.]*)\s+([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?:;|\{)/g, "method"],
      );
      const seen = new Set<string>();
      for (const [pattern, symbolKind] of patterns) {
        for (const match of source.matchAll(pattern)) {
          const label = match[1];
          if (!label || seen.has(`${symbolKind}:${label}`)) continue;
          seen.add(`${symbolKind}:${label}`);
          nodes.push({ id: `${id}:${symbolKind}:${label}`, path, kind: "symbol", label, parentId: id, symbolKind });
          if (nodes.length >= MAX_NODES) return;
        }
      }
    }
  }

  await visit(root);
  return { version: 1, nodes, edges, evidence, findings };
}
