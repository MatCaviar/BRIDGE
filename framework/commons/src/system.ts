/**
 * System SDK patterns for YunOS HDT apps.
 * Shared across all MCP Server adapters.
 *
 * SDK module: sysprop/sysprop
 */

export interface SystemInfo {
  readonly themeStyle: string;
  readonly ignoreMode: boolean;
}

/**
 * Create system property readers.
 *
 * SDK: sysprop.get(key) for reading persistent system properties
 */
export function createSystemOps(getSysprop: (key: string) => string): {
  getSystemInfo(): SystemInfo;
} {
  return {
    getSystemInfo(): SystemInfo {
      const themeStyle = getSysprop("persist.sys.ui.themeStyle") || "default";
      const ignoreModeRaw = getSysprop("persist.sys.pr.igonreMode");
      const ignoreMode = ignoreModeRaw === "true" || ignoreModeRaw === "1";
      return { themeStyle, ignoreMode };
    },
  };
}
