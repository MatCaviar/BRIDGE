export type SafetyLevel =
  | "readonly"
  | "normal"
  | "p_gear_required"
  | "p_gear_and_confirm"
  | "p_gear_and_network";

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

export function createSafetyGuard(adapter: SafetyAdapter) {
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
    switch (level) {
      case "readonly":
      case "normal":
        return;
      case "p_gear_required":
        await assertParked();
        return;
      case "p_gear_and_confirm":
        await assertParked();
        assertConfirmed(input);
        return;
      case "p_gear_and_network":
        await assertParked();
        await assertHotspotAvailable();
        return;
      default: {
        const _exhaustive: never = level;
        throw new SafetyGuardError(1000, `Unknown safety level: ${String(level)}`);
      }
    }
  };
}
