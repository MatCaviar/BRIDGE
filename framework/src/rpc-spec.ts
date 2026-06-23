/** Node 参考实现：车机 RpcEngine.ts（agil/TS）的 dispatch 算法镜像于此。本文件有单测；车机 TS 版是它的翻译。 */

export interface DbusSpec {
  readonly type: "dbus";
  readonly bus: string;
  readonly path: string;
  readonly method: string;
  readonly arg: unknown;          // 模板，可含 ${var}
  readonly stringify?: string[];  // arg 内需 JSON.stringify 的点分路径
  readonly reply: "json" | "string" | "int" | "double" | "bool";
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
    let node: Record<string, unknown> = arg;
    for (let i = 0; i < segs.length - 1; i++) node = node[segs[i]] as Record<string, unknown>;
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
