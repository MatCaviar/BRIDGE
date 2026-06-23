/**
 * Loading overlay SDK pattern for YunOS HDT apps.
 * Shared across all MCP Server adapters.
 *
 * SDK module: yunos/ui/animation/PropertyAnimation (rotating spinner)
 */

/**
 * Create loading overlay operations.
 *
 * SDK: PropertyAnimation for rotating spinner overlay
 *
 * @param showLoading - Platform loading show function
 * @param hideLoading - Platform loading hide function
 */
export function createLoadingOps(
  showLoading: (text?: string) => void,
  hideLoading: () => void,
): {
  show(text?: string): void;
  hide(): void;
} {
  let isVisible = false;

  return {
    show(text?: string): void {
      if (isVisible) return;
      isVisible = true;
      showLoading(text);
    },

    hide(): void {
      if (!isVisible) return;
      isVisible = false;
      hideLoading();
    },
  };
}
