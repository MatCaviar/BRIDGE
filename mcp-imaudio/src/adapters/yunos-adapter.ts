import { execute } from "../executors/adb-executor.js";
import { resolvePageUri } from "./app-page-uri.js";
import { rpcCall as defaultRpcCall } from "../rpc/rpc-client.js";
import type { AdbConfig } from "../config.js";
import type { IAdapter, SoundstageReadResult, SoundstageSetResult, VncStatusReadResult, VncStatusSetResult, EqualizerReadResult, EqualizerPresetSetResult, EqualizerCustomSetResult, EqualizerCustomSaveResult, BeosonicReadResult, BeosonicPresetSetResult, LocksoundReadResult, LocksoundEnableResult, LocksoundDisableResult, KaraokeReadResult, KaraokeModeSetResult, CarinfoReadResult, AppstatusReadResult, LaunchAppResult } from "./types.js";

/**
 * YunOS adapter for imaudio
 * Replace each throw with actual YunOS SDK calls.
 */
export function createYunosAdapter(
  adbConfig: AdbConfig,
  rpcFn: (op: string, args: unknown, config: AdbConfig) => Promise<unknown> = defaultRpcCall,
): IAdapter {
  return {
    isMock: false,

    /** SDK: SoundStageManager.getSoundStage | Source: ts/model/SoundStageModel.ts:getSoundStage */
    async readSoundStage(): Promise<SoundstageReadResult> {
      const d = (await rpcFn("soundstage.read", {}, adbConfig)) as { mode?: string; fade?: number; balance?: number };
      return {
        success: true,
        mode: String(d.mode ?? ""),
        fade: Number(d.fade ?? 0),
        balance: Number(d.balance ?? 0),
        vncEnabled: false,       // Phase 1：未组合（Phase 2 加 vnc.read 组合）
        isAtmosPlaying: false,   // Phase 1：未组合（Phase 2 加 isAtmosPlaying 组合）
      } as SoundstageReadResult;
    },

    /** SDK: SoundStageManager.setSoundStage | Source: ts/model/SoundStageModel.ts:setSoundStage */
    async setSoundStage(mode: number, fade?: number, balance?: number): Promise<SoundstageSetResult> {
      await rpcFn("soundstage.set", { mode, fade, balance }, adbConfig);
      return {
        success: true,
        mode: String(mode),
        fade: Number(fade ?? 0),
        balance: Number(balance ?? 0),
      } as SoundstageSetResult;
    },

    /** SDK: SoundStageManager.getSpeedVolumeStatus | Source: ts/model/SoundStageModel.ts:getVNCStatus */
    async readVncStatus(): Promise<VncStatusReadResult> {
      throw new Error("readVncStatus not implemented");
    },

    /** SDK: SoundStageManager.setSpeedVolumeStatus | Source: ts/model/SoundStageModel.ts:setVNCStatus */
    async setVncStatus(enabled: boolean): Promise<VncStatusSetResult> {
      throw new Error("setVncStatus not implemented");
    },

    /** SDK: EqualizerModel.getEffectValues | Source: ts/model/EqualizerModel.ts:getEffectValues */
    async readEqualizer(): Promise<EqualizerReadResult> {
      throw new Error("readEqualizer not implemented");
    },

    /** SDK: EqualizerModel.sendEffectValues | Source: ts/model/EqualizerModel.ts:setEffectValues */
    async setEqualizerPreset(preset: string): Promise<EqualizerPresetSetResult> {
      throw new Error("setEqualizerPreset not implemented");
    },

    /** SDK: EqualizerModel.sendEffectValues | Source: ts/model/EqualizerModel.ts:sendCustomEffectValues */
    async setCustomEqualizer(effectId: string, values: string): Promise<EqualizerCustomSetResult> {
      throw new Error("setCustomEqualizer not implemented");
    },

    /** SDK: EqualizerModel.createAndSaveEffect | Source: ts/model/EqualizerModel.ts:createAndSaveEffect */
    async saveCustomEqualizer(name: string, values: string): Promise<EqualizerCustomSaveResult> {
      throw new Error("saveCustomEqualizer not implemented");
    },

    /** SDK: BeosonicModel.getCurrentValues | Source: ts/model/BeosonicModel.ts:getCurrentValues */
    async readBeosonic(): Promise<BeosonicReadResult> {
      throw new Error("readBeosonic not implemented");
    },

    /** SDK: BeosonicModel.sendEffectValues | Source: ts/model/BeosonicModel.ts:sendEffectValues */
    async setBeosonicPreset(x: number, y: number, z?: number): Promise<BeosonicPresetSetResult> {
      throw new Error("setBeosonicPreset not implemented");
    },

    /** SDK: LockSoundModel.getEffectValues | Source: ts/model/LockSoundModel.ts:getEffectValues */
    async readLockSound(): Promise<LocksoundReadResult> {
      throw new Error("readLockSound not implemented");
    },

    /** SDK: LockSoundModel.sendEffectValues | Source: ts/model/LockSoundModel.ts:setEffectValues */
    async enableLockSound(resourceCode: string): Promise<LocksoundEnableResult> {
      throw new Error("enableLockSound not implemented");
    },

    /** SDK: LockSoundModel.disableLockSound | Source: ts/model/LockSoundModel.ts:disableLockSound */
    async disableLockSound(): Promise<LocksoundDisableResult> {
      throw new Error("disableLockSound not implemented");
    },

    /** SDK: KaraokeModel.getFastAudioMode | Source: ts/model/KaraokeModel.ts:getFastAudioMode */
    async readKaraoke(): Promise<KaraokeReadResult> {
      throw new Error("readKaraoke not implemented");
    },

    /** SDK: KaraokeManager.setFastAudioMode | Source: ts/manager/KaraokeManager.ts:setFastAudioMode */
    async setKaraokeMode(mode: number): Promise<KaraokeModeSetResult> {
      throw new Error("setKaraokeMode not implemented");
    },

    /** SDK: CarInfoModel.getVin | Source: ts/model/CarInfoModel.ts:getVin */
    async readCarInfo(): Promise<CarinfoReadResult> {
      throw new Error("readCarInfo not implemented");
    },

    /** SDK: WindowManager.isPageActive | Source: ts/manager/WindowManager.ts */
    async readAppStatus(): Promise<AppstatusReadResult> {
      throw new Error("readAppStatus not implemented");
    },

    async launchApp(appName: string): Promise<LaunchAppResult> {
      const url = resolvePageUri(appName);
      if (!url) {
        throw new Error(`unknown app: ${appName}`);
      }
      const r = await execute("sendlink", { url }, adbConfig);
      if (!r.success) {
        throw new Error(`launch_app failed: ${r.rawOutput}`);
      }
      const parsed = (r.parsed ?? {}) as { targetPageId?: string };
      return {
        success: true,
        targetPageId: parsed.targetPageId ?? "",
        appName,
      };
    },
  };
}

