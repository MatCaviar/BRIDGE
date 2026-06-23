# 车内 RPC Agent 设计（grill 定稿版）

**日期**: 2026-06-23
**状态**: 定稿（grill-with-docs 后），取代 `2026-06-22-in-car-rpc-agent-design.md` 前版
**目标**: 让本地 e2e 上游 agent 通过 MCP 调用车机端 imaudio 的**全部精细功能**；并以此作为**可泛化生成工作流**的参考实现。

---

## 0. 产品定位（grill 锁定）

真正的交付物是一个**生成工作流**（配合 Claude Code / Codex），能给**任意**车机 app 自动生成 MCP 通路：
- 给目标 app 产出：① 要 merge 进 app 的 **rpc 引擎页**（通用、所有 app 相同）；② 一份 **per-app 配置**（op→调用规格）；③ PC 侧 **MCP server**。
- 嵌入 app 开发者（同事）的开发流程。
- **imaudio = 第一个参考实现**。本文聚焦把 imaudio 打通；泛化生成器（从 app proxy 源码自动产出配置）是后续 phase（§14）。
- **关键要求 = 可靠有效**（reliable & effective）。

---

## 1. 背景（为什么必须在车机内）

应用内精细功能走 app 的 kdbus，被系统权限阻断：adb shell（root，uid 0）的 `dbus-send`/`busctl` 访问不了 uid 1000 的 D-Bus（详见项目记忆 `yunos-sendlink-capability-boundary`）。

**关键事实（已查证）**：
- imaudio `manifest.json` 声明 `sharedUserId: "system"`，以 **uid 1000** 运行。
- 它调全部音频 SDK 有两条路径：① `ubus` 模块的 D-Bus（`new UBus("dbus")`，总线 `imaudio.alios.cn` / `com.yunos.audiopolicyservice` / `cn.alios.mafservice.*`）；② 进程内原生绑定（`AudioManager` / `audiopolicysdk` / `CarPropertyManager` 等）。
- `ts/proxy/*`（IMAudioProxy/AudioPolicyProxy/MAFProxy）就是 D-Bus 调用实现；`ts/manager/*` 是业务封装。
- 结论：**只要我们的代码以 system uid 在 app 进程内跑，就能直接调这些 SDK**——这就是 rpc 引擎页的作用。

---

## 2. 约束（grill 锁定的 5 条决策）

1. **桥 = file/sendlink，只用已验证原语**：`sendlink` 拉起页（已验证）、文件读写（app 用 `yunos/cloudfs`）、`adb shell echo/cat`。**不开网络口**——agil 是否支持 socket 监听未证实，可靠性优先不赌（网络监听降级为日后优化，§13）。
2. **rpc 页每次执行完自销毁**：靠构造保证每次 `sendlink` = 全新 `onStart`，对框架"重复拉起"行为鲁棒。
3. **构建/部署 = Option B**：我们产**源码**（rpc 引擎页 + manifest 项）+ **配置**；**同事构建装车**（同事有 AliOS 平台树 + system 密钥；可用 ZebraAlfred `installYpp` 装 .ypp）。**我们不本地构建**（本机无平台树/无 system 密钥/且 AliOS 构建跑在 Linux）。PC 侧（node）我们自建。
4. **dispatch = 数据驱动**：rpc 页是**通用引擎**，读 **per-app 配置文件**（op→调用规格）后通用 dispatch；**配置可 push 迭代、不重构建**；天然泛化（新 app = 新配置）。
5. **e2e / tool / schema / analysis.json 不变**：已生成的工具定义照旧，只换 yunos-adapter 底层从 `throw` → 经桥调 rpc 引擎。

---

## 3. 架构

