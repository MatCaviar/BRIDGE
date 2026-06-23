/**
 * Display SDK patterns for YunOS HDT apps.
 * Shared across all MCP Server adapters.
 *
 * SDK modules:
 * - yunos/ui/view/Window (screen dimensions)
 * - BMPage (page lifecycle)
 */

export interface ScreenInfo {
  readonly width: number;
  readonly height: number;
  readonly isDualScreen: boolean;
}

export interface ThemeInfo {
  readonly style: string;
  readonly tint: string;
}

/**
 * Create display info readers.
 *
 * SDK: yunos/ui/view/Window — Window.width, Window.height
 * SDK: sysprop — persist.sys.ui.themeStyle
 */
export function createDisplayOps(window: {
  readonly width: number;
  readonly height: number;
}, getSysprop: (key: string) => string): {
  getScreenInfo(): ScreenInfo;
  getThemeInfo(): ThemeInfo;
} {
  return {
    getScreenInfo(): ScreenInfo {
      return {
        width: window.width,
        height: window.height,
        isDualScreen: window.width > window.height * 1.5,
      };
    },

    getThemeInfo(): ThemeInfo {
      const style = getSysprop("persist.sys.ui.themeStyle") || "default";
      return { style, tint: "" };
    },
  };
}
