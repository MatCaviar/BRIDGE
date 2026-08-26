/** Recursive JSON field shape used when projecting analysis parameters to Zod/JSON Schema. */
export interface FieldShape {
  readonly type: string;
  readonly enum?: readonly string[];
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly items?: FieldShape;
  readonly properties?: readonly ParamDef[];
  readonly required?: readonly string[];
}

export interface ParamDef extends FieldShape {
  readonly name: string;
  readonly optional?: boolean;
  readonly examples?: readonly string[];
  readonly defaultValue?: string | number | boolean;
}

export type CapabilityStatus = "verified" | "probe" | "broken";
export type CapabilityMechanism =
  | "aidl"
  | "execmd"
  | "media"
  | "mapnav"
  | "carcontrol"
  | "intent";

/** Current bridge-analyze capability contract. Mechanism fields are consumed by the registry projection. */
export interface CapabilityDef {
  readonly id: string;
  readonly domain: string;
  readonly object: string;
  readonly action: string;
  readonly description: string;
  readonly params?: readonly ParamDef[];
  readonly safetyLevel: string;
  readonly status: CapabilityStatus;
  readonly sourceRef: string;
  readonly mechanism?: CapabilityMechanism;
  readonly methodName?: string;
  readonly pattern?: "scalar" | "dataclass" | "envelope" | "none";
  readonly devicePaths?: readonly string[];
  readonly dataClass?: string;
  readonly form?: "binder" | "intent";
  readonly interfaceClass?: string;
  readonly servicePackage?: string;
  readonly serviceClass?: string;
  readonly bindAction?: string;
  readonly ccDomain?: string;
  readonly ccFunction?: string;
  readonly component?: { readonly pkg: string; readonly cls: string };
  readonly intentScreens?: {
    readonly pkg: string;
    readonly byDisplay: Readonly<Record<string, string>>;
  };
  readonly extras?: readonly {
    readonly key: string;
    readonly fromArgs?: boolean;
    readonly value?: string;
  }[];
  readonly dataUri?: string;
  readonly defaultArgs?: Readonly<Record<string, unknown>>;
}

export interface AnalysisData {
  readonly app: {
    readonly name: string;
    readonly framework?: string;
    readonly deviceSources?: readonly string[];
  };
  readonly capabilities: readonly CapabilityDef[];
}
