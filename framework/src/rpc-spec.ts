/** Node 参考实现：车机 RpcEngine.ts（agil/TS）的 dispatch 算法镜像于此。本文件有单测；车机 TS 版是它的翻译。 */

export interface WireWrite {
  readonly kind: "string" | "int32" | "double" | "bool" | "json";
  readonly value: unknown; // 模板，可含 ${var} / ${__device__.x}
}
export interface WireRead {
  readonly kind: "json" | "string" | "int32" | "double" | "bool";
}
/** 回复读取器抽象——车端传真实 dbus result（有 readJSON/readString/...），单测传 mock。 */
export interface Reader {
  readJSON(): unknown;
  readString(): string;
  readInt32(): number;
  readDouble(): number;
  readBool(): boolean;
}

export interface DbusSpec {
  readonly type: "dbus";
  readonly bus: string;
  readonly path: string;
  readonly method: string;
  readonly arg?: unknown;           // 单写模板（可含 ${var}）；writes 存在时可省略
  readonly stringify?: string[];    // arg 内需 JSON.stringify 的点分路径
  readonly writes?: readonly WireWrite[]; // 顺序位置写（覆盖单写 arg）；kind:"json"=JSON串, "string"=裸串
  readonly reply: "json" | "string" | "int" | "double" | "bool";
  readonly replyParts?: readonly WireRead[]; // 多段读（存在时返回数组）；否则按 reply 单读
  readonly interface?: string;      // dbus 接口名覆盖；缺省 bus + ".interface"
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

/** 解析一个 ${var} 键（支持点号嵌套，如 __device__.vin）。
 *  ${__device__.x} 未解析时 fail-closed（抛错）——绝不把设备上下文标记当字面量发到 wire。 */
function resolveVar(vars: Record<string, unknown>, key: string): unknown {
  const segs = key.split(".");
  let cur: unknown = vars;
  for (const seg of segs) {
    if (cur == null || typeof cur !== "object") {
      if (key.startsWith("__device__.")) throw new Error(`unresolved device variable: \${${key}}`);
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (cur === undefined && key.startsWith("__device__.")) throw new Error(`unresolved device variable: \${${key}}`);
  return cur;
}

function interpolate(template: unknown, vars: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    // 单独一个 ${var} 占位 → 保留原类型（number 仍是 number），匹配真实 wire/方法签名
    const single = template.match(/^\$\{([\w.]+)\}$/);
    if (single) return resolveVar(vars, single[1]);
    return template.replace(/\$\{([\w.]+)\}/g, (_m, k) => {
      const v = resolveVar(vars, k as string);
      return v === undefined ? "" : String(v);
    });
  }
  if (Array.isArray(template)) return template.map((v) => interpolate(v, vars));
  if (template && typeof template === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(template as object)) o[k] = interpolate((template as Record<string, unknown>)[k], vars);
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

/** 构造顺序写列表（spec.writes 优先；否则退化为单 JSON 写 [arg stringify]）。
 *  返回每项 {kind, value}：car 端按 kind 调 writeString/writeInt32/...；kind:"json"→writeString(JSON.stringify)。 */
export function buildWrites(spec: DbusSpec, args: Record<string, unknown>): ReadonlyArray<{ readonly kind: WireWrite["kind"]; readonly value: unknown }> {
  if (spec.writes && spec.writes.length > 0) {
    return spec.writes.map((w) => ({ kind: w.kind, value: interpolate(clone(w.value), args) }));
  }
  if (spec.arg === undefined) {
    throw new Error("dbus spec requires `arg` (single JSON write) or a non-empty `writes[]` — neither was provided");
  }
  const arg = interpolate(clone(spec.arg), args) as Record<string, unknown>;
  applyStringify(arg, spec.stringify);
  return [{ kind: "json", value: arg }];
}

function readOne(reader: Reader, kind: string): unknown {
  switch (kind) {
    case "json": return reader.readJSON();
    case "string": return reader.readString();
    case "int": case "int32": return reader.readInt32();
    case "double": return reader.readDouble();
    case "bool": return reader.readBool();
    default: return reader.readJSON();
  }
}

/** 读回复：spec.replyParts 存在 → 按序读多段返回数组；否则按 reply 单读。 */
export function readReply(spec: DbusSpec, reader: Reader): unknown {
  if (spec.replyParts && spec.replyParts.length > 0) {
    return spec.replyParts.map((r) => readOne(reader, r.kind));
  }
  return readOne(reader, spec.reply);
}

export interface DbusCall {
  readonly bus: string;
  readonly path: string;
  readonly method: string;
  readonly argString: string;  // 单写形式写到 wire 的 JSON 字符串（writes 形式时为 ""）
  readonly reply: DbusSpec["reply"];
  readonly writes?: ReadonlyArray<{ readonly kind: WireWrite["kind"]; readonly value: unknown }>; // 位置写形式
  readonly interfaceOverride?: string;
}

export function constructDbusCall(spec: DbusSpec, args: Record<string, unknown>): DbusCall {
  const writes = buildWrites(spec, args);
  const argString = writes.length === 1 && writes[0].kind === "json" ? JSON.stringify(writes[0].value) : "";
  return { bus: spec.bus, path: spec.path, method: spec.method, argString, reply: spec.reply, writes: writes.length === 1 && writes[0].kind === "json" ? undefined : writes, interfaceOverride: spec.interface };
}

function evalExpr(expr: string, vars: Record<string, unknown>): unknown {
  const s = expr.replace(/\$\{([\w.]+)\}/g, (_m, k) => String(resolveVar(vars, k as string) ?? 0));
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
