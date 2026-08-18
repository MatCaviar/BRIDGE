export type SafetyLevel = string;

export class SafetyGuardError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "SafetyGuardError";
  }
}

interface GearStatus {
  readonly isParked: boolean;
  readonly ignoreMode: boolean;
}

interface HotspotInfo {
  readonly ssid: string | null;
}

export interface SafetyAdapter {
  getGearStatus(): Promise<GearStatus>;
  getHotspotInfo(): Promise<HotspotInfo>;
}

/** A declared precondition for a safety level. Composable — a level can require any combination of
 *  gear/confirm/hotspot. This is the data-driven rule set: apps declare custom levels (or override a
 *  standard one) in analysis.safetyRules without touching framework code. */
export interface SafetyRule {
  readonly requiresGear?: boolean;
  readonly requiresHotspot?: boolean;
  readonly requiresConfirm?: boolean;
  readonly description?: string;
}

export type SafetyRules = Readonly<Record<string, SafetyRule>>;

/** Built-in rules for the 5 standard levels — same behavior as the old fixed switch, so existing
 *  apps keep working unchanged. Apps extend/override via analysis.safetyRules. */
export const BUILTIN_SAFETY_RULES: SafetyRules = {
  readonly: {},
  normal: {},
  p_gear_required: { requiresGear: true, description: "P-gear required" },
  p_gear_and_confirm: { requiresGear: true, requiresConfirm: true, description: "P-gear + user confirmation" },
  p_gear_and_network: { requiresGear: true, requiresHotspot: true, description: "P-gear + WiFi hotspot" },
};

/** Merge app-declared rules over the built-ins. An app can override a standard level (e.g. weaken
 *  p_gear_and_confirm to drop the hotspot check) or add custom levels (e.g. door_locked, speed_limited). */
export function resolveSafetyRules(appRules?: SafetyRules): SafetyRules {
  return appRules ? { ...BUILTIN_SAFETY_RULES, ...appRules } : BUILTIN_SAFETY_RULES;
}

export function createSafetyGuard(adapter: SafetyAdapter, rules: SafetyRules = BUILTIN_SAFETY_RULES) {
  async function assertParked(): Promise<void> {
    const status = await adapter.getGearStatus();
    if (!status.isParked && !status.ignoreMode) {
      throw new SafetyGuardError(4001, "Vehicle not in P-gear");
    }
  }

  function assertConfirmed(input: Record<string, unknown>): void {
    if (input["confirmed"] !== true) {
      throw new SafetyGuardError(3004, "User confirmation required");
    }
  }

  async function assertHotspotAvailable(): Promise<void> {
    const info = await adapter.getHotspotInfo();
    if (info.ssid === null) {
      throw new SafetyGuardError(5001, "WiFi hotspot not active");
    }
  }

  return async function enforce(level: SafetyLevel, input: Record<string, unknown>): Promise<void> {
    const rule = rules[level];
    if (!rule) {
      throw new SafetyGuardError(1000, `Unknown safety level: ${String(level)}`);
    }
    if (rule.requiresGear) await assertParked();
    if (rule.requiresConfirm) assertConfirmed(input);
    if (rule.requiresHotspot) await assertHotspotAvailable();
  };
}
