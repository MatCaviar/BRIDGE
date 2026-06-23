// Auto-generated error codes — do not edit manually
// Code format: prefix * 1000 + suffix (e.g. 2001 = navigation prefix 2 + suffix 1)

export const AUDIO_SDK_UNAVAILABLE = 2001 as const;
export const AUDIO_INVALID_PARAM = 2002 as const;
export const AUDIO_EFFECT_NOT_FOUND = 2003 as const;
export const AUDIO_SET_FAILED = 2004 as const;
export const AUDIO_RESOURCE_NOT_INSTALLED = 2005 as const;
export const VEHICLE_VIN_UNAVAILABLE = 3001 as const;
export const SYSTEM_APP_NOT_READY = 5001 as const;
export const LAUNCH_APP_FAILED = 5002 as const;

export const ERROR_MAP: Record<number, { code: number; message: string }> = {
  [AUDIO_SDK_UNAVAILABLE]: { code: AUDIO_SDK_UNAVAILABLE, message: "Audio SDK not available" },
  [AUDIO_INVALID_PARAM]: { code: AUDIO_INVALID_PARAM, message: "Invalid audio parameter" },
  [AUDIO_EFFECT_NOT_FOUND]: { code: AUDIO_EFFECT_NOT_FOUND, message: "Audio effect not found" },
  [AUDIO_SET_FAILED]: { code: AUDIO_SET_FAILED, message: "Failed to set audio effect" },
  [AUDIO_RESOURCE_NOT_INSTALLED]: { code: AUDIO_RESOURCE_NOT_INSTALLED, message: "Lock sound resource not installed" },
  [VEHICLE_VIN_UNAVAILABLE]: { code: VEHICLE_VIN_UNAVAILABLE, message: "Vehicle VIN not available" },
  [SYSTEM_APP_NOT_READY]: { code: SYSTEM_APP_NOT_READY, message: "Audio app not ready" },
  [LAUNCH_APP_FAILED]: { code: LAUNCH_APP_FAILED, message: "Failed to launch app" },
};
