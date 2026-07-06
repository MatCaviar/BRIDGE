import { isAbsolute, relative, resolve } from "node:path";

// `safeProjectId` lives in workbench-contracts so the UI and control-server share one definition
// and always compute the identical `mcp-<app>` / deploy-target path. Re-exported here so existing
// `from "../security/paths.js"` imports keep working.
export { safeProjectId } from "@bridge/workbench-contracts";

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
