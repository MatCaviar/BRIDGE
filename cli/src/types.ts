export interface TypedField {
  readonly name: string;
  readonly type: string;
}

export interface ParamDef {
  readonly name: string;
  readonly type: string;
  readonly enum?: readonly string[];
  readonly optional?: boolean;
  readonly description?: string;
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
  readonly params?: readonly ParamDef[];
  readonly returns?: ReturnsDef;
  readonly safetyLevel: string;
  readonly sdkCalls: readonly string[];
  readonly sourceRef: string;
}

export interface EnumDef {
  readonly values: readonly string[];
  readonly type: string;
  readonly sourceFile?: string;
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
  };
  readonly capabilities: readonly CapabilityDef[];
  readonly enums?: Record<string, EnumDef>;
  readonly errorCodes?: Record<string, ErrorCodeDomain>;
}
