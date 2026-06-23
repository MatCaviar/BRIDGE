# 车内 RPC Agent 设计（扩展 imaudio，打通全部精细功能）

**日期**: 2026-06-22
**状态**: 设计已批准，待 writing-plans 生成实现计划
**前置**: 单点 launch_app + 方向1 系统级跳转泛化（sendlink 已验证可用）
**目标**: 让 PC 端 e2e 能控制 imaudio 的**全部精细功能**（EQ/声场/Beosonic/卡拉OK/锁车音/车辆信息等），突破之前 D-Bus 权限墙。

---

## 1. 背景与目标

### 背景
应用内精细功能（equalizer/soundstage 等）走应用 kdbus，被车机系统权限阻断（root 的 `dbus-send`/`busctl` 从 adb shell 无法访问 uid 1000 的 D-Bus；详见 `2026-06-17-imaudio-generalization-design.md` 与项目记忆 `yunos-sendlink-capability-boundary`）。

**关键事实（已查证）**：
- imaudio 应用 `manifest.json` 声明 `sharedUserId: "system"`，以 **uid 1000** 运行。
- 它通过两条路径调全部音频 SDK：① `ubus` 模块的 D-Bus（`new UBus("dbus")` → `imaudio.alios.cn` / `com.yunos.audiopolicyservice` 等总线）；② 进程内原生绑定（`AudioManager` / `audiopolicysdk` / `CarPropertyManager` 等）。
- `ts/manager/*` 与 `ts/proxy/*` 就是这些 SDK 调用的现成实现（`EqualizerManager`、`SoundStageManager`、`KaraokeManager`、`BeosonicManager`、`LockSoundManager`、`CarInfoModel`）。
- 我们有完整 `imaudio_app_code` 源码，且具备**完整系统应用构建能力**（system 签名 + 装到 EP33L + uid 1000）。

### 目标
在 imaudio 应用内增加一个以 system uid 运行的 **RPC agent 页**，接收 PC 经 adb 下发的命令，直接调用现成 manager，把结果写回文件供 PC 读取。从而让 PC 端 MCP server 的 yunos-adapter 不再 `throw "not implemented"`，而是真实控制全部精细功能。

### 核心洞察
MCP server **不必打进车机**。PC 端 MCP server 保持现状（e2e 经 stdio 连它），只在车机内增加一个 uid-1000 执行器，用**已验证的 adb 通道**驱动。这绕开了 agil 运行时"是否有网络监听原语"的未知（用户最初"把 MCP server 打进车机"的愿景作为后续优化，见 §9）。

---

## 2. 约束

- **扩展 imaudio**（非新建独立应用）：manager/proxy 代码现成，最少代码、最快验证。代价：需重装生产 imaudio（研究/内部用途可接受）。
- **MVP 只用已验证原语**：adb shell（root）、sendlink 无参拉起（已验证）、文件读写（app 已用 `yunos/cloudfs/File`）、`adb cat`。
- **不依赖** agil 网络监听 / 常驻 Service 原语（未证实）。
- **e2e 不变**：仍 stdio 连 PC 端 mcp-imaudio。
- **tool/schema/analysis.json 不变**：已生成的工具定义照旧，只换 yunos-adapter 底层实现。
- **每次请求拉起 rpcagent 页**（无状态，MVP 简单），非常驻轮询。
- **请求串行**：e2e 一次一个 tool call，MVP 不处理并发。

---

## 3. 架构

```
PC e2e (interactive.py)  ──MCP stdio──  PC mcp-imaudio (node)
                                            │  tool: soundstage_set / equalizer_* / ...
                                            ▼  rpcCall(op, args)
                                  ┌─── adb -host shell echo '<cmdJson>' > /sdcard/imrpc/cmd.json
                                  ├─── adb -host shell sendlink page://imaudio.yunos.com/rpcagent  (无参拉起)
                                  └─── adb -host shell cat /sdcard/imrpc/result.json  (轮询至 reqId 匹配)
车机 rpcagent 页 (uid 1000, system)  ◀── sendlink 拉起
   读 /sdcard/imrpc/cmd.json
   → dispatch[op] → 现成 manager 方法（SoundStageManager.setSoundStage(...) 等）
   → 写 /sdcard/imrpc/result.json = {reqId, ok, data|error}
```

