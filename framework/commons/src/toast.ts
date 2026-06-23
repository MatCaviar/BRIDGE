/**
 * Toast notification SDK pattern for YunOS HDT apps.
 * Shared across all MCP Server adapters.
 *
 * SDK module: yunos/ui/widget/Toast
 */

/**
 * Create a toast notification operation.
 *
 * SDK: new Toast() → setText → setDockAlign → show()
 *
 * @param showToast - Platform toast display function
 */
export function createToastOps(showToast: (text: string, duration: number) => void): {
  show(text: string, duration?: number): void;
} {
  return {
    show(text: string, duration: number = 2000): void {
      if (!text || text.trim().length === 0) {
        throw new Error("Toast text must not be empty");
      }
      showToast(text, duration);
    },
  };
}
