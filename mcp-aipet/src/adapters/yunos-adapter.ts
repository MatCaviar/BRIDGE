import type { IAdapter, NavigateToResult, GoBackResult, GetCurrentPageResult, CapturePhotoResult, UploadPetImageResult, GeneratePetAvatarResult, ApplyPetAvatarResult, RegeneratePetAvatarResult, GetVehicleInfoResult, GetGearStatusResult, OnGearChangedResult, GetHotspotInfoResult, GenerateQrCodeResult, TransferToPhoneResult, GetAppStatusResult, GetDisplayInfoResult, ShowToastResult, ShowLoadingResult, HideLoadingResult, PlayAnimationResult } from "./types.js";

/**
 * YunOS adapter for aipet
 * Replace each throw with actual YunOS SDK calls.
 */
export function createYunosAdapter(): IAdapter {
  return {
    isMock: false,

    /** SDK: yunos/appmodel/StackRouter | Source: ts/presenter/HomePresenter.ts:navigate */
    async navigateToPage(pageName: string): Promise<NavigateToResult> {
      throw new Error("navigateToPage not implemented");
    },

    /** SDK: yunos/appmodel/StackRouter | Source: ts/presenter/HomePresenter.ts:goBack */
    async goPageBack(): Promise<GoBackResult> {
      throw new Error("goPageBack not implemented");
    },

    /** SDK: yunos/appmodel/StackRouter | Source: ts/presenter/BasePresenter.ts:getCurrentPage */
    async getPageCurrent(): Promise<GetCurrentPageResult> {
      throw new Error("getPageCurrent not implemented");
    },

    /** SDK: IMCameraProxy.executeCmd | Source: src/proxy/IMCameraProxy.js:capturePhoto */
    async capturePet(fps: number): Promise<CapturePhotoResult> {
      throw new Error("capturePet not implemented");
    },

    /** SDK: yunos/net/HttpClient | Source: ts/presenter/PhonePresenter.ts:uploadImage */
    async uploadPetImage(imagePath: string): Promise<UploadPetImageResult> {
      throw new Error("uploadPetImage not implemented");
    },

    /** SDK: yunos/net/HttpClient | Source: ts/presenter/LoadingPresenter.ts:generateAvatar */
    async generatePetAvatar(style: string, imagePath: string): Promise<GeneratePetAvatarResult> {
      throw new Error("generatePetAvatar not implemented");
    },

    /** SDK: @banma/hdt-types | Source: ts/presenter/ResultPresenter.ts:applyAvatar */
    async applyPetAvatar(avatarUrl: string, scene: string, confirmed: boolean): Promise<ApplyPetAvatarResult> {
      throw new Error("applyPetAvatar not implemented");
    },

    /** SDK: yunos/net/HttpClient | Source: ts/presenter/ResultPresenter.ts:regenerateAvatar */
    async regeneratePetAvatar(style: string): Promise<RegeneratePetAvatarResult> {
      throw new Error("regeneratePetAvatar not implemented");
    },

    /** SDK: sysprop/sysprop | Source: src/proxy/BaseProxy.js:getVehicleInfo */
    async getVehicleInfo(): Promise<GetVehicleInfoResult> {
      throw new Error("getVehicleInfo not implemented");
    },

    /** SDK: yunos/platform/auto/carservice/CarPropertyManager | Source: ts/manager/CarManager.ts:getGearStatus */
    async readGearStatus(): Promise<GetGearStatusResult> {
      throw new Error("readGearStatus not implemented");
    },

    /** SDK: yunos/platform/auto/carservice/CarPropertyManager | Source: ts/manager/CarManager.ts:subscribeGear */
    async subscribeGear(): Promise<OnGearChangedResult> {
      throw new Error("subscribeGear not implemented");
    },

    /** SDK: yunos/net/HotspotManager | Source: ts/presenter/PhonePresenter.ts:getHotspot */
    async getHotspotInfo(): Promise<GetHotspotInfoResult> {
      throw new Error("getHotspotInfo not implemented");
    },

    /** SDK: yunos/net/HttpClient | Source: ts/presenter/PhonePresenter.ts:generateQR */
    async generateQrCode(data: string): Promise<GenerateQrCodeResult> {
      throw new Error("generateQrCode not implemented");
    },

    /** SDK: yunos/net/HotspotManager, yunos/net/HttpClient | Source: ts/presenter/PhonePresenter.ts:transferToPhone */
    async transferPhone(data: string, ssid: string): Promise<TransferToPhoneResult> {
      throw new Error("transferPhone not implemented");
    },

    /** SDK: extend/hdt/page/BMPage | Source: ts/AipetApp.ts:getAppStatus */
    async getAppStatus(): Promise<GetAppStatusResult> {
      throw new Error("getAppStatus not implemented");
    },

    /** SDK: extend/hdt/page/BMPage | Source: ts/AipetApp.ts:getDisplayInfo */
    async getDisplayInfo(): Promise<GetDisplayInfoResult> {
      throw new Error("getDisplayInfo not implemented");
    },

    /** SDK: yunos/ui/widget/Toast | Source: ts/utils/ToastUtils.ts:show */
    async showToast(message: string, align?: string): Promise<ShowToastResult> {
      throw new Error("showToast not implemented");
    },

    /** SDK: yunos/ui/animation/PropertyAnimation | Source: ts/utils/LoadingUtils.ts:start */
    async showLoading(message?: string): Promise<ShowLoadingResult> {
      throw new Error("showLoading not implemented");
    },

    /** SDK: yunos/ui/animation/PropertyAnimation | Source: ts/utils/LoadingUtils.ts:stop */
    async hideLoading(): Promise<HideLoadingResult> {
      throw new Error("hideLoading not implemented");
    },

    /** SDK: yunos/ui/view/ImageView | Source: ts/presenter/LoadingPresenter.ts:playAnimation */
    async playAnimation(_type: string, duration?: number): Promise<PlayAnimationResult> {
      throw new Error("playAnimation not implemented");
    },
  };
}