**组件**：
1. **车机 rpcagent 页**（新，扩展进 imaudio）：接收命令 → 调 manager → 写结果。
2. **PC `rpc-client.ts`**（新）：编排 写cmd → sendlink 触发 → 轮询 cat 结果。
3. **PC `yunos-adapter.ts`**（改）：每个方法 → `rpcClient.call(op, args)` + 映射 DTO。
4. **PC `adb-executor.ts`**（改）：加通用 `shell` 命令（`adb -host shell <cmd>`）。
5. **e2e / tool / schema / analysis.json**：不变。

---

## 4. 请求/响应契约

### 请求（PC 写入 `/sdcard/imrpc/cmd.json`）
```json
{ "reqId": "r-1719000000-1", "op": "soundstage.set", "args": { "mode": 1, "fade": 0, "balance": 0 } }
```
- `reqId`：PC 生成（时间戳+计数），用于关联响应、识别残留旧结果文件。
- `op`：`<domain>.<action>` 字符串，见 §6 op 表。
- `args`：op 对应的参数对象。

### 响应（rpcagent 写入 `/sdcard/imrpc/result.json`）
成功：
```json
{ "reqId": "r-1719000000-1", "ok": true, "data": { "mode": 1, "fade": 0, "balance": 0 } }
```
失败：
```json
{ "reqId": "r-1719000000-1", "ok": false, "error": { "code": "RPC_ERROR", "message": "setSoundStage rejected" } }
```
- `data`：manager 方法的原始返回（由 PC adapter 映射为 DTO）。
- `error.code`：`UNKNOWN_OP` | `RPC_ERROR` | `BAD_ARGS`。

### PC 读取流程（rpc-client.ts）
1. 生成 `reqId`，写 cmd.json。
2. `sendlink page://imaudio.yunos.com/rpcagent`（无参拉起）。
3. 每 ~150ms `cat result.json`，解析，若 `reqId` 匹配则返回；超时 ~5s 抛 `RPC_TIMEOUT`。
4. 读取后可选清空 result.json（避免下次误读；reqId 匹配已足够，清空为加固）。

---

## 5. 车机 rpcagent 页设计

### 5.1 manifest 加 page（`imaudio_app_code/manifest.json` pages 数组追加）
```json
{
  "uri": "page://imaudio.yunos.com/rpcagent",
  "content_path": "src/RpcAgent.js",
  "main": false,
  "capabilities": { "ui": { "engine": "agil", "display": "disp_host0" } },
  "extension": {}
}
```

