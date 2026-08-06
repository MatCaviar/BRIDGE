/** Nameless recursive field shape — an array element (`items`) or nested sub-shape. Declaring
 *  items/properties here (rather than leaving a type opaque) is what makes object/array params and
 *  return fields project to structured JSON-Schema a downstream agent can construct. Named fields use
 *  ParamDef. */
export interface FieldShape {
  readonly type: string;
  readonly enum?: readonly string[];
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  /** Array element shape (when `type` is array). */
  readonly items?: FieldShape;
  /** Named object fields (when `type` is an object/model). */
  readonly properties?: readonly ParamDef[];
  /** Which of `properties` are required (default: those without `optional`). */
  readonly required?: readonly string[];
}

export interface TypedField {
  readonly name: string;
  readonly type: string;
  readonly description?: string;
  readonly items?: FieldShape;
  readonly properties?: readonly ParamDef[];
  readonly required?: readonly string[];
}

export interface ParamDef {
  readonly name: string;
  readonly type: string;
  readonly enum?: readonly string[];
  readonly optional?: boolean;
  readonly description?: string;
  /** Example wire values — projected to JSON-Schema `examples`. Strongest LLM steering signal. */
  readonly examples?: readonly string[];
  /** Numeric lower bound (number params only) → JSON-Schema `minimum`. */
  readonly minimum?: number;
  /** Numeric upper bound (number params only) → JSON-Schema `maximum`. */
  readonly maximum?: number;
  /** Default value when omitted → JSON-Schema `default`. */
  readonly defaultValue?: string | number | boolean;
  /** Structured object fields (when `type` names a model) → JSON-Schema `properties`. Each field is
   *  itself a ParamDef, so nesting/enums/bounds recurse. */
  readonly properties?: readonly ParamDef[];
  /** Array element shape (when `type` is array) — projects to JSON-Schema `items`. */
  readonly items?: FieldShape;
}

export interface ReturnsDef {
  readonly type: string;
  readonly fields?: readonly (string | TypedField)[];
}

export interface CapabilityDef {
  readonly id: string;
  readonly domain: string;
  readonly object: string;
  readonly action: string;
  /** Optional tool description surfaced to upstream agents. Auto-derived if omitted. */
  readonly description?: string;
  readonly params?: readonly ParamDef[];
  readonly returns?: ReturnsDef;
  readonly safetyLevel: string;
  readonly sdkCalls: readonly string[];
  readonly sourceRef: string;
  /** Authoring-confidence marker: verified (wire source-traced) | partial (e.g. signal-loss) | broken (known no-op/bug). */
  readonly status?: "verified" | "partial" | "broken";
  /** Dispatch mechanism the on-car bridge executor uses to execute this capability. The mechanism
   *  selects the executor's dispatch path and the mechanism-specific registry fields emitted into
   *  registry.json (the executor's on-car dispatch table). See the mcp-analyze skill's "Mechanism
   *  assignment" section. Default "aidl" when omitted. */
  readonly mechanism?:
    | "aidl"        // reflect the target app's AIDL method by methodName (registry: methodName, pattern, devicePaths).
    | "media"       // MediaSessionManager transportControls (media_* built-in, no registry entry; not SmartLink-projectable).
    | "carproperty" // CarPropertyManager get/set by propId+areaId (registry: propId, areaId, valueType, mode).
    | "audio"       // AudioManager.setStreamVolume (no-op on Banma/SmartLink; use shell/caraudio instead).
    | "caraudio"    // CarAudioManager.setGroupVolume via reflection - hidden API, system app only (registry: mode).
    | "shell";      // run an adb-style shell command on-car (registry: command, ${arg} substitution).

  // ── Mechanism-specific fields (present only when `mechanism` needs them). These are mapped
  //    1:1 into registry.json (the on-car bridge executor's dispatch table) by generate_registry.
  /** aidl: AIDL method name to reflect on the bound service. Default: derived from `sourceRef` (method after ':'). */
  readonly methodName?: string;
  /** aidl: param shape — none (no-arg) | scalar (args JSON) | dataclass (args JSON) | envelope (wrapped + device injection). */
  readonly pattern?: "none" | "scalar" | "dataclass" | "envelope";
  /** aidl envelope: device-value paths to inject (e.g. ["body.vin"]). Default from app.deviceSources when envelope. */
  readonly devicePaths?: readonly string[];
  /** carproperty: Android VehiclePropertyIds value (e.g. HVAC_TEMPERATURE_SET=358614275). */
  readonly propId?: number;
  /** carproperty: VehicleAreaSeat area (e.g. SEAT_ROW_1_LEFT=1). */
  readonly areaId?: number;
  /** carproperty: property value type. */
  readonly valueType?: "float" | "int" | "bool";
  /** carproperty/caraudio: get | set | up | down. */
  readonly mode?: "get" | "set" | "up" | "down";
  /** shell: command to run on-car via `sh -c`, with ${arg} placeholders substituted from invoke args. */
  readonly command?: string;
}