```
PC e2e (interactive.py) ──MCP stdio── PC mcp-imaudio (node)
                                         │ tool: soundstage_set / equalizer_* / ...
                                         ▼ rpcClient.call(op, args)
                               ┌── adb shell echo '<cmdJson>' > /sdcard/imrpc/cmd.json
                               ├── adb shell sendlink page://imaudio.yunos.com/rpcagent   (无参拉起)
                               └── adb shell cat /sdcard/imrpc/result.json   (轮询至 reqId 匹配)
车机 rpcagent 页 (uid 1000)  ◀── sendlink 拉起 → onStart
   读 /sdcard/imrpc/config.json  (per-app 配置，我们 push 迭代)
   读 /sdcard/imrpc/cmd.json     (本次请求)
   → engine.dispatch[op]  (按 config 的 type=dbus|native 通用 relay)
   → 写 /sdcard/imrpc/result.json = {reqId, ok, data|error}
   → 自销毁
```

**组件**：
1. **车机 rpc 引擎页**（通用，merge 进 imaudio）：读配置 + cmd → 通用 dispatch（dbus/native）→ 写 result → 自销毁。
2. **per-app 配置**（`/sdcard/imrpc/config.json`，pushable）：op→调用规格表。imaudio 配置手写（从 proxy 源码抽取）；泛化时由生成器产出（§14）。
3. **PC `rpc-client.ts`**：写 cmd → sendlink 触发 → 轮询 cat result（reqId 关联）。
4. **PC `yunos-adapter.ts`**（改）：每个 throw 方法 → `rpcCall(op, args)` + DTO 映射。
5. **PC `adb-executor.ts`**（改）：加通用 `shell` 命令。
6. **PC mock 引擎**（新）：Node 实现，镜像车机 engine 的 dispatch 逻辑——Option B 慢回路下的**主要验证手段**（§10）。

---

## 4. 请求/响应契约

**请求**（PC 写 `/sdcard/imrpc/cmd.json`）：
```json
{ "reqId": "r-1719000000-1", "op": "soundstage.set", "args": { "mode": 1, "fade": 0, "balance": 0 } }
```
**响应**（engine 写 `/sdcard/imrpc/result.json`）：
```json
{ "reqId": "r-1719000000-1", "ok": true, "data": { "mode": 1, "fade": 0, "balance": 0 } }
```
失败：`{ "reqId": "...", "ok": false, "error": { "code": "RPC_ERROR|UNKNOWN_OP|BAD_ARGS|RPC_TIMEOUT", "message": "..." } }`

- `reqId`：PC 生成（时间戳+计数），关联响应、识别残留旧结果。
- `op`：`<domain>.<action>`，对应 config 的一个 key。
- PC 读取：每 ~150ms `cat result.json`，`reqId` 匹配则返回；~5s 超时抛 `RPC_TIMEOUT`。

---

## 5. per-app 配置 schema（数据驱动核心）

`/sdcard/imrpc/config.json`，每个 op 一条调用规格。两类调用：

### 5.1 `dbus` 类（通用 ubus relay，覆盖多数 op）
```json
"soundstage.read": {
  "type": "dbus",
  "bus": "com.yunos.audiopolicyservice",
  "path": "/com/yunos/audiopolicyservice",
  "method": "request",
  "arg": { "funcName": "audiopolicyservice.yunos.com/baseModeules/requstGetSoundEffectsMode" },
  "reply": "json"
}
```
engine 行为：`new UBus("dbus")` → `createInterface(bus,path)` → `createMethodCallMessage(method)` → `writeString(JSON.stringify(arg))` → `sendMethodCallMessage` → 按 `reply` 解析（`json`→`readJSON`，`int`→`readInt32`，…）。即把 `ts/proxy/*` 的调用模式参数化。

### 5.2 `native` 类（JS 反射调原生绑定，覆盖 native op）
```json
"equalizer.set_band": {
  "type": "native",
  "require": "yunos/device/AudioManager",
  "factory": "getInstance",
  "method": "setAudioEffectCustomizedEQ",
  "args": [ "${band}", "${centerFreq}", { "expr": "${bandLevel} + 7" } ]
}
```
engine 行为：`const M = require(spec.require); const inst = spec.factory ? M[spec.factory]() : new M(); const r = await inst[spec.method](...resolvedArgs);`。`args` 里 `${name}` 从请求 `args` 取，`{expr}` 支持简单算术变换（如 EQ 的 `bandLevel+7` 偏移）。

### 5.3 imaudio 配置 op 表（源自 `ts/proxy/*` + `ts/manager/*`）

