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
    id: "navigate_to",
    domain: "navigation",
    object: "page",
    action: "navigate_to",
    safetyLevel: "normal",
    sdkCalls: ["yunos/appmodel/StackRouter"],
    sourceRef: "ts/presenter/HomePresenter.ts:navigate",
  },
  {
    id: "go_back",
    domain: "navigation",
    object: "page",
    action: "go_back",
    safetyLevel: "normal",
    sdkCalls: ["yunos/appmodel/StackRouter"],
    sourceRef: "ts/presenter/HomePresenter.ts:goBack",
  },
  {
    id: "get_current_page",
    domain: "navigation",
    object: "page",
    action: "get_current",
    safetyLevel: "readonly",
    sdkCalls: ["yunos/appmodel/StackRouter"],
    sourceRef: "ts/presenter/BasePresenter.ts:getCurrentPage",
  },
  {
    id: "capture_photo",
    domain: "pet",
    object: "pet",
    action: "capture",
    safetyLevel: "p_gear_required",
    sdkCalls: ["IMCameraProxy.executeCmd"],
    sourceRef: "src/proxy/IMCameraProxy.js:capturePhoto",
  },
  {
    id: "upload_pet_image",
    domain: "pet",
    object: "pet_image",
    action: "upload",
    safetyLevel: "p_gear_required",
    sdkCalls: ["yunos/net/HttpClient"],
    sourceRef: "ts/presenter/PhonePresenter.ts:uploadImage",
  },
  {
    id: "generate_pet_avatar",
    domain: "pet",
    object: "pet_avatar",
    action: "generate",
    safetyLevel: "p_gear_required",
    sdkCalls: ["yunos/net/HttpClient"],
    sourceRef: "ts/presenter/LoadingPresenter.ts:generateAvatar",
  },
  {
    id: "apply_pet_avatar",
    domain: "pet",
    object: "pet_avatar",
    action: "apply",
    safetyLevel: "p_gear_and_confirm",
    sdkCalls: ["@banma/hdt-types"],
    sourceRef: "ts/presenter/ResultPresenter.ts:applyAvatar",
  },
  {
    id: "regenerate_pet_avatar",
    domain: "pet",
    object: "pet_avatar",
    action: "regenerate",
    safetyLevel: "p_gear_required",
    sdkCalls: ["yunos/net/HttpClient"],
    sourceRef: "ts/presenter/ResultPresenter.ts:regenerateAvatar",
  },
  {
    id: "get_vehicle_info",
    domain: "vehicle",
    object: "vehicle",
    action: "get_info",
    safetyLevel: "readonly",
    sdkCalls: ["sysprop/sysprop"],
    sourceRef: "src/proxy/BaseProxy.js:getVehicleInfo",
  },
  {
    id: "get_gear_status",
    domain: "vehicle",
    object: "gear",
    action: "read_status",
    safetyLevel: "readonly",
    sdkCalls: ["yunos/platform/auto/carservice/CarPropertyManager"],
    sourceRef: "ts/manager/CarManager.ts:getGearStatus",
  },
  {
    id: "on_gear_changed",
    domain: "vehicle",
    object: "gear",
    action: "subscribe",
    safetyLevel: "readonly",
    sdkCalls: ["yunos/platform/auto/carservice/CarPropertyManager"],
    sourceRef: "ts/manager/CarManager.ts:subscribeGear",
  },
  {
    id: "get_hotspot_info",
    domain: "transfer",
    object: "hotspot",
    action: "get_info",
    safetyLevel: "readonly",
    sdkCalls: ["yunos/net/HotspotManager"],
    sourceRef: "ts/presenter/PhonePresenter.ts:getHotspot",
  },
  {
    id: "generate_qr_code",
    domain: "transfer",
    object: "qr_code",
    action: "generate",
    safetyLevel: "readonly",
    sdkCalls: ["yunos/net/HttpClient"],
    sourceRef: "ts/presenter/PhonePresenter.ts:generateQR",
  },
  {
    id: "transfer_to_phone",
    domain: "transfer",
    object: "phone",
    action: "transfer",
    safetyLevel: "p_gear_and_network",
    sdkCalls: ["yunos/net/HotspotManager", "yunos/net/HttpClient"],
    sourceRef: "ts/presenter/PhonePresenter.ts:transferToPhone",
  },
  {
    id: "get_app_status",
    domain: "system",
    object: "app",
    action: "get_status",
    safetyLevel: "readonly",
    sdkCalls: ["extend/hdt/page/BMPage"],
    sourceRef: "ts/AipetApp.ts:getAppStatus",
  },
  {
    id: "get_display_info",
    domain: "system",
    object: "display",
    action: "get_info",
    safetyLevel: "readonly",
    sdkCalls: ["extend/hdt/page/BMPage"],
    sourceRef: "ts/AipetApp.ts:getDisplayInfo",
  },
  {
    id: "show_toast",
    domain: "system",
    object: "toast",
    action: "show",
    safetyLevel: "normal",
    sdkCalls: ["yunos/ui/widget/Toast"],
    sourceRef: "ts/utils/ToastUtils.ts:show",
  },
  {
    id: "show_loading",
    domain: "system",
    object: "loading",
    action: "show",
    safetyLevel: "normal",
    sdkCalls: ["yunos/ui/animation/PropertyAnimation"],
    sourceRef: "ts/utils/LoadingUtils.ts:start",
  },
  {
    id: "hide_loading",
    domain: "system",
    object: "loading",
    action: "hide",
    safetyLevel: "normal",
    sdkCalls: ["yunos/ui/animation/PropertyAnimation"],
    sourceRef: "ts/utils/LoadingUtils.ts:stop",
  },
  {
    id: "play_animation",
    domain: "system",
    object: "animation",
    action: "play",
    safetyLevel: "normal",
    sdkCalls: ["yunos/ui/view/ImageView"],
    sourceRef: "ts/presenter/LoadingPresenter.ts:playAnimation",
  },
];

export const DOMAINS = [
  "navigation",
  "pet",
  "vehicle",
  "transfer",
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
