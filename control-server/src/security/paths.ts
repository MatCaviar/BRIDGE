import { isAbsolute, relative, resolve } from "node:path";

export function assertContained(root: string, relativePath: string): string {
  if (
    !relativePath
    || relativePath.includes("\0")
    || isAbsolute(relativePath)
    || /^[A-Za-z]:/.test(relativePath)
  ) {
    throw new Error(`Unsafe import path: ${relativePath}`);
  }
  const candidate = resolve(root, relativePath);
  const rel = relative(root, candidate);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Unsafe import path: ${relativePath}`);
  }
  return candidate;
}

export function safeProjectId(name: string): string {
  const slug = name.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (slug || "project").slice(0, 48);
}
