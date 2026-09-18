/** Recursive JSON field shape used when projecting analysis parameters to Zod/JSON Schema. */
export interface FieldShape {
  readonly type: string;
  readonly enum?: readonly (string | number | boolean)[];
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly additionalProperties?: boolean;
  readonly items?: FieldShape;
  readonly properties?: readonly ParamDef[];
  readonly required?: readonly string[];
}

export interface ParamDef extends FieldShape {
  readonly name: string;
  readonly optional?: boolean;
  readonly examples?: readonly unknown[];
  readonly defaultValue?: unknown;
  /** Value pre-filled from PRD/doc rather than confirmed from code or runtime; rendered as 待确认 in contract tables. */
  readonly presumed?: boolean;
}

export type CapabilityStatus = "verified" | "probe" | "broken";
export type CapabilityMechanism =
  | "aidl"
  | "execmd"
  | "media"
  | "intent";

/** Public API contract, independent of the application and its execution mechanism. */
export interface ToolContract {
  readonly mode?: "individual" | "channel";
  readonly name?: string;
  readonly description?: string;
  /** Optional channel metadata rendered into exported tool descriptions. */
  readonly version?: string;
  readonly timeoutMs?: number;
  readonly clientPackage?: string;
  readonly actionField?: string;
  readonly contextField?: string;
  readonly context?: readonly ParamDef[];
  /** Context values may come from the host; keys refer to declared context fields. */
  readonly contextBindings?: Readonly<Record<string, { readonly env: string }>>;
  readonly response?: {
    readonly successCodes?: readonly (string | number)[];
    /** Business error-code table, exported alongside success codes. */
    readonly errorCodes?: readonly {
      readonly code: string | number;
      readonly message: string;
      readonly description?: string;
    }[];
    readonly requireCode?: boolean;
    readonly codeField?: string;
    readonly messageField?: string;
    readonly dataField?: string;
    readonly extrasField?: string;
  };
}

export interface HttpTransport {
  readonly type: "http";
  readonly url: string;
  readonly timeoutMs?: number;
  /** Header values are read from environment variables, never embedded secrets. */
  readonly headerEnv?: Readonly<Record<string, string>>;
}

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
  readonly scope?: "core" | "shared" | "platform";
  readonly publicAction?: string;
  /** PRD-sourced example utterances, rendered into exported descriptions for action selection. */
  readonly utterances?: readonly string[];
  /** Whole capability pre-filled from PRD/doc without code confirmation; surfaced in contract tables. */
  readonly presumed?: boolean;
  /** One-line delivery note (PRD mapping / coverage / pending items), rendered in the visualization matrix. */
  readonly deliverNote?: string;
  readonly dispatch?: {
    readonly operation?: string;
    readonly parameterMap?: Readonly<Record<string, string>>;
  };
  /** Runtime preconditions must be supplied by the host; annotations are descriptive only. */
  readonly preconditions?: readonly string[];
  readonly mechanism?: CapabilityMechanism;
  readonly methodName?: string;
  readonly pattern?: 'none' | 'json';
  readonly interfaceClass?: string;
  readonly servicePackage?: string;
  readonly serviceClass?: string;
  readonly bindAction?: string;
  readonly sessionPackage?: string;
  readonly timeoutMs?: number;
  readonly binder?: {
    readonly descriptor: string;
    readonly transactionCode: number;
    readonly callbackDescriptor: string;
    readonly callbackTransactionCode: number;
    readonly operationField?: string;
    readonly argumentsField?: string;
    readonly stringifyArguments?: boolean;
    readonly oneWay?: boolean;
  };
  readonly component?: { readonly pkg: string; readonly cls: string };
  readonly extras?: readonly {
    readonly key: string;
    readonly fromArgs?: boolean;
    readonly value?: string;
  }[];
  readonly dataUri?: string;
}

export interface AnalysisData {
  readonly app: {
    readonly name: string;
    readonly framework?: string;
    readonly demo?: boolean;
  };
  readonly capabilities: readonly CapabilityDef[];
  readonly toolContract?: ToolContract;
  readonly transport?: HttpTransport;
  readonly builtins?: readonly ("media_next" | "media_prev" | "media_play" | "media_pause")[];
  readonly deliveryScopes?: readonly ("core" | "shared" | "platform")[];
}
