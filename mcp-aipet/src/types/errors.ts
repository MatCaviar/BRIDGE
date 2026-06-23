// Auto-generated error codes — do not edit manually
// Code format: prefix * 1000 + suffix (e.g. 2001 = navigation prefix 2 + suffix 1)

export const NAV_PAGE_NOT_FOUND = 1001 as const;
export const NAV_STACK_OVERFLOW = 1002 as const;
export const NAV_ALREADY_ON_PAGE = 1003 as const;
export const PET_CAPTURE_FAILED = 2001 as const;
export const PET_UPLOAD_FAILED = 2002 as const;
export const PET_GENERATE_FAILED = 2003 as const;
export const PET_APPLY_FAILED = 2004 as const;
export const VEHICLE_SENSOR_UNAVAILABLE = 3001 as const;
export const VEHICLE_GEAR_READ_FAILED = 3002 as const;
export const TRANSFER_HOTSPOT_UNAVAILABLE = 4001 as const;
export const TRANSFER_QR_GENERATE_FAILED = 4002 as const;
export const TRANSFER_TRANSFER_FAILED = 4003 as const;
export const SYSTEM_DISPLAY_ERROR = 5001 as const;
export const SYSTEM_ANIMATION_ERROR = 5002 as const;
export const SYSTEM_APP_NOT_READY = 5003 as const;

export const ERROR_MAP: Record<number, { code: number; message: string }> = {
  [NAV_PAGE_NOT_FOUND]: { code: NAV_PAGE_NOT_FOUND, message: "页面不存在" },
  [NAV_STACK_OVERFLOW]: { code: NAV_STACK_OVERFLOW, message: "导航栈溢出" },
  [NAV_ALREADY_ON_PAGE]: { code: NAV_ALREADY_ON_PAGE, message: "已在目标页面" },
  [PET_CAPTURE_FAILED]: { code: PET_CAPTURE_FAILED, message: "拍照失败" },
  [PET_UPLOAD_FAILED]: { code: PET_UPLOAD_FAILED, message: "上传失败" },
  [PET_GENERATE_FAILED]: { code: PET_GENERATE_FAILED, message: "生成失败" },
  [PET_APPLY_FAILED]: { code: PET_APPLY_FAILED, message: "应用失败" },
  [VEHICLE_SENSOR_UNAVAILABLE]: { code: VEHICLE_SENSOR_UNAVAILABLE, message: "传感器不可用" },
  [VEHICLE_GEAR_READ_FAILED]: { code: VEHICLE_GEAR_READ_FAILED, message: "档位读取失败" },
  [TRANSFER_HOTSPOT_UNAVAILABLE]: { code: TRANSFER_HOTSPOT_UNAVAILABLE, message: "热点不可用" },
  [TRANSFER_QR_GENERATE_FAILED]: { code: TRANSFER_QR_GENERATE_FAILED, message: "二维码生成失败" },
  [TRANSFER_TRANSFER_FAILED]: { code: TRANSFER_TRANSFER_FAILED, message: "传输失败" },
  [SYSTEM_DISPLAY_ERROR]: { code: SYSTEM_DISPLAY_ERROR, message: "显示异常" },
  [SYSTEM_ANIMATION_ERROR]: { code: SYSTEM_ANIMATION_ERROR, message: "动画播放失败" },
  [SYSTEM_APP_NOT_READY]: { code: SYSTEM_APP_NOT_READY, message: "应用未就绪" },
};
