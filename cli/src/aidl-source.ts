/** Regex-based, dependency-free Kotlin/AIDL source parsing for the AIDL substrate.
 *
 *  Generalizable across Android apps; deliberately NOT a full Kotlin AST — it handles exactly the
 *  constructs the gates need (AIDL method signatures, the adapter's paramJson parse call per method,
 *  and data-class field names). The fixtures are real app source, so these regexes must fit the real
 *  shape, not a hand-picked subset. */

export type Pattern = "scalar" | "dataclass" | "envelope" | "none";

/** AIDL interface business method names. Excludes callback-lifecycle methods (register/unregister,
 *  asBinder) which are not capabilities. */
export function parseAidlMethods(aidlText: string): Set<string> {
  const methods = new Set<string>();
  for (const m of aidlText.matchAll(/^\s*(?:[\w.<>]+\s+)+(\w+)\s*\(/gm)) {
    const name = m[1]!;
    if (name === "interface" || name === "package" || name === "import") continue;
    if (name === "registerCallback" || name === "unregisterCallback" || name === "asBinder") continue;
    methods.add(name);
  }
  return methods;
}

/** Detect how an adapter method reads paramJson, by scanning its `override fun` body.
 *  - envelope : parseRequest(paramJson) → a request envelope (e.g. ICloudServiceRequest)
 *  - dataclass: JsonUtil.fromJson<T>(paramJson) → a typed data class
 *  - scalar   : parseJsonObject(paramJson) + intArg(...) reads of individual keys
 *  - none     : no paramJson parameter (getter)
 *  - undefined: method not found in the adapter */
export function detectAdapterPattern(adapterText: string, methodName: string): Pattern | undefined {
  const starts = [...adapterText.matchAll(/^[ \t]*override fun (\w+)\s*\(/gm)];
  const idx = starts.findIndex((m) => m[1] === methodName);
  if (idx === -1) return undefined;
  const start = starts[idx]!.index!;
  const tail = adapterText.slice(start);
  // Bound the body at the next override fun, the next class-member function (e.g. private helpers like
  // parseRequest/parseJsonObject), or a block close at <=4-space indent (binder/class close) — so the
  // LAST method doesn't bleed into trailing helper definitions and falsely look like it parses paramJson.
  const endRel = tail.search(/\n        override fun |\n    (?:private |internal |protected )?fun |\n    \}|\n\}/);
  const body = endRel === -1 ? tail : tail.slice(0, endRel);
  const sig = body.match(/override fun \w+\s*\(([^)]*)\)/);
  const hasParamJsonParam = !!(sig && /\bparamJson\b/.test(sig[1]!));
  if (/\bparseRequest\s*\(/.test(body)) return "envelope";
  if (/\bfromJson\s*</.test(body)) return "dataclass";
  if (/\bparseJsonObject\s*\(/.test(body)) return "scalar";
  // Takes paramJson but doesn't parse it (e.g. a stub that ignores input): treat as scalar (accepts a
  // JSON object). Such methods are normally status=broken; the pattern is moot for them.
  return hasParamJsonParam ? "scalar" : "none";
}

/** Kotlin data class name → field-name set. Bounds each class to its indented primary-constructor
 *  block (up to the next column-0 line), so enum constructors between classes don't contaminate. */
export function parseDataClasses(typesKtText: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const heads = [...typesKtText.matchAll(/\bdata class\s+(\w+)/g)];
  for (const head of heads) {
    const name = head[1]!;
    const bodyStart = head.index! + head[0].length;
    const tail = typesKtText.slice(bodyStart);
    const m = tail.match(/\n[^\s]/); // next column-0 line = end of this class's indented block
    const bodyEnd = m ? bodyStart + m.index! : typesKtText.length;
    const body = typesKtText.slice(bodyStart, bodyEnd);
    const fields = new Set<string>();
    for (const f of body.matchAll(/\bval\s+(\w+)\s*:/g)) fields.add(f[1]!);
    out.set(name, fields);
  }
  return out;
}
