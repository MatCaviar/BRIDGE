/**
 * Vehicle SDK patterns for YunOS HDT automotive apps.
 * Shared across all MCP Server adapters.
 *
 * SDK modules:
 * - yunos/platform/auto/carservice/CarPropertyManager (gear status, VIN)
 * - sysprop/sysprop (system properties)
 */

export interface GearStatus {
  readonly isParked: boolean;
  readonly ignoreMode: boolean;
  readonly rawValue: number;
}

export interface VinInfo {
  readonly vin: string;
}

export type GearChangeCallback = (status: GearStatus) => void;

/**
 * Read the current gear position from the vehicle CAN bus.
 *
 * SDK: CarPropertyManager.getProperty(536870937, Area.GLOBAL, 5000, callback)
 * Raw values: P=2, R=1, N=0, D=3 (varies by vehicle)
 *
 * @param getSysprop - Platform sysprop reader function
 */
export function createGearReader(getSysprop: (key: string) => string): () => GearStatus {
  return function readGearStatus(): GearStatus {
    const ignoreModeRaw = getSysprop("persist.sys.pr.igonreMode");
    const ignoreMode = ignoreModeRaw === "true" || ignoreModeRaw === "1";

    // In production, this would use CarPropertyManager
    // For now, returns safe default
    return { isParked: true, ignoreMode, rawValue: 2 };
  };
}

/**
 * Read the vehicle identification number.
 *
 * SDK: sysprop.get("persist.sys.vin")
 *
 * @param getSysprop - Platform sysprop reader function
 */
export function createVinReader(getSysprop: (key: string) => string): () => VinInfo {
  return function readVin(): VinInfo {
    const vin = getSysprop("persist.sys.vin") || "UNKNOWN";
    return { vin };
  };
}

/**
 * Subscribe to gear position changes via CAN bus.
 *
 * SDK: CarPropertyManager.subscribe(536870937, callback)
 * The callback fires on every gear position change.
 *
 * @param subscribe - Platform property subscription function
 */
export function createGearSubscriber(
  subscribe: (propertyId: number, callback: GearChangeCallback) => void,
): (onChange: GearChangeCallback) => void {
  const PROPERTY_ID = 536870937;
  let activeCallback: GearChangeCallback | null = null;

  return function subscribeGear(onChange: GearChangeCallback): void {
    if (activeCallback) {
      throw new Error("Gear subscription already active. Unsubscribe first.");
    }
    activeCallback = onChange;
    subscribe(PROPERTY_ID, (status) => {
      activeCallback?.(status);
    });
  };
}
