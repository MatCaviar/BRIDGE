// Auto-generated tool registry — do not edit manually
// Derived from analysis.json capabilities

export type SafetyLevel =
  | "readonly"
  | "normal"
  | "p_gear_required"
  | "p_gear_and_confirm"
  | "p_gear_and_network";

export interface ToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

export interface ToolRegistryEntry {
  readonly id: string;
  readonly domain: string;
  readonly object: string;
  readonly action: string;
  readonly safetyLevel: SafetyLevel;
  readonly sdkCalls: readonly string[];
  readonly sourceRef: string;
}

export function safetyToAnnotations(level: SafetyLevel): ToolAnnotations {
  switch (level) {
    case "readonly": return { readOnlyHint: true, idempotentHint: true };
    case "normal": return {};
    case "p_gear_required": return { destructiveHint: true };
    case "p_gear_and_confirm": return { destructiveHint: true };
    case "p_gear_and_network": return { destructiveHint: true, openWorldHint: true };
  }
}

export const TOOL_REGISTRY: readonly ToolRegistryEntry[] = [
  {
    id: "set_temperature",
    domain: "climate",
    object: "temperature",
    action: "set",
    safetyLevel: "normal",
    sdkCalls: ["@system.hvac"],
    sourceRef: "src/services/climate.ts:setTemperature",
  },
  {
    id: "set_fan_speed",
    domain: "climate",
    object: "fan",
    action: "set_speed",
    safetyLevel: "normal",
    sdkCalls: ["@system.hvac"],
    sourceRef: "src/services/climate.ts:setFanSpeed",
  },
  {
    id: "toggle_ac",
    domain: "climate",
    object: "ac",
    action: "toggle",
    safetyLevel: "normal",
    sdkCalls: ["@system.hvac"],
    sourceRef: "src/services/climate.ts:toggleAc",
  },
  {
    id: "read_cabin_temperature",
    domain: "climate",
    object: "cabin",
    action: "read_temperature",
    safetyLevel: "readonly",
    sdkCalls: ["@system.sensor"],
    sourceRef: "src/services/sensor.ts:readCabinTemp",
  },
  {
    id: "defrost_front",
    domain: "climate",
    object: "windshield",
    action: "defrost",
    safetyLevel: "p_gear_required",
    sdkCalls: ["@system.hvac"],
    sourceRef: "src/services/climate.ts:defrostFront",
  },
  {
    id: "open_window",
    domain: "window",
    object: "window",
    action: "open",
    safetyLevel: "normal",
    sdkCalls: ["@system.window"],
    sourceRef: "src/services/window.ts:openWindow",
  },
  {
    id: "close_window",
    domain: "window",
    object: "window",
    action: "close",
    safetyLevel: "normal",
    sdkCalls: ["@system.window"],
    sourceRef: "src/services/window.ts:closeWindow",
  },
  {
    id: "read_air_quality",
    domain: "sensor",
    object: "aqi",
    action: "read",
    safetyLevel: "readonly",
    sdkCalls: ["@system.sensor"],
    sourceRef: "src/services/sensor.ts:readAqi",
  },
  {
    id: "set_seat_ventilation",
    domain: "seat",
    object: "ventilation",
    action: "set",
    safetyLevel: "normal",
    sdkCalls: ["@system.seat"],
    sourceRef: "src/services/seat.ts:setVentilation",
  },
];

export const DOMAINS = [
  "climate",
  "window",
  "sensor",
  "seat",
] as const;

export const TOOL_COUNT = TOOL_REGISTRY.length;

export function getToolMeta(id: string): ToolRegistryEntry | undefined {
  return TOOL_REGISTRY.find(e => e.id === id);
}

export function getToolsByDomain(domain: string): readonly ToolRegistryEntry[] {
  return TOOL_REGISTRY.filter(e => e.domain === domain);
}

export function getToolsByCategory(level: SafetyLevel): readonly ToolRegistryEntry[] {
  return TOOL_REGISTRY.filter(e => e.safetyLevel === level);
}