| op | type | 来源 |
|----|------|------|
| `soundstage.read` / `.set` | dbus | AudioPolicyProxy `requstGet/SetSoundEffectsMode` |
| `equalizer.list` / `add_custom` / `update_custom` / `delete_custom` / `share_code` / `add_by_share_code` | dbus | IMAudioProxy `queryEffectLibrary/addEffect/...` |
| `equalizer.read_band` / `set_band` / `set_all` | native | EqualizerManager → `AudioManager.setAudioEffectCustomizedEQ` |
| `beosonic.read` / `set_point` | native | BeosonicManager → `audiopolicysdk/lib/AudioPolicyManager` |
| `beosonic.list_offical` / `list_custom` | dbus | 复用 IMAudioProxy `queryEffectLibrary` |
| `karaoke.fast_audio.get/set` | dbus | AudioPolicyProxy `get/setFastAudioMode` |
| `karaoke.mic_vol.get/set` | dbus | AudioPolicyProxy `get/setMicVocal` |
| `karaoke.media_vol.get/set` | dbus | AudioPolicyProxy `getLastVolumeData/setCarAndHeadrestVolume` |
| `karaoke.vocal_cut.get/set` | dbus | MAFProxy `get/setVocalCutLevel` |
| `locksound.list_cloud/list_local/current/apply/download/remove/preview` | dbus | IMAudioProxy `querySoundLibrary/...` |
| `carinfo.vin/bscreen/gear/is_parking` | native | CarInfoModel → `CarPropertyManager.getProperty` |

> 每 op 的精确 bus/path/method/arg 在实现时对照 `ts/proxy/*` 源码逐条填配置（生成器将来自动化此事）。

---

## 6. 车机 rpc 引擎页设计（扩展 imaudio，通用）

### 6.1 manifest 加 page（`imaudio_app_code/manifest.json` pages 数组追加）
```json
{
  "uri": "page://imaudio.yunos.com/rpcagent",
  "content_path": "src/RpcEngine.js",
  "main": false,
  "capabilities": { "ui": { "engine": "agil", "display": "disp_host0" } },
  "extension": {}
}
```

### 6.2 `ts/RpcEngine.ts`（编译到 `src/RpcEngine.js`，通用，所有 app 相同）
```typescript
import { BMPage } from "extend/hdt/page/BMPage";
import UBus = require("ubus");
import { File, FileReader, FileWriter } from "yunos/cloudfs/File";
import { Log } from "./utils/Log";

const CONFIG_PATH = "/sdcard/imrpc/config.json";
const CMD_PATH    = "/sdcard/imrpc/cmd.json";
const RESULT_PATH = "/sdcard/imrpc/result.json";

class RpcEngine extends BMPage {
  onStart() { this.run().then(() => this.finish()); }   // 执行完自销毁
  private async run() {
    let cmd; try { cmd = JSON.parse(await read(CMD_PATH)); } catch { return writeResult({reqId:"",ok:false,error:{code:"BAD_ARGS",message:"cmd"}}); }
    const cfg = JSON.parse(await read(CONFIG_PATH));
    const spec = cfg[cmd.op];
    if (!spec) return writeResult({reqId:cmd.reqId,ok:false,error:{code:"UNKNOWN_OP",message:cmd.op}});
    try {
      const data = spec.type === "dbus" ? await callDbus(spec, cmd.args)
                 : spec.type === "native" ? await callNative(spec, cmd.args)
                 : Promise.reject(new Error("bad type"));
      await writeResult({reqId:cmd.reqId, ok:true, data});
    } catch(e) { await writeResult({reqId:cmd.reqId, ok:false, error:{code:"RPC_ERROR",message:String(e)}}); }
  }
}
// callDbus: 参数化的 ubus 调用（见 §5.1）；callNative: require+反射（见 §5.2）；read/writeResult 用 yunos/cloudfs File
```
**复用**：`ubus`、`yunos/cloudfs File` 都是 app 已用的原语。引擎不 import 任何 imaudio 业务代码——**完全通用**，靠 config 驱动。**不动 imaudio 主代码**（只加一个文件 + manifest 一行）。

---

