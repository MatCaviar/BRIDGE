import type { IAdapter } from "./types.js";
import type { MockAdapterControl } from "./mock-adapter.js";
import { createMockAdapter } from "./mock-adapter.js";
import type { ServerConfig } from "../config.js";

export type { IAdapter } from "./types.js";
export type { MockAdapterControl } from "./mock-adapter.js";
export type * from "./types.js";

export function createAdapter(config: ServerConfig): { adapter: IAdapter; control: MockAdapterControl | null } {
  if (config.adapter.mock_mode) {
    const { adapter, control } = createMockAdapter();
    return { adapter, control };
  }
  throw new Error("YunOS adapter not yet generated. Run /mcp-generate to implement it.");
}
