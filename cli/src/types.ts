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
  /** android-kotlin: how the adapter reads paramJson. scalar=parseJsonObject+intArg; dataclass=fromJson<T>; envelope=parseRequest→envelope; none=no-arg getter. */
  readonly pattern?: "scalar" | "dataclass" | "envelope" | "none";
  /** android-kotlin: dot-paths of device-resolved values the executor injects (top segment must be in app.deviceSources). */
  readonly devicePaths?: readonly string[];
  /** android-kotlin: invocation form — binder (AIDL, returns data) | intent (start-activity, fire-and-forget). */
  readonly form?: "binder" | "intent";
  /** android-kotlin (dataclass pattern): the T in fromJson<T>. Gate B verifies it exists in Types.kt. */
  readonly dataClass?: string;
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
    /** android-kotlin: true if the app's AIDL already exposes a native callTool(String, IXXXCallback). */
    readonly nativeCallTool?: boolean;
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
