# SP-B：RPC 桥并入生成器 设计

**日期**: 2026-06-23
**状态**: 设计已批准，待 writing-plans
**定位**: im-mcp-codeagent 插件演进的第 2 个子项目（SP-B）。目标 bar：像 superpowers / ecc 那样强大，但更可靠、更高度集成、垂直专业化（车机 app → 可控 MCP server）。
**前置**: Phase-1 已在 mcp-imaudio 手工验证 rpc 桥（rpc-types/rpc-engine/rpc-client + 车机 RpcEngine.ts + config.json + soundstage 端到端模式）。

---

## 0. 产品定位（再次明确）

插件**内部无 LLM call**。插件 = ① **方法论**（skills/SKILL.md，告诉宿主 agent 怎么做）+ ② **确定性工具**（CLI，纯 Node，零 LLM）+ ③ **资产**（templates/schemas/framework + Phase-1 参考模式）。**生成由宿主 agent（Claude Code/Codex，本身即 LLM）按方法论执行**。可靠性脊梁 = 确定性 CLI 闸门 + 严谨方法论 + 参考资产。

SP-B 范围：让生成的 server **经 rpc 桥真实控车（不再 throw）**，且全流程 **app 无关**、config **可靠（确定性闸门）**。

---

## 1. 背景与 gap

现有 pipeline（`.claude-plugin/plugin.json` + skills mcp-analyze/generate/pipeline/test + CLI validate/scaffold/test/build/register/verify + 8 generators + framework）能生成 MCP server，但：

- **生成器零 rpc 桥**（`grep imaudio|rpc|sendlink|adb|RpcEngine` over `cli/src/generators/` = 无匹配）。
- 生成的 `yunos-adapter.ts` 对**所有**方法 `throw "not implemented"`（`scaffold.ts:294-328 generateYunosAdapterStub`）。
- `mcp-generate` skill 明确要求 throw 桩（`skills/mcp-generate/SKILL.md:54-57,76`）。
- Phase-1 的 rpc 桥是 **mcp-imaudio 一处的手工编辑**（含硬编码 `page://imaudio.yunos.com/rpcagent`），未进生成器。
- `analysis.json` 是**接口级**（`sdkCalls` 仅方法名字符串，无 D-Bus wire 细节；schema 第 5 行明示"非内部实现细节"）。

→ 需把 Phase-1 模式**泛化进生成器 + 方法论**，确定性产桥，宿主 agent 仅产 config.json（唯一判断产物）。

---

## 2. 核心原则：确定性 vs 方法论切分（把判断面压到最小）

| 产物 | 由谁产 | 依据 |
|------|--------|------|
| `rpc-types/rpc-engine/rpc-client/adb-executor/app-page-uri/config(AdbConfig)` | **确定性 CLI 生成器** | 通用模板；rpc-client `RPC_URL` 按 `analysis.app.domain` 参数化（`page://<domain>/rpcagent`） |
| `yunos-adapter.ts`（每方法→`rpcCall(op,args)`+DTO） | **确定性 CLI 生成器** | `cap.id`→op、`params`→args、`returns.fields`→DTO（全在 analysis） |
| 车机 `RpcEngine.ts` + manifest page 项 + `config.yaml` adb 块 | **确定性 CLI 生成器** | 通用模板 |
| **`config.json`（op→wire-spec）** | **宿主 agent 按 mcp-generate 方法论** | 唯一判断产物；对照 Phase-1 参考；**确定性闸门验证** |

除 config.json 外**一切确定性**。最大化可靠。

---

## 3. 架构 / 数据流

```
/mcp-pipeline <app源码目录>
 → mcp-analyze：analysis.json（接口级：cap.id/params/returns.fields/sdkCalls/sourceRef）
 → scaffold（CLI 确定性）：
     · rpc-bridge 文件（rpc-types/engine/client/adb-executor/app-page-uri/config）
     · yunos-adapter（op+DTO，从 analysis）
     · 车机交付物（car-side/RpcEngine.ts + car-side/manifest-page.json + rpc/config.json 骨架）
     · config.yaml（含 adb 块）
 → mcp-generate（宿主 agent 按方法论）：读 proxy 源码 → 填 rpc/config.json（op→wire-spec）
 → validate-config + wire-check（CLI 确定性闸门）：不过打回重做
 → build：生成的 server 经 rpc 桥真实控车（不 throw）；车机交付物交同事
```

