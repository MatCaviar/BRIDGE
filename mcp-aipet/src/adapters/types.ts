// Auto-generated adapter interface — derived from analysis.json capabilities
// IAdapter is the contract between tool handlers and platform SDKs

export interface NavigateToResult {
  readonly success: boolean;
  readonly currentPage: string;
}

export interface GoBackResult {
  readonly success: boolean;
  readonly currentPage: string;
}

export interface GetCurrentPageResult {
  readonly success: boolean;
  readonly currentPage: string;
  readonly stackDepth: number;
}

export interface CapturePhotoResult {
  readonly success: boolean;
  readonly imagePath: string;
}

export interface UploadPetImageResult {
  readonly success: boolean;
  readonly uploadedUrl: string;
}

export interface GeneratePetAvatarResult {
  readonly success: boolean;
  readonly avatarUrl: string;
}

export interface ApplyPetAvatarResult {
  readonly success: boolean;
}

export interface RegeneratePetAvatarResult {
  readonly success: boolean;
  readonly avatarUrl: string;
}

export interface GetVehicleInfoResult {
  readonly success: boolean;
  readonly vin: string;
}

export interface GetGearStatusResult {
  readonly success: boolean;
  readonly isParked: boolean;
  readonly ignoreMode: string;
  readonly rawValue: number;
}

export interface OnGearChangedResult {
  readonly success: boolean;
  readonly isParked: boolean;
  readonly gearValue: string;
}

export interface GetHotspotInfoResult {
  readonly success: boolean;
  readonly ssid: string;
}

export interface GenerateQrCodeResult {
  readonly success: boolean;
  readonly qrCodeUrl: string;
}

export interface TransferToPhoneResult {
  readonly success: boolean;
  readonly status: string;
}

export interface GetAppStatusResult {
  readonly success: boolean;
  readonly currentPage: string;
  readonly isDualScreen: boolean;
}

export interface GetDisplayInfoResult {
  readonly success: boolean;
  readonly displayName: string;
}

export interface ShowToastResult {
  readonly success: boolean;
}

export interface ShowLoadingResult {
  readonly success: boolean;
}

export interface HideLoadingResult {
  readonly success: boolean;
}

export interface PlayAnimationResult {
  readonly success: boolean;
}

export interface IAdapter {
  readonly isMock: boolean;

  navigateToPage(pageName: string): Promise<NavigateToResult>;
  goPageBack(): Promise<GoBackResult>;
  getPageCurrent(): Promise<GetCurrentPageResult>;
  capturePet(fps: number): Promise<CapturePhotoResult>;
  uploadPetImage(imagePath: string): Promise<UploadPetImageResult>;
  generatePetAvatar(style: string, imagePath: string): Promise<GeneratePetAvatarResult>;
  applyPetAvatar(avatarUrl: string, scene: string, confirmed: boolean): Promise<ApplyPetAvatarResult>;
  regeneratePetAvatar(style: string): Promise<RegeneratePetAvatarResult>;
  getVehicleInfo(): Promise<GetVehicleInfoResult>;
  readGearStatus(): Promise<GetGearStatusResult>;
  subscribeGear(): Promise<OnGearChangedResult>;
  getHotspotInfo(): Promise<GetHotspotInfoResult>;
  generateQrCode(data: string): Promise<GenerateQrCodeResult>;
  transferPhone(data: string, ssid: string): Promise<TransferToPhoneResult>;
  getAppStatus(): Promise<GetAppStatusResult>;
  getDisplayInfo(): Promise<GetDisplayInfoResult>;
  showToast(message: string, align?: string): Promise<ShowToastResult>;
  showLoading(message?: string): Promise<ShowLoadingResult>;
  hideLoading(): Promise<HideLoadingResult>;
  playAnimation(_type: string, duration?: number): Promise<PlayAnimationResult>;
}

