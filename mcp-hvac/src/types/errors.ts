// Auto-generated error codes — do not edit manually
// Code format: prefix * 1000 + suffix (e.g. 2001 = navigation prefix 2 + suffix 1)

export const CLIMATE_TEMP_OUT_OF_RANGE = 4001 as const;
export const CLIMATE_FAN_SPEED_INVALID = 4002 as const;
export const CLIMATE_AC_UNAVAILABLE = 4003 as const;
export const CLIMATE_DEFROST_FAILED = 4004 as const;
export const WINDOW_WINDOW_BLOCKED = 5001 as const;
export const WINDOW_WINDOW_TIMEOUT = 5002 as const;
export const SENSOR_SENSOR_UNAVAILABLE = 6001 as const;

export const ERROR_MAP: Record<number, { code: number; message: string }> = {
  [CLIMATE_TEMP_OUT_OF_RANGE]: { code: CLIMATE_TEMP_OUT_OF_RANGE, message: "温度超出范围" },
  [CLIMATE_FAN_SPEED_INVALID]: { code: CLIMATE_FAN_SPEED_INVALID, message: "风扇速度无效" },
  [CLIMATE_AC_UNAVAILABLE]: { code: CLIMATE_AC_UNAVAILABLE, message: "空调不可用" },
  [CLIMATE_DEFROST_FAILED]: { code: CLIMATE_DEFROST_FAILED, message: "除雾失败" },
  [WINDOW_WINDOW_BLOCKED]: { code: WINDOW_WINDOW_BLOCKED, message: "车窗被阻挡" },
  [WINDOW_WINDOW_TIMEOUT]: { code: WINDOW_WINDOW_TIMEOUT, message: "车窗操作超时" },
  [SENSOR_SENSOR_UNAVAILABLE]: { code: SENSOR_SENSOR_UNAVAILABLE, message: "传感器不可用" },
};
