// Auto-generated mock adapter — returns safe defaults for testing
import type { IAdapter, SoundstageReadResult, SoundstageSetResult, VncStatusReadResult, VncStatusSetResult, EqualizerReadResult, EqualizerPresetSetResult, EqualizerCustomSetResult, EqualizerCustomSaveResult, BeosonicReadResult, BeosonicPresetSetResult, LocksoundReadResult, LocksoundEnableResult, LocksoundDisableResult, KaraokeReadResult, KaraokeModeSetResult, CarinfoReadResult, AppstatusReadResult, LaunchAppResult } from "./types.js";

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

    async readSoundStage(): Promise<SoundstageReadResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("readSoundStage");
      return frozen<SoundstageReadResult>({ success: true, mode: "", fade: 0, balance: 0, vncEnabled: true, isAtmosPlaying: false } as SoundstageReadResult);
    },

    async setSoundStage(mode: number, fade?: number, balance?: number): Promise<SoundstageSetResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("setSoundStage");
      return frozen<SoundstageSetResult>({ success: true, mode: "", fade: 0, balance: 0 } as SoundstageSetResult);
    },

    async readVncStatus(): Promise<VncStatusReadResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("readVncStatus");
      return frozen<VncStatusReadResult>({ success: true, enabled: true, status: "" } as VncStatusReadResult);
    },

    async setVncStatus(enabled: boolean): Promise<VncStatusSetResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("setVncStatus");
      return frozen<VncStatusSetResult>({ success: true, enabled: true } as VncStatusSetResult);
    },

    async readEqualizer(): Promise<EqualizerReadResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("readEqualizer");
      return frozen<EqualizerReadResult>({ success: true, _type: "", officialType: "", customEffectId: nextMockId(), customValues: "" } as EqualizerReadResult);
    },

    async setEqualizerPreset(preset: string): Promise<EqualizerPresetSetResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("setEqualizerPreset");
      return frozen<EqualizerPresetSetResult>({ success: true, officialType: "" } as EqualizerPresetSetResult);
    },

    async setCustomEqualizer(effectId: string, values: string): Promise<EqualizerCustomSetResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("setCustomEqualizer");
      return frozen<EqualizerCustomSetResult>({ success: true, effectId: nextMockId() } as EqualizerCustomSetResult);
    },

    async saveCustomEqualizer(name: string, values: string): Promise<EqualizerCustomSaveResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("saveCustomEqualizer");
      return frozen<EqualizerCustomSaveResult>({ success: true, effectId: nextMockId(), name: "test" } as EqualizerCustomSaveResult);
    },

    async readBeosonic(): Promise<BeosonicReadResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("readBeosonic");
      return frozen<BeosonicReadResult>({ success: true, enabled: true, preset: "", x: 0, y: 0 } as BeosonicReadResult);
    },

    async setBeosonicPreset(x: number, y: number, z?: number): Promise<BeosonicPresetSetResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("setBeosonicPreset");
      return frozen<BeosonicPresetSetResult>({ success: true, x: 0, y: 0, z: 0 } as BeosonicPresetSetResult);
    },

    async readLockSound(): Promise<LocksoundReadResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("readLockSound");
      return frozen<LocksoundReadResult>({ success: true, enabled: true, resourceCode: 0, resourceName: "test", soundType: "" } as LocksoundReadResult);
    },

    async enableLockSound(resourceCode: string): Promise<LocksoundEnableResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("enableLockSound");
      return frozen<LocksoundEnableResult>({ success: true, enabled: true, resourceCode: 0 } as LocksoundEnableResult);
    },

    async disableLockSound(): Promise<LocksoundDisableResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("disableLockSound");
      return frozen<LocksoundDisableResult>({ success: true, enabled: true } as LocksoundDisableResult);
    },

    async readKaraoke(): Promise<KaraokeReadResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("readKaraoke");
      return frozen<KaraokeReadResult>({ success: true, enabled: true, mode: "", micVolume: "", mediaVolume: "" } as KaraokeReadResult);
    },

    async setKaraokeMode(mode: number): Promise<KaraokeModeSetResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("setKaraokeMode");
      return frozen<KaraokeModeSetResult>({ success: true, mode: "" } as KaraokeModeSetResult);
    },

    async readCarInfo(): Promise<CarinfoReadResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("readCarInfo");
      return frozen<CarinfoReadResult>({ success: true, vin: "", model: "" } as CarinfoReadResult);
    },

    async readAppStatus(): Promise<AppstatusReadResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("readAppStatus");
      return frozen<AppstatusReadResult>({ success: true, isPageActive: false, currentDisplayName: "test", theme: "" } as AppstatusReadResult);
    },

    async launchApp(appName: string): Promise<LaunchAppResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("launchApp");
      return frozen<LaunchAppResult>({ success: true, targetPageId: "mock-page-0001", appName } as LaunchAppResult);
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

