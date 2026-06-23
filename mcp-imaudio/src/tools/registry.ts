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
    id: "soundstage_read",
    domain: "soundstage",
    object: "sound_stage",
    action: "read",
    safetyLevel: "readonly",
    sdkCalls: ["SoundStageManager.getSoundStage"],
    sourceRef: "ts/model/SoundStageModel.ts:getSoundStage",
  },
  {
    id: "soundstage_set",
    domain: "soundstage",
    object: "sound_stage",
    action: "set",
    safetyLevel: "normal",
    sdkCalls: ["SoundStageManager.setSoundStage"],
    sourceRef: "ts/model/SoundStageModel.ts:setSoundStage",
  },
  {
    id: "vnc_status_read",
    domain: "soundstage",
    object: "vnc_status",
    action: "read",
    safetyLevel: "readonly",
    sdkCalls: ["SoundStageManager.getSpeedVolumeStatus"],
    sourceRef: "ts/model/SoundStageModel.ts:getVNCStatus",
  },
  {
    id: "vnc_status_set",
    domain: "soundstage",
    object: "vnc_status",
    action: "set",
    safetyLevel: "normal",
    sdkCalls: ["SoundStageManager.setSpeedVolumeStatus"],
    sourceRef: "ts/model/SoundStageModel.ts:setVNCStatus",
  },
  {
    id: "equalizer_read",
    domain: "equalizer",
    object: "equalizer",
    action: "read",
    safetyLevel: "readonly",
    sdkCalls: ["EqualizerModel.getEffectValues"],
    sourceRef: "ts/model/EqualizerModel.ts:getEffectValues",
  },
  {
    id: "equalizer_preset_set",
    domain: "equalizer",
    object: "equalizer_preset",
    action: "set",
    safetyLevel: "normal",
    sdkCalls: ["EqualizerModel.sendEffectValues"],
    sourceRef: "ts/model/EqualizerModel.ts:setEffectValues",
  },
  {
    id: "equalizer_custom_set",
    domain: "equalizer",
    object: "custom_equalizer",
    action: "set",
    safetyLevel: "normal",
    sdkCalls: ["EqualizerModel.sendEffectValues"],
    sourceRef: "ts/model/EqualizerModel.ts:sendCustomEffectValues",
  },
  {
    id: "equalizer_custom_save",
    domain: "equalizer",
    object: "custom_equalizer",
    action: "save",
    safetyLevel: "normal",
    sdkCalls: ["EqualizerModel.createAndSaveEffect"],
    sourceRef: "ts/model/EqualizerModel.ts:createAndSaveEffect",
  },
  {
    id: "beosonic_read",
    domain: "beosonic",
    object: "beosonic",
    action: "read",
    safetyLevel: "readonly",
    sdkCalls: ["BeosonicModel.getCurrentValues"],
    sourceRef: "ts/model/BeosonicModel.ts:getCurrentValues",
  },
  {
    id: "beosonic_preset_set",
    domain: "beosonic",
    object: "beosonic_preset",
    action: "set",
    safetyLevel: "normal",
    sdkCalls: ["BeosonicModel.sendEffectValues"],
    sourceRef: "ts/model/BeosonicModel.ts:sendEffectValues",
  },
  {
    id: "locksound_read",
    domain: "locksound",
    object: "lock_sound",
    action: "read",
    safetyLevel: "readonly",
    sdkCalls: ["LockSoundModel.getEffectValues"],
    sourceRef: "ts/model/LockSoundModel.ts:getEffectValues",
  },
  {
    id: "locksound_enable",
    domain: "locksound",
    object: "lock_sound",
    action: "enable",
    safetyLevel: "normal",
    sdkCalls: ["LockSoundModel.sendEffectValues"],
    sourceRef: "ts/model/LockSoundModel.ts:setEffectValues",
  },
  {
    id: "locksound_disable",
    domain: "locksound",
    object: "lock_sound",
    action: "disable",
    safetyLevel: "normal",
    sdkCalls: ["LockSoundModel.disableLockSound"],
    sourceRef: "ts/model/LockSoundModel.ts:disableLockSound",
  },
  {
    id: "karaoke_read",
    domain: "karaoke",
    object: "karaoke",
    action: "read",
    safetyLevel: "readonly",
    sdkCalls: ["KaraokeModel.getFastAudioMode"],
    sourceRef: "ts/model/KaraokeModel.ts:getFastAudioMode",
  },
  {
    id: "karaoke_mode_set",
    domain: "karaoke",
    object: "karaoke_mode",
    action: "set",
    safetyLevel: "normal",
    sdkCalls: ["KaraokeManager.setFastAudioMode"],
    sourceRef: "ts/manager/KaraokeManager.ts:setFastAudioMode",
  },
  {
    id: "carinfo_read",
    domain: "vehicle",
    object: "car_info",
    action: "read",
    safetyLevel: "readonly",
    sdkCalls: ["CarInfoModel.getVin"],
    sourceRef: "ts/model/CarInfoModel.ts:getVin",
  },
  {
    id: "appstatus_read",
    domain: "system",
    object: "app_status",
    action: "read",
    safetyLevel: "readonly",
    sdkCalls: ["WindowManager.isPageActive"],
    sourceRef: "ts/manager/WindowManager.ts",
  },
];

export const DOMAINS = [
  "soundstage",
  "equalizer",
  "beosonic",
  "locksound",
  "karaoke",
  "vehicle",
  "system",
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
