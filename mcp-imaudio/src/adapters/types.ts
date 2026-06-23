// Auto-generated adapter interface — derived from analysis.json capabilities
// IAdapter is the contract between tool handlers and platform SDKs

export interface SoundstageReadResult {
  readonly success: boolean;
  readonly mode: string;
  readonly fade: number;
  readonly balance: number;
  readonly vncEnabled: boolean;
  readonly isAtmosPlaying: boolean;
}

export interface SoundstageSetResult {
  readonly success: boolean;
  readonly mode: string;
  readonly fade: number;
  readonly balance: number;
}

export interface VncStatusReadResult {
  readonly success: boolean;
  readonly enabled: boolean;
  readonly status: string;
}

export interface VncStatusSetResult {
  readonly success: boolean;
  readonly enabled: boolean;
}

export interface EqualizerReadResult {
  readonly success: boolean;
  readonly _type: string;
  readonly officialType: string;
  readonly customEffectId: string;
  readonly customValues: string;
}

export interface EqualizerPresetSetResult {
  readonly success: boolean;
  readonly officialType: string;
}

export interface EqualizerCustomSetResult {
  readonly success: boolean;
  readonly effectId: string;
}

export interface EqualizerCustomSaveResult {
  readonly success: boolean;
  readonly effectId: string;
  readonly name: string;
}

export interface BeosonicReadResult {
  readonly success: boolean;
  readonly enabled: boolean;
  readonly preset: string;
  readonly x: number;
  readonly y: number;
}

export interface BeosonicPresetSetResult {
  readonly success: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface LocksoundReadResult {
  readonly success: boolean;
  readonly enabled: boolean;
  readonly resourceCode: number;
  readonly resourceName: string;
  readonly soundType: string;
}

export interface LocksoundEnableResult {
  readonly success: boolean;
  readonly enabled: boolean;
  readonly resourceCode: number;
}

export interface LocksoundDisableResult {
  readonly success: boolean;
  readonly enabled: boolean;
}

export interface KaraokeReadResult {
  readonly success: boolean;
  readonly enabled: boolean;
  readonly mode: string;
  readonly micVolume: string;
  readonly mediaVolume: string;
}

export interface KaraokeModeSetResult {
  readonly success: boolean;
  readonly mode: string;
}

export interface CarinfoReadResult {
  readonly success: boolean;
  readonly vin: string;
  readonly model: string;
}

export interface AppstatusReadResult {
  readonly success: boolean;
  readonly isPageActive: boolean;
  readonly currentDisplayName: string;
  readonly theme: string;
}

export interface LaunchAppResult {
  readonly success: boolean;
  readonly targetPageId: string;
  readonly appName: string;
}

export interface IAdapter {
  readonly isMock: boolean;

  readSoundStage(): Promise<SoundstageReadResult>;
  setSoundStage(mode: number, fade?: number, balance?: number): Promise<SoundstageSetResult>;
  readVncStatus(): Promise<VncStatusReadResult>;
  setVncStatus(enabled: boolean): Promise<VncStatusSetResult>;
  readEqualizer(): Promise<EqualizerReadResult>;
  setEqualizerPreset(preset: string): Promise<EqualizerPresetSetResult>;
  setCustomEqualizer(effectId: string, values: string): Promise<EqualizerCustomSetResult>;
  saveCustomEqualizer(name: string, values: string): Promise<EqualizerCustomSaveResult>;
  readBeosonic(): Promise<BeosonicReadResult>;
  setBeosonicPreset(x: number, y: number, z?: number): Promise<BeosonicPresetSetResult>;
  readLockSound(): Promise<LocksoundReadResult>;
  enableLockSound(resourceCode: string): Promise<LocksoundEnableResult>;
  disableLockSound(): Promise<LocksoundDisableResult>;
  readKaraoke(): Promise<KaraokeReadResult>;
  setKaraokeMode(mode: number): Promise<KaraokeModeSetResult>;
  readCarInfo(): Promise<CarinfoReadResult>;
  readAppStatus(): Promise<AppstatusReadResult>;
  launchApp(appName: string): Promise<LaunchAppResult>;
}

