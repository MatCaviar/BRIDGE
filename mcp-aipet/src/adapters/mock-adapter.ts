// Auto-generated mock adapter — returns safe defaults for testing
import type { IAdapter, NavigateToResult, GoBackResult, GetCurrentPageResult, CapturePhotoResult, UploadPetImageResult, GeneratePetAvatarResult, ApplyPetAvatarResult, RegeneratePetAvatarResult, GetVehicleInfoResult, GetGearStatusResult, OnGearChangedResult, GetHotspotInfoResult, GenerateQrCodeResult, TransferToPhoneResult, GetAppStatusResult, GetDisplayInfoResult, ShowToastResult, ShowLoadingResult, HideLoadingResult, PlayAnimationResult } from "./types.js";

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

  function pushPage(page: string): void {
    state = { ...state, pageStack: [...state.pageStack, page] };
  }

  function popPage(): void {
    if (state.pageStack.length > 1) {
      state = { ...state, pageStack: state.pageStack.slice(0, -1) };
    }
  }

  const adapter: IAdapter = {
    isMock: true,

    async navigateToPage(pageName: string): Promise<NavigateToResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("navigateToPage");
      pushPage(pageName);
      return frozen<NavigateToResult>({ success: true, currentPage: state.pageStack[state.pageStack.length - 1] } as NavigateToResult);
    },

    async goPageBack(): Promise<GoBackResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("goPageBack");
      popPage();
      return frozen<GoBackResult>({ success: true, currentPage: state.pageStack[state.pageStack.length - 1] } as GoBackResult);
    },

    async getPageCurrent(): Promise<GetCurrentPageResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("getPageCurrent");
      return frozen<GetCurrentPageResult>({ success: true, currentPage: state.pageStack[state.pageStack.length - 1], stackDepth: state.pageStack.length } as GetCurrentPageResult);
    },

    async capturePet(fps: number): Promise<CapturePhotoResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("capturePet");
      return frozen<CapturePhotoResult>({ success: true, imagePath: "mock://test" } as CapturePhotoResult);
    },

    async uploadPetImage(imagePath: string): Promise<UploadPetImageResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("uploadPetImage");
      return frozen<UploadPetImageResult>({ success: true, uploadedUrl: "mock://test" } as UploadPetImageResult);
    },

    async generatePetAvatar(style: string, imagePath: string): Promise<GeneratePetAvatarResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("generatePetAvatar");
      return frozen<GeneratePetAvatarResult>({ success: true, avatarUrl: "mock://test" } as GeneratePetAvatarResult);
    },

    async applyPetAvatar(avatarUrl: string, scene: string, confirmed: boolean): Promise<ApplyPetAvatarResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("applyPetAvatar");
      return frozen<ApplyPetAvatarResult>({ success: true } as ApplyPetAvatarResult);
    },

    async regeneratePetAvatar(style: string): Promise<RegeneratePetAvatarResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("regeneratePetAvatar");
      return frozen<RegeneratePetAvatarResult>({ success: true, avatarUrl: "mock://test" } as RegeneratePetAvatarResult);
    },

    async getVehicleInfo(): Promise<GetVehicleInfoResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("getVehicleInfo");
      return frozen<GetVehicleInfoResult>({ success: true, vin: "" } as GetVehicleInfoResult);
    },

    async readGearStatus(): Promise<GetGearStatusResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("readGearStatus");
      return frozen<GetGearStatusResult>({ success: true, isParked: state.gearStatus === "P", ignoreMode: "false", rawValue: 2 } as GetGearStatusResult);
    },

    async subscribeGear(): Promise<OnGearChangedResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("subscribeGear");
      return frozen<OnGearChangedResult>({ success: true, isParked: state.gearStatus === "P", gearValue: state.gearStatus } as OnGearChangedResult);
    },

    async getHotspotInfo(): Promise<GetHotspotInfoResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("getHotspotInfo");
      return frozen<GetHotspotInfoResult>({ success: true, ssid: nextMockId() } as GetHotspotInfoResult);
    },

    async generateQrCode(data: string): Promise<GenerateQrCodeResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("generateQrCode");
      return frozen<GenerateQrCodeResult>({ success: true, qrCodeUrl: "mock://test" } as GenerateQrCodeResult);
    },

    async transferPhone(data: string, ssid: string): Promise<TransferToPhoneResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("transferPhone");
      return frozen<TransferToPhoneResult>({ success: true, status: "" } as TransferToPhoneResult);
    },

    async getAppStatus(): Promise<GetAppStatusResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("getAppStatus");
      return frozen<GetAppStatusResult>({ success: true, currentPage: state.pageStack[state.pageStack.length - 1], isDualScreen: false } as GetAppStatusResult);
    },

    async getDisplayInfo(): Promise<GetDisplayInfoResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("getDisplayInfo");
      return frozen<GetDisplayInfoResult>({ success: true, displayName: "test" } as GetDisplayInfoResult);
    },

    async showToast(message: string, align?: string): Promise<ShowToastResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("showToast");
      state = { ...state, activeToast: message };
      return frozen<ShowToastResult>({ success: true } as ShowToastResult);
    },

    async showLoading(message?: string): Promise<ShowLoadingResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("showLoading");
      state = { ...state, isLoading: true };
      return frozen<ShowLoadingResult>({ success: true } as ShowLoadingResult);
    },

    async hideLoading(): Promise<HideLoadingResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("hideLoading");
      state = { ...state, isLoading: false };
      return frozen<HideLoadingResult>({ success: true } as HideLoadingResult);
    },

    async playAnimation(_type: string, duration?: number): Promise<PlayAnimationResult> {
      await new Promise((r) => setTimeout(r, 5));
      checkError("playAnimation");
      return frozen<PlayAnimationResult>({ success: true } as PlayAnimationResult);
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