## 7. PC 侧改动（mcp-imaudio）

### 7.1 `adb-executor.ts` 加 `shell` 命令
```typescript
registerCommand("shell", (a) => `shell ${String(a.cmd)}`);
```

### 7.2 新增 `src/rpc-client.ts`
```typescript
export async function rpcCall(op: string, args: unknown, config: AdbConfig): Promise<unknown> {
  const reqId = `r-${Date.now()}-${counter++}`;
  const cmdJson = JSON.stringify({ reqId, op, args });
  await runShell(`echo '${cmdJson}' > /sdcard/imrpc/cmd.json`, config);   // 引号转义见 §12
  await execute("sendlink", { url: "page://imaudio.yunos.com/rpcagent" }, config).catch(async (e) => {
    if (isSleepExit(e)) await execute("sendlink", { url: "page://imaudio.yunos.com/rpcagent" }, config); // 设备睡眠重试1次
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const r = await runShell(`cat /sdcard/imrpc/result.json`, config);
    const p = safeJson(r.rawOutput);
    if (p && p.reqId === reqId) {
      if (!p.ok) throw new RpcError(p.error?.code ?? "RPC_ERROR", p.error?.message ?? "");
      return p.data;
    }
    await sleep(150);
  }
  throw new RpcError("RPC_TIMEOUT", `no response for ${op}`);
}
```

### 7.3 `yunos-adapter.ts`：throw → rpcCall
```typescript
async readSoundStage(): Promise<SoundstageReadResult> {
  const d = await rpcCall("soundstage.read", {}, adbConfig) as {mode:number;fade:number;balance:number};
  return { success:true, mode:d.mode, fade:d.fade, balance:d.balance } as SoundstageReadResult;
},
```
其余方法同理（按 §5.3 op 表）。DTO 映射在 adapter。

---

## 8. 构建 / 部署（Option B）

**车机侧（同事）**：
1. 我们交付：`ts/RpcEngine.ts` + manifest page 项（通用，一次性）。
2. 同事 merge 进 imaudio → AliOS 平台构建（system 签名）→ 产出 `.ypp` → `installYpp` 装车（或 adb install）。
3. 首次部署前 root 一次性 `mkdir -p /sdcard/imrpc`。

**配置（我们，push 迭代，不重构建）**：
4. 我们把 `/sdcard/imrpc/config.json`（§5 的 imaudio op 表）用 `adb push` / ZebraAlfred `pushFile` 推上去。改 op = 改配置 + 重推，**不麻烦同事**。

**PC 侧（我们）**：
5. 改 adb-executor + 加 rpc-client + 改 yunos-adapter + 加 mock 引擎；`tsc --noEmit` + `npm run build`。

**迭代回路**：engine 代码改动 = 同事重构建（罕见，engine 通用且稳定）；op 增改/调参 = 推配置（频繁、我们自己来）。

---

## 9. 错误处理

- **车机**：cmd 不可读→`BAD_ARGS`；未知 op→`UNKNOWN_OP`；manager/proxy 抛错→`RPC_ERROR`（带原始 message）。都写回 result.json，不静默。
- **PC**：超时→`RPC_TIMEOUT`；`ok:false`→抛 `RpcError(code,message)`；adapter catch 后走现有 `formatError`。
- **设备睡眠**：sendlink 间歇 exit -1（见记忆 `car-device-wakefulness-dependency`）；rpcCall 重试 1 次；用户保持 ZebraAlfred 开着。

---

## 10. 验证 / 测试（Option B 下 mock 是主力）

Option B 慢回路 → **PC mock 引擎是主要验证手段**，必须在交付同事前把 engine 逻辑做对：
- **PC mock 引擎**（Node）：镜像车机 engine 的 dispatch（dbus mock + native mock），用样本 config 跑全 op。`rpc-client` 单测：mock execute，验证 写cmd→sendlink→轮询cat→reqId→超时→ok:false。
- **一次真机桥测试**（设备在线时）：只验**桥本身**——root 写/system 读 `/sdcard/imrpc`、sendlink 拉起 rpcagent、页面生命周期、**一个**真实 op（`soundstage.read`，dbus 类）端到端。这是交付同事前的最小车机验证。
- **全 op e2e**：同事构建装车后，e2e 逐 op 验证（`读取声场`/`设置声场`/`调节EQ`…）。
- **分期**：Phase 1 = 桥 + soundstage（dbus）打通；Phase 2 = 按 §5.3 铺开（每加一组 op 只推配置）。