---

## 4. 组件

### 4.1 新增/修改的确定性 CLI 生成器（`cli/src/generators/`）

- **新增 `rpc-bridge.ts`**：产 `src/rpc/{rpc-types,rpc-engine,rpc-client}.ts`、`src/executors/adb-executor.ts`（含 sendlink+shell 注册）、`src/adapters/app-page-uri.ts`（按 app 的 launch 页参数化）、`src/config.ts`（AdbConfig）。全部从 Phase-1 `mcp-imaudio/src/rpc/*`、`adb-executor.ts`、`app-page-uri.ts`、`config.ts` 提炼为模板；**去硬编码**（rpc-client `RPC_URL` 用 `page://${app.domain}/rpcagent`）。
- **改 yunos-adapter 生成**（`scaffold.ts generateYunosAdapterStub` → `generateYunosAdapterRpc`）：每方法从 `throw` 改为 `await rpcFn("<cap.id>", {<params>}, adbConfig)` + **按名映射** DTO：`returns.fields.map(f => [f, data[f] ?? defaultFor(f, type)])`（`data` 是 rpcCall 运行时响应；DTO 字段取自 analysis `returns.fields`，**响应里没有的字段按类型默认**——如 vncEnabled/isAtmosPlaying=false，Phase-1 同款）。确定性，不需生成期知道响应形状。生成器对每字段标注来源（populated vs defaulted）。范式：`createYunosAdapter(adbConfig, rpcFn=defaultRpcCall)`。
- **新增 `car-rpc-engine.ts`**：产车机通用 `RpcEngine.ts`（镜像 `rpc-engine.ts` 算法，agil/TS，ubus+同步 File API）+ `manifest-page.json`（`page://<domain>/rpcagent` → `src/RpcEngine.js` 项，供同事 merge）作为 **car-side/ 交付物**。
- **改 `config-yaml` 生成**（`scaffold.ts generateConfigYaml`）：加 `adb:` 块（path/use_host/timeout_ms）。

### 4.2 新增确定性闸门 CLI（`cli/src/commands/`）

- **`validate-config`**：① config.json 符合 RpcConfig schema（见 §5）；② **覆盖率**：analysis 每个 capability 都有对应 config op（op=cap.id）；③ **可 dispatch**：mock 引擎对每个 op 用**样本 args**（从 analysis `cap.params` 按类型确定性合成：number→1、string→"x"、boolean→true、enum→首值、optional→omit）跑 `constructDbusCall`/`constructNativeCall`，不崩、`${var}`/stringify 正确。**同一样本 args 也喂 wire-check**（set 类 op 需插值样本）。
- **`wire-check`**：静态解析 app 的 proxy 源码，对**共用模式**（`createMethodCallMessage("request")` + `writeString(JSON.stringify({funcName[, data]}))` + `readJSON`/`readString`）抽期望 wire，对比 `constructDbusCall(config[op])` 输出；不一致则报错。覆盖多数 proxy；冷僻模式留真机 smoke（SP-D）。

### 4.3 mcp-generate 方法论（`skills/mcp-generate/SKILL.md`）

**移除**"throw 桩"指令；**改为 config 抽取方法论**（固化 Phase-1 套路）：
1. 对 analysis 每个 capability，按 `sourceRef` 定位 proxy/manager 源码。
2. 抽 wire-spec：D-Bus（bus/path/method/arg 模板/stringify/reply）或 native（require/factory/method/args）。范例：soundstage（`AudioPolicyProxy` 的 `request`+funcName+`data:JSON.stringify(...)`）。
3. 写入 `rpc/config.json`，op = cap.id。
4. 跑 `validate-config` + `wire-check`，不过则据报错修正。

### 4.4 mcp-pipeline 编排（`skills/mcp-pipeline/SKILL.md`）

在 analyze→scaffold→generate 之间插入 config 步 + 闸门；**失败由宿主 agent 按 mcp-generate 方法论读闸门报错、改 config、重跑闸门**（自动重试，N 次仍不过则上浮给用户），不进 build。

---

## 5. config.json schema（契约，源自 Phase-1 `rpc-engine.ts`）