### 5.2 `ts/RpcAgent.ts`（编译到 `src/RpcAgent.js`）
结构（伪代码，用已证实的原语）：
```typescript
import { BMPage } from "extend/hdt/page/BMPage";   // 同 App.ts 的页基类
import { SoundStageManager } from "./manager/SoundStageManager";
import { EqualizerManager } from "./manager/EqualizerManager";
// ... Phase 2 追加 KaraokeManager / BeosonicManager / LockSoundManager / CarInfoModel
import { File, FileReader, FileWriter } from "yunos/cloudfs/File";  // app 已用的 FS API
import { Log } from "./utils/Log";

const CMD_PATH = "/sdcard/imrpc/cmd.json";
const RESULT_PATH = "/sdcard/imrpc/result.json";

const dispatch: Record<string, (args: any) => Promise<any>> = {
  // Phase 1（验证桥）
  "soundstage.read": async () => SoundStageManager.getInstance<SoundStageManager>().getSoundStage(),
  "soundstage.set":  async (a) => SoundStageManager.getInstance<SoundStageManager>()
                            .setSoundStage(a.mode, a.fade, a.balance),
  // Phase 2 在此追加 equalizer.* / karaoke.* / beosonic.* / locksound.* / carinfo.*
};

class RpcAgent extends BMPage {
  onStart() { this.runRpc(); }
  private async runRpc() {
    let cmd: any;
    try {
      cmd = JSON.parse(await readFile(CMD_PATH));
    } catch (e) {
      await writeResult({ reqId: "", ok: false, error: { code: "BAD_ARGS", message: "cmd unreadable" } });
      return;
    }
    const handler = dispatch[cmd.op];
    if (!handler) {
      await writeResult({ reqId: cmd.reqId, ok: false, error: { code: "UNKNOWN_OP", message: cmd.op } });
      return;
    }
    try {
      const data = await handler(cmd.args || {});
      await writeResult({ reqId: cmd.reqId, ok: true, data });
    } catch (e) {
      await writeResult({ reqId: cmd.reqId, ok: false, error: { code: "RPC_ERROR", message: String(e) } });
    }
  }
}
// readFile / writeResult 用 yunos/cloudfs File API 实现（参考 utils/EqualizerConfigStore.ts 用法）
```

### 5.3 复用
manager/proxy 代码原样使用——它们就是 SDK 调用本身，无需重写。rpcagent 页只做"读命令 → 分发 → 写结果"。

---

## 6. 功能范围与 op 表

**范围 = 全部 imaudio 精细功能**；实现分期（Phase 1 验证桥，Phase 2 机械铺开）。

### Phase 1（验证桥，真机端到端跑通一轮）
| op | manager 方法（已查证） | 说明 |
|----|------------------------|------|
| `soundstage.read` | `SoundStageManager.getSoundStage()` | 返回 `{mode, fade, balance}`（AudioPolicyProxy `requstGetSoundEffectsMode`） |
| `soundstage.set` | `SoundStageManager.setSoundStage(mode, fade?, balance?)` | 设置声场（`requstSetSoundEffectsMode`） |

### Phase 2（铺开，op→manager 方法映射，源自 `ts/manager/*`）
| op | manager 方法 |
|----|--------------|
| `equalizer.read_band` | `EqualizerManager.getAudioEffectCustomizedEQ(bandIndex)` |
| `equalizer.set_band` | `EqualizerManager.setAudioEffectCustomizedEQ(bandIndex, centerFreq, bandLevel)` |
| `equalizer.set_all` | `EqualizerManager.setAllAudioEffectCustomizedEQ(values[])` |
| `equalizer.list` | `EqualizerManager.getEqualizerList(type)` |
| `equalizer.add_custom` / `update_custom` / `delete_custom` | `add/update/deleteEqualizerCustomItem` |
| `equalizer.share_code` / `add_by_share_code` | `getEqualizerShareCode` / `addEqualizerShareCode` |
| `beosonic.read` / `set_point` | `BeosonicManager.getEffectValuesFromAudioManager()` / `sendEffectValuesToAudioManager({x,y,z})` |
| `beosonic.list_offical` / `list_custom` | `getOfficalList()` / `getCustomList()` |
| `karaoke.fast_audio.get` / `set` | `KaraokeManager.get/setFastAudioMode(mode)` |
| `karaoke.mic_vol.get` / `set` | `getMicVol()` / `setMicVol(0–10)` |
| `karaoke.media_vol.get` / `set` | `getMediaVolume()` / `setMediaVolume(volume)` |
| `karaoke.vocal_cut.get` / `set` | `getVocalCutLevel()` / `setVocalCutLevel(0–100)` |
| `locksound.list_cloud` / `list_local` / `current` / `apply` / `download` / `remove` / `preview` | `LockSoundManager.*` 对应方法 |
| `carinfo.vin` / `bscreen` / `gear` / `is_parking` | `CarInfoModel.getVin()` / `getBScreenStatus()` / `getGearStatus()` / `isParking()` |