---

## 11. 验收标准

- [ ] 通用 RpcEngine 页 merge 进 imaudio，`sendlink page://imaudio.yunos.com/rpcagent` 能拉起、执行完自销毁。
- [ ] `/sdcard/imrpc/config.json` 可 push 迭代，engine 据此 dispatch（dbus + native 两类）。
- [ ] PC `rpcCall` 三步编排 + reqId 关联 + 超时 + 睡眠重试。
- [ ] yunos-adapter 对应方法不再 throw，返回真实 DTO。
- [ ] PC mock 引擎覆盖全 op dispatch 逻辑。
- [ ] Phase 1：`soundstage.read/set` 真机端到端跑通（用户确认）。
- [ ] Phase 2：§5.3 全部 op 可用（配置驱动）。

---

## 12. 实现期需验证的风险（非设计阻塞）

1. **文件权限**：root 写 `/sdcard/imrpc/*`，system-uid RpcEngine 能否读？（设备在线时实测；不行回退 `/data/local/tmp`+chmod 或 SysProp。）
2. **sendlink 拉起 rpcagent + 自销毁**：`onStart` 是否可靠触发、`finish()` API 是否存在（App.ts 有 `onDestroy`，大概率有）。
3. **native 反射**：`require("yunos/device/AudioManager").getInstance()[method](...)` 能否按名调原生方法、跨 app 上下文是否可 require 这些平台模块。
4. **echo 引号转义**：cmdJson 含单引号破坏 `echo '...'`（用 `printf %s` 或 base64 包裹规避）。
5. **页面闪屏**：rpcagent 在 `disp_host0` 拉起可能一闪（MVP 可接受；后续路由 `disp_guest0`）。
6. **配置热更**：engine 每次请求重读 config（简单可靠）还是缓存（快但要 push 后失效）——MVP 每次重读。

---

## 13. 不做（YAGNI / 后续）

- ❌ **网络监听口**（agil 未证实）：MVP 用 file/sendlink 已验证原语；日后实测 agil 有 socket 再升级。
- ❌ **本地构建 .ypp**：无平台树/system 密钥；Option B 同事构建。
- ❌ **常驻 Service / 轮询 agent**：自销毁 per-request 已够。
- ❌ **并发 rpc**：e2e 串行，MVP 不做。
- ❌ **`-e/-d` 内联请求**：待确认框架支持页面事件后作为"少一次 adb"优化。

---

## 14. 泛化路径（产品愿景，后续 phase）

参考实现（imaudio）打通后，泛化工作流 = **配置生成器**：
1. 输入：任意 app 的 proxy/manager 源码（同事交付，如 imaudio_app_code）。
2. 分析（LLM + 静态解析）：抽取每个 manager 方法的 SDK 调用（D-Bus 的 bus/path/method/arg，或 native 的 require/factory/method/args）。
3. 产出：该 app 的 `config.json`（op→调用规格）。
4. 复用：**同一个通用 RpcEngine 页**（所有 app 相同，同事 merge 一次）+ 生成器产出的 per-app config + 现有 pipeline 产出的 PC MCP server。

即"新 app = 新 config（生成器产）"，engine 与 PC MCP 生成链复用。这正对齐 `CONTEXT.md` 的 MCP CodeAgent Pipeline。

---

## 15. 与现有成果的关系

- 复用已验证 `sendlink`（方向1）作触发通道（无参形式）。
- `adb-executor` 的 `registerCommand` 模式扩展一个 `shell`。
- yunos-adapter 的 DTO/方法签名（已生成）不变，只换实现 throw → rpcCall。
- e2e（interactive.py）、analysis.json、tool 定义不动。
- ZebraAlfred 的 `installYpp` / `pushFile`（已查证存在于 app.so）作同事装车 / 我们推配置的通道。