```typescript
type RpcConfig = Record<string, RpcSpec>;  // key = op = analysis capability.id
type RpcSpec = DbusSpec | NativeSpec;
interface DbusSpec {
  type: "dbus"; bus: string; path: string; method: string;
  arg: unknown;              // 模板，可含 ${var}
  stringify?: string[];      // arg 内点分路径，发送前 JSON.stringify
  reply: "json"|"string"|"int"|"double"|"bool";
}
interface NativeSpec {
  type: "native"; require: string; factory?: string; method: string; args: unknown[];
}
```
请求 `{reqId,op,args}` / 响应 `{reqId,ok,data|error}`（见 Phase-1 spec §4）。`${var}` 单占位**保类型**（Phase-1 TDD 修正的 bug）。

---

## 6. 可靠 / 泛化 / 集成

- **可靠**：每步确定性闸门；config 是唯一判断产物，受 schema+覆盖率+dispatchable+wire-check 四重确定性校验；生成器零 app 字面量（参数化）。
- **泛化**：生成器按 `analysis.app.domain`/capabilities 参数化；config 方法论通用（读任何 proxy→wire spec）；框架 framework 复用。
- **集成**：Claude Code 插件形态（skills 方法论 + CLI 确定性杠杆 + framework 运行时），`/mcp-pipeline` 一键；宿主 agent 执行、确定性工具干重活——同 superpowers/ecc 形态，垂直专业化。

---

## 7. 范围边界（SP-B 不含，后续子项目）

- SP-A（选择 UI + PRD 输入）、SP-C（独立 schema 产物 + 描述增强）、SP-D（verify 真调工具 + 真机 smoke 自动化 + Claude Code/Codex 双端打包）——本 spec 不含。
- SP-B 只保证：**生成 server 经桥真实控车（不 throw）+ config 确定性可靠 + 全流程 app 无关**。真机 smoke 留 SP-D。

---

## 8. 验收标准

- [ ] `scaffold` 对任意 analysis.json 确定性产出：rpc-bridge 文件 + yunos-adapter（rpcCall+DTO，不 throw）+ 车机 RpcEngine.ts/manifest-page/config.yaml(adb)。
- [ ] 生成器零 app 字面量（`grep imaudio|soundstage` over `cli/src/generators/` = 无）。
- [ ] `validate-config`：schema + 覆盖率（cap↔op）+ dispatchable 三查。
- [ ] `wire-check`：对共用 proxy 模式确定性比对 constructDbusCall 输出。
- [ ] mcp-generate skill：config 抽取方法论（无 throw 桩指令），含 soundstage 范例。
- [ ] mcp-pipeline：config 步 + 闸门编排，失败打回。
- [ ] 端到端：对一个新 app 跑 `/mcp-pipeline`，产出经桥可控的 server + 车机交付物；config 过双闸门。
- [ ] imaudio 回归：用生成器重生成 mcp-imaudio，rpc 桥行为与 Phase-1 手工版一致（soundstage 可控）。

---

## 9. 实现期风险

1. **wire-check proxy 解析覆盖**：仅共用 `request`+funcName 模式；冷僻 proxy（typed writes/自定义 reply）留真机 smoke（SP-D）。
2. **yunos-adapter DTO 完整性**：单 op 的响应只覆盖 DTO 部分字段（如 soundstage_read DTO 5 字段，getSoundStage 给 3）——按 §4.1 **按名映射 + 缺省**处理（populated/defaulted 标注透明）；多 op 组合完整 DTO（composite ops）留后续 enhancement，不在 SP-B。
3. **车机 File API 路径**：RpcEngine.ts 读 `/sdcard/imrpc/`——Phase-1 已用同步 API（EqualizerConfigStore 范式）；真机权限留 SP-D。
4. **app-page-uri 参数化**：launch 页来源（manifest pages）——analysis 是否含足够 page URI？若无，方法论提示宿主 agent 从 manifest 抽。

---

## 10. 与现有资产关系

- 复用 framework（`@im/mcp-server-framework`）。
- 复用现有 generators（adapter-types/registry/tool-handlers/enums/errors/contract-tests/mock-adapter*）——只加 rpc 相关 + 改 yunos-adapter/config-yaml。
- Phase-1 的 `mcp-imaudio/src/rpc/*`、`adb-executor.ts`、`app-page-uri.ts`、`config.ts`、车机 `RpcEngine.ts`、`config.json` 作为**模板源**提炼进生成器（去硬编码）。
- analysis.schema.json **不变**（保持接口级；wire-spec 进 config.json，不进 analysis）。
