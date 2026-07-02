import type { SourceNode } from "@bridge/workbench-contracts";
import { readdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

const SKIP = new Set(["node_modules", ".git", "dist", "coverage", ".workbench-runtime"]);
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".yaml", ".yml"]);

export interface ProjectScan {
  readonly nodes: readonly SourceNode[];
}

function extension(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index).toLowerCase();
}

export async function scanProject(projectRoot: string): Promise<ProjectScan> {
  const root = resolve(projectRoot);
  const nodes: SourceNode[] = [];

  async function visit(directory: string, parentId?: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
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
      try { source = await readFile(full, "utf8"); } catch { continue; }
      const patterns: readonly [RegExp, SourceNode["symbolKind"]][] = [
        [/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, "function"],
        [/\bexport\s+class\s+([A-Za-z_$][\w$]*)/g, "class"],
        [/\bimport[\s\S]*?from\s+["']([^"']+)["']/g, "import"],
      ];
      for (const [pattern, symbolKind] of patterns) {
        for (const match of source.matchAll(pattern)) {
          const label = match[1];
          nodes.push({ id: `${id}:${symbolKind}:${label}`, path, kind: "symbol", label, parentId: id, symbolKind });
        }
      }
    }
  }

  await visit(root);
  return { nodes };
}