/** A tool in registry.json — the on-car bridge executor's dispatch table. One entry per capability,
 *  carrying the mechanism + mechanism-specific fields the executor needs to bind/dispatch/execute. */
export interface RegistryTool {
  readonly id: string;
  readonly mechanism?: CapabilityDef["mechanism"];
  /** aidl: reflected AIDL method name on the bound service. */
  readonly methodName?: string;
  /** aidl: param shape — none (no-arg) | scalar (args JSON) | dataclass (args JSON) | envelope (wrapped + device injection). */
  readonly pattern?: "none" | "scalar" | "dataclass" | "envelope";
  /** aidl envelope: device-value paths to inject (e.g. ["body.vin"]). */
  readonly devicePaths?: readonly string[];
  /** carproperty: Android VehiclePropertyIds value (e.g. HVAC_TEMPERATURE_SET). */
  readonly propId?: number;
  /** carproperty: VehicleAreaSeat area (e.g. SEAT_ROW_1_LEFT=1). */
  readonly areaId?: number;
  /** carproperty: property value type. */
  readonly valueType?: "float" | "int" | "bool";
  /** carproperty/caraudio: get | set | up | down. */
  readonly mode?: "get" | "set" | "up" | "down";
  /** shell: command to run on-car via `sh -c`, with ${arg} placeholders substituted from invoke args. */
  readonly command?: string;
  readonly form?: string;
  readonly safetyLevel: string;
  readonly status: "verified" | "partial" | "broken";
  readonly sourceRef: string;
}

/** registry.json — generated alongside analysis.json, pushed to the executor's filesDir on-car. */
export interface RegistryData {
  readonly app: string;
  readonly framework: string;
  readonly nativeCallTool: boolean;
  readonly deviceSources?: readonly string[];
  readonly tools: readonly RegistryTool[];
}

export interface EnumDef {
  readonly values: readonly string[];
  readonly type: string;
  readonly sourceFile?: string;
  /** wireValue → human name map, projected as a reverse lookup export. */
  readonly map?: Record<string, string>;
}

export interface ErrorCodeEntry {
  readonly value: number;
  readonly message: string;
}

export interface ErrorCodeDomain {
  readonly prefix: number;
  readonly domainName: string;
  readonly codes: Record<string, ErrorCodeEntry>;
}

/** Capability ids the safety guard calls to verify preconditions for `p_gear_*` tools. Declared
 *  explicitly per-app in analysis (no hardcoded probe ids). If a probe is omitted, the corresponding
 *  `p_gear_*` tools fail-closed (the guard cannot verify the precondition → rejects). */
export interface SafetyProbes {
  /** Capability id returning `{isParked:boolean, ignoreMode:boolean}` — gates p_gear_required / p_gear_and_confirm. */
  readonly gear?: string;
  /** Capability id returning `{ssid:string|null}` — gates p_gear_and_network. */
  readonly hotspot?: string;
}

/** A declared precondition for a safety level. Composable: a level can require any combination.
 *  Mirrors framework SafetyRule — apps declare custom levels (or override a standard one) here
 *  without touching framework code. The generated server passes these to resolveSafetyRules(). */
export interface SafetyRule {
  readonly requiresGear?: boolean;
  readonly requiresHotspot?: boolean;
  readonly requiresConfirm?: boolean;
  readonly description?: string;
}

export interface AnalysisData {
  readonly app: {
    readonly name: string;
    readonly domain: string;
    readonly framework: string;
    readonly entryFile: string;
    readonly pages?: readonly string[];
    readonly permissions?: readonly string[];
    readonly voiceEnabled?: boolean;
    readonly dualScreen?: boolean;
    /** Device-resolved variable names usable as ${__device__.X} in wires (resolved on-car, fail-closed). */
    readonly deviceSources?: readonly string[];
    /** Explicit gear/hotspot probe capability ids for the safety guard. Optional but recommended
     *  when the app has p_gear_* tools; omitting a probe makes those tools fail-closed. */
    readonly safetyProbes?: SafetyProbes;
    /** Custom safety rules (level → preconditions). Merged over the framework's 5 built-in levels,
     *  so apps can override a standard level or add custom ones (e.g. door_locked, speed_limited)
     *  without framework changes. Omit to use built-ins only. */
    readonly safetyRules?: Readonly<Record<string, SafetyRule>>;
  };
  readonly capabilities: readonly CapabilityDef[];
  readonly enums?: Record<string, EnumDef>;
  readonly errorCodes?: Record<string, ErrorCodeDomain>;
}