> 完整方法签名见 `imaudio_app_code/ts/manager/*` 与 `ts/proxy/*`（Agent 探查已盘点）。Phase 2 每个 op 在实现时对照源码确认参数/返回。

---

## 7. PC 侧改动（mcp-imaudio）

### 7.1 `adb-executor.ts`：加通用 `shell` 命令
```typescript
registerCommand("shell", (a) => `shell ${String(a.cmd)}`);
```
（`sendlink` 保持不变。）

### 7.2 新增 `src/rpc-client.ts`
编排三步：
```typescript
export async function rpcCall(op: string, args: unknown, config: AdbConfig): Promise<unknown> {
  const reqId = `r-${Date.now()}-${counter++}`;        // PC 侧唯一
  const cmdJson = JSON.stringify({ reqId, op, args });
  // 1. 写 cmd（用 MSYS_NO_PATHCONV 防 git-bash 路径转换；PC 侧 adb 在 Windows）
  await runShell(`echo '${cmdJson}' > /sdcard/imrpc/cmd.json`, config);
  // 2. 触发 rpcagent
  await execute("sendlink", { url: "page://imaudio.yunos.com/rpcagent" }, config);
  // 3. 轮询 cat result，匹配 reqId
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const r = await runShell(`cat /sdcard/imrpc/result.json`, config);
    const parsed = safeJson(r.rawOutput);
    if (parsed && parsed.reqId === reqId) {
      if (!parsed.ok) throw new RpcError(parsed.error?.code ?? "RPC_ERROR", parsed.error?.message ?? "");
      return parsed.data;
    }
    await sleep(150);
  }
  throw new RpcError("RPC_TIMEOUT", `rpcagent no response for ${op}`);
}
```
（`runShell` = `execute("shell", {cmd}, config)` 的薄封装；`counter`/`sleep`/`safeJson`/`RpcError` 辅助。）

### 7.3 `yunos-adapter.ts`：每个 throw 方法改为 rpcCall
示例（`readSoundStage` / `setSoundStage`）：
```typescript
async readSoundStage(): Promise<SoundstageReadResult> {
  const data = await rpcCall("soundstage.read", {}, adbConfig) as { mode:number; fade:number; balance:number };
  return { success: true, mode: data.mode, fade: data.fade, balance: data.balance } as SoundstageReadResult;
},
async setSoundStage(mode, fade?, balance?): Promise<SoundstageSetResult> {
  await rpcCall("soundstage.set", { mode, fade, balance }, adbConfig);
  return { success: true } as SoundstageSetResult;
},
```
其余方法同理（按 §6 op 表）。DTO 映射在 adapter 内完成。

---

## 8. 构建 / 部署

### 车机侧（imaudio_app_code）
1. 加 `ts/RpcAgent.ts` + manifest page 项（§5.1）。
2. 现有构建链：`tsc` → `src/RpcAgent.js`（`tsconfig.json` outDir 已是 `./src`）。
3. `yunos.mk` 打包（`LOCAL_SRC_FILES` 已含 `src/*`），system 签名（`LOCAL_CERTIFICATE := system`）。
4. 装到 EP33L（`adb -host install` 或 YunOS pm）。
5. 首次部署前在车机 `mkdir -p /sdcard/imrpc`（root 一次性）。

### PC 侧（mcp-imaudio）
6. 改 `adb-executor.ts`（加 shell）、加 `rpc-client.ts`、改 `yunos-adapter.ts`。
7. `tsc --noEmit` + `npm run build`。

---

## 9. 错误处理

