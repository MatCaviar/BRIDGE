// Auto-generated mock adapter — returns safe defaults for testing
import type { IAdapter, SetTemperatureResult, SetFanSpeedResult, ToggleAcResult, ReadCabinTemperatureResult, DefrostFrontResult, OpenWindowResult, CloseWindowResult, ReadAirQualityResult, SetSeatVentilationResult } from "./types.js";

export interface MockAdapterState {
  readonly pageStack: readonly string[];
  readonly gearStatus: string;
  readonly isLoading: boolean;
  readonly activeToast: string | null;
}

export interface MockAdapterControl {
  setError(method: string, error: Error | null): void;
  setGearStatus(status: string): void;
  getMockState(): MockAdapterState;
  resetState(): void;
  setLoading(value: boolean): void;
  showToast(message: string): void;
  dismissToast(): void;
  subscribeGearChange(listener: (gear: string) => void): void;
  unsubscribeGearChange(listener: (gear: string) => void): void;
}

function frozen<T>(obj: T): T {
  return Object.freeze(structuredClone(obj)) as T;
}

export function createMockAdapter(): { adapter: IAdapter; control: MockAdapterControl } {
  const errors = new Map<string, Error>();
  let mockIdCounter = 0;
  function nextMockId(): string {
    mockIdCounter += 1;
    return `mock-${mockIdCounter}`;
  }
  const gearListeners = new Set<(gear: string) => void>();
  function notifyGearChange(gear: string): void {
    for (const fn of gearListeners) { fn(gear); }
  }

  let state: MockAdapterState = {
    pageStack: ["home"],
    gearStatus: "P",
    isLoading: false,
    activeToast: null,
  };

  function checkError(method: string): void {
    const err = errors.get(method);
    if (err) throw err;
  }

  const adapter: IAdapter = {
    isMock: true,

    async setTemperature(value: number, unit?: string): Promise<SetTemperatureResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("setTemperature");
      return frozen<SetTemperatureResult>({ success: true, currentTemp: "", targetTemp: "" } as SetTemperatureResult);
    },

    async setFanSpeed(speed: number, zone: string): Promise<SetFanSpeedResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("setFanSpeed");
      return frozen<SetFanSpeedResult>({ success: true, currentSpeed: "", zone: "" } as SetFanSpeedResult);
    },

    async toggleAc(enabled: boolean): Promise<ToggleAcResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("toggleAc");
      return frozen<ToggleAcResult>({ success: true, isActive: false } as ToggleAcResult);
    },

    async readCabinTemperature(): Promise<ReadCabinTemperatureResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("readCabinTemperature");
      return frozen<ReadCabinTemperatureResult>({ success: true, temperature: "", humidity: "" } as ReadCabinTemperatureResult);
    },

    async defrostWindshield(intensity: string): Promise<DefrostFrontResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("defrostWindshield");
      return frozen<DefrostFrontResult>({ success: true, intensity: "", estimated_time: "" } as DefrostFrontResult);
    },

    async openWindow(position: string, percentage: number): Promise<OpenWindowResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("openWindow");
      return frozen<OpenWindowResult>({ success: true, currentPosition: "", percentage: "" } as OpenWindowResult);
    },

    async closeWindow(position: string): Promise<CloseWindowResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("closeWindow");
      return frozen<CloseWindowResult>({ success: true, currentPosition: "", percentage: "" } as CloseWindowResult);
    },

    async readAqi(): Promise<ReadAirQualityResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("readAqi");
      return frozen<ReadAirQualityResult>({ success: true, pm25: "", pm10: "", aqi_level: "" } as ReadAirQualityResult);
    },

    async setVentilation(seat: string, level: number, enabled?: boolean): Promise<SetSeatVentilationResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("setVentilation");
      return frozen<SetSeatVentilationResult>({ success: true, currentLevel: "", seat: "" } as SetSeatVentilationResult);
    },
  };

  const control: MockAdapterControl = {
    setError(method: string, error: Error | null): void {
      if (error === null) { errors.delete(method); }
      else { errors.set(method, error); }
    },
    setGearStatus(status: string): void {
      state = { ...state, gearStatus: status };
      notifyGearChange(status);
    },
    getMockState(): MockAdapterState {
      return frozen(state);
    },
    resetState(): void {
      errors.clear();
      gearListeners.clear();
      mockIdCounter = 0;
      state = {
        pageStack: ["home"],
        gearStatus: "P",
        isLoading: false,
        activeToast: null,
      };
    },
    setLoading(value: boolean): void {
      state = { ...state, isLoading: value };
    },
    showToast(message: string): void {
      state = { ...state, activeToast: message };
    },
    dismissToast(): void {
      state = { ...state, activeToast: null };
    },
    subscribeGearChange(listener: (gear: string) => void): void {
      gearListeners.add(listener);
    },
    unsubscribeGearChange(listener: (gear: string) => void): void {
      gearListeners.delete(listener);
    },
  };

  return { adapter, control };
}

