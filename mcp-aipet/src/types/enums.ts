// Source: ts/type/Enum.ts
export const PageName = {
  home: "home",
  photo: "photo",
  phone: "phone",
  loading: "loading",
  result: "result",
  setting: "setting"
} as const;
export type PageName = (typeof PageName)[keyof typeof PageName];

// Source: ts/type/Enum.ts
export const DisplayName = {
  disp_host0: "disp_host0",
  disp_guest0: "disp_guest0"
} as const;
export type DisplayName = (typeof DisplayName)[keyof typeof DisplayName];

// Source: ts/manager/CarManager.ts
export const GearPosition = {
  P: "P",
  R: "R",
  N: "N",
  D: "D"
} as const;
export type GearPosition = (typeof GearPosition)[keyof typeof GearPosition];

// Source: ts/presenter/LoadingPresenter.ts
export const AvatarStyle = {
  cartoon: "cartoon",
  realistic: "realistic",
  sketch: "sketch",
  anime: "anime"
} as const;
export type AvatarStyle = (typeof AvatarStyle)[keyof typeof AvatarStyle];

// Source: ts/presenter/ResultPresenter.ts
export const ApplyScene = {
  screensaver: "screensaver",
  avatar: "avatar",
  desktop_card: "desktop_card"
} as const;
export type ApplyScene = (typeof ApplyScene)[keyof typeof ApplyScene];

// Source: ts/presenter/PhonePresenter.ts
export const TransferStatus = {
  pending: "pending",
  completed: "completed",
  failed: "failed"
} as const;
export type TransferStatus = (typeof TransferStatus)[keyof typeof TransferStatus];