- **车机侧**：cmd 不可读 → `BAD_ARGS`；未知 op → `UNKNOWN_OP`；manager 抛错 → `RPC_ERROR`（message 含原始错误）。均写回 result.json，不静默。
- **PC 侧**：rpcCall 超时 → `RPC_TIMEOUT`；rpcagent 返回 `ok:false` → 抛 `RpcError(code,message)`。yunos-adapter catch 后走现有 `formatError`（domain error code）。
- **设备睡眠**：sendlink 可能间歇 exit -1（见项目记忆 `car-device-wakefulness-dependency`）。rpcCall 在 sendlink 步失败时重试 1 次；用户保持 ZebraAlfred 开着。

---

## 10. 验证 / 测试

### 单测（PC，vitest）
- `rpc-client.test.ts`：mock `execute`/`runShell`，验证 写cmd→sendlink→轮询cat 的编排、reqId 匹配、超时、ok:false 抛错。
- `yunos-adapter` 方法单测：mock rpcCall，验证 op/args 与 DTO 映射。

### 真机 e2e（Phase 1 验收）
- `读取当前声场` → LLM 调 `soundstage_read` → 返回真实 `{mode,fade,balance}`。
- `把声场设为驾驶位` → LLM 调 `soundstage_set` → 实机生效（用户确认屏幕）。
- 单次往返 < 2s。

### Phase 2 验收
- 全部 op 真机可读可写；yunos-adapter 无 `throw "not implemented"`。

---

## 11. 验收标准

- [ ] rpcagent 页打进 imaudio，system uid 运行，`sendlink page://imaudio.yunos.com/rpcagent` 能拉起。
- [ ] PC `rpcCall` 三步编排 + reqId 关联 + 超时。
- [ ] Phase 1：`soundstage.read`/`.set` 真机端到端跑通（用户确认）。
- [ ] yunos-adapter 对应方法不再 throw，返回真实 DTO。
- [ ] 单测覆盖 rpc-client 编排与 adapter 映射。
- [ ] Phase 2：§6 全部 op 可用。

---

## 12. 实现期需验证的风险（非设计阻塞）

1. **文件权限**：root 写 `/sdcard/imrpc/cmd.json`，system-uid rpcagent 能否读？（大概率可，/sdcard 通常 world-readable；若不行回退 `/data/local/tmp`+chmod 或 SysProp。）
2. **sendlink 无参拉起 rpcagent**：是否可靠触发 `onStart`？（应同主页面机制；实测一次。）
3. **manager 单例在 rpcagent 页内初始化**：`SoundStageManager.getInstance()` 在 App 页之外能否正常 init？（惰性单例，应可；实测。）
4. **页面闪屏**：rpcagent 在 `disp_host0` 拉起可能一闪。（MVP 可接受；后续可路由 `disp_guest0` 或透明页。）
5. **结果文件残留**：reqId 匹配已能区分；读后清空为加固。
6. **echo 引号转义**：cmdJson 含单引号会破坏 `echo '...'`。（MVP 用 `printf` 或 base64 包裹规避；实现时定。）

---

## 13. 不做（YAGNI / 后续）

- ❌ **MCP server 直接打进车机**（用户最初愿景）：需 agil 网络监听原语，未证实。MVP 用 adb 桥等效达成目标；后续若查实 agil 有 socket 原语再升级。
- ❌ **常驻 Service / 轮询 agent**（降延迟）：需框架 Service 能力，未证实。MVP 每次拉起页面足够。
- ❌ **`-e/-d` 内联请求**（少一次 adb 往返）：待确认框架支持页面事件后作为优化。
- ❌ **原生 C++ daemon**（真 socket，架构 B）：JS 路径若被堵再考虑。
- ❌ **并发 rpc**：e2e 串行，MVP 不做。
- ❌ **xinger（cpid）**：与本项目无关。

---

## 14. 与现有成果的关系

- 复用已验证的 `sendlink`（方向1）作为触发通道（无参形式）。
- `adb-executor` 命令注册模式（`registerCommand`）扩展一个 `shell`。
- yunos-adapter 的 DTO/方法签名（已生成）不变，只换实现从 throw → rpcCall。
- e2e（interactive.py）、analysis.json、tool 定义全部不动。
