/** Node 参考实现：车机 RpcEngine.ts（agil/TS）的 dispatch 算法镜像于此。本文件有单测；车机 TS 版是它的翻译。 */

/** LEGACY: `reply: "json" | "string" | "int" | "double" | "bool"` (string).
 *  DESIGN A: ALSO accept an object. MINIMAL — only these 4 fields:
 *    read       — which UBus reply reader the car-side uses ("json"|"string"|"int"|"double"|"bool")
 *    unwrap?    — dotted path into the read value to the payload (e.g. "result.data")
 *    parseJson? — the read value (after unwrap) is a JSON-encoded string → parse it
 *    valueField?— the unwrapped value is a SCALAR (set-op success / single read) → map it onto this DTO field (e.g. "volume")
 *  Legacy string `reply` ≡ `{ read: <string> }`. */
export interface ReplyDescriptor {
  readonly read: "json" | "string" | "int" | "double" | "bool";
  readonly unwrap?: string;
  readonly parseJson?: boolean;
  readonly valueField?: string;
}

const READ_KINDS = new Set(["json", "string", "int", "double", "bool"]);
const ALLOWED_REPLY_FIELDS = new Set(["read", "unwrap", "parseJson", "valueField"]);

/** Normalize a `reply` value (string OR object) into a validated ReplyDescriptor.
 *  Throws on: missing read, bad read value, or any field outside the 4 allowed (minimal — no speculative config).
 *  A valid object is returned by reference (pass-through); a legacy string is wrapped as `{ read: <string> }`. */
export function normalizeReply(reply: unknown): ReplyDescriptor {
  if (typeof reply === "string") {
    if (!READ_KINDS.has(reply)) throw new Error(`bad reply.read: ${reply}`);
    return { read: reply as ReplyDescriptor["read"] };
  }
  if (!reply || typeof reply !== "object") throw new Error("reply must be a string or object");
  const obj = reply as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (!ALLOWED_REPLY_FIELDS.has(k)) throw new Error(`unknown reply field (only read/unwrap/parseJson/valueField allowed): ${k}`);
  }
  const read = obj.read;
  if (typeof read !== "string" || !READ_KINDS.has(read)) throw new Error(`bad reply.read: ${String(read)}`);
  if (obj.unwrap !== undefined && typeof obj.unwrap !== "string") throw new Error("reply.unwrap must be a string");
  if (obj.parseJson !== undefined && typeof obj.parseJson !== "boolean") throw new Error("reply.parseJson must be boolean");
  if (obj.valueField !== undefined && typeof obj.valueField !== "string") throw new Error("reply.valueField must be a string");
  return reply as ReplyDescriptor;
}

export interface DbusSpec {
  readonly type: "dbus";
  readonly bus: string;
  readonly path: string;
  readonly method: string;
  readonly arg: unknown;          // 模板，可含 ${var}
  readonly stringify?: string[];  // arg 内需 JSON.stringify 的点分路径
  readonly reply: ReplyDescriptor | ReplyDescriptor["read"];
}

export interface NativeSpec {
  readonly type: "native";
  readonly require: string;
  readonly factory?: string;      // 如 "getInstance"；无则 new
  readonly method: string;
  readonly args: unknown[];       // 每项可为 "${var}" 或 { expr: "..." }
}

export type RpcSpec = DbusSpec | NativeSpec;
export type RpcConfig = Record<string, RpcSpec>;

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function interpolate(template: unknown, vars: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    // 单独一个 ${var} 占位 → 保留原类型（number 仍是 number），匹配真实 wire/方法签名
    const single = template.match(/^\$\{(\w+)\}$/);
    if (single) return vars[single[1]];
    return template.replace(/\$\{(\w+)\}/g, (_, k) =>
      vars[k] === undefined ? "" : String(vars[k]),
    );
  }
  if (Array.isArray(template)) return template.map((v) => interpolate(v, vars));
  if (template && typeof template === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(template as object)) {
      o[k] = interpolate((template as Record<string, unknown>)[k], vars);
    }
    return o;
  }
  return template;
}

function applyStringify(arg: Record<string, unknown>, paths: string[] = []): void {
  for (const p of paths) {
    const segs = p.split(".");
    let node: Record<string, unknown> | undefined = arg;
    for (let i = 0; i < segs.length - 1; i++) node = node?.[segs[i]] as Record<string, unknown> | undefined;
    if (node == null) throw new Error(`stringify path not found in arg: ${p}`);
    const last = segs[segs.length - 1];
    node[last] = JSON.stringify(node[last]);
  }
}

export interface DbusCall {
  readonly bus: string;
  readonly path: string;
  readonly method: string;
  readonly argString: string;  // 写到 wire 的 JSON 字符串
  readonly reply: DbusSpec["reply"];
}

export function constructDbusCall(spec: DbusSpec, args: Record<string, unknown>): DbusCall {
  const arg = interpolate(clone(spec.arg), args) as Record<string, unknown>;
  applyStringify(arg, spec.stringify);
  return { bus: spec.bus, path: spec.path, method: spec.method, argString: JSON.stringify(arg), reply: spec.reply };
}

function evalExpr(expr: string, vars: Record<string, unknown>): unknown {
  const s = expr.replace(/\$\{(\w+)\}/g, (_, k) => String(vars[k] ?? 0));
  if (!/^[-+*/().\s\d]+$/.test(s)) throw new Error(`bad expr: ${expr}`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${s});`)();
}

export interface NativeCall {
  readonly require: string;
  readonly factory?: string;
  readonly method: string;
  readonly args: unknown[];
}

export function constructNativeCall(spec: NativeSpec, args: Record<string, unknown>): NativeCall {
  const resolved = spec.args.map((a) => {
    if (typeof a === "string") return interpolate(a, args);
    if (a && typeof a === "object" && typeof (a as { expr?: string }).expr === "string") {
      return evalExpr((a as { expr: string }).expr, args);
    }
    return a;
  });
  return { require: spec.require, factory: spec.factory, method: spec.method, args: resolved };
}
