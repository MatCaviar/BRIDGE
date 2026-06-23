/**
 * Navigation SDK patterns for YunOS HDT apps.
 * Shared across all MCP Server adapters.
 *
 * SDK module: yunos/appmodel/StackRouter
 */

export interface NavigationState {
  readonly currentPage: string;
  readonly stackDepth: number;
  readonly stack: readonly string[];
}

export interface PageLinkInfo {
  readonly targetDisplayName: string;
}

/**
 * Create navigation operations using YunOS StackRouter.
 *
 * SDK: yunos/appmodel/StackRouter
 * Methods: router.navigate(routeName), router.back(), router.getLength()
 *
 * In production, these call the real StackRouter.
 * In mock/test, these operate on an in-memory stack.
 */
export function createNavigationOps(router: {
  navigate(routeName: string): Promise<void>;
  back(): Promise<void>;
  getLength(): number;
}) {
  return {
    async navigateTo(routeName: string): Promise<NavigationState> {
      await router.navigate(routeName);
      const depth = router.getLength();
      return { currentPage: routeName, stackDepth: depth, stack: [] };
    },

    async goBack(): Promise<NavigationState> {
      await router.back();
      const depth = router.getLength();
      return { currentPage: "", stackDepth: depth, stack: [] };
    },

    getStackDepth(): number {
      return router.getLength();
    },
  };
}

/**
 * Cross-screen navigation via PageLink.
 *
 * SDK: yunos/page/PageLink
 * Property: PageLink.targetDisplayName
 */
export function createCrossScreenOps(pageLink: {
  getTargetDisplay(): string;
}) {
  return {
    getTargetDisplay(): string {
      return pageLink.getTargetDisplay();
    },
  };
}
