# imaudio 操作泛化设计：从单点到全部 17 操作

**日期**: 2026-06-17
**状态**: 设计已批准，待实现
**前置**: 单点 launch_app 已完成（见 `2026-06-17-real-adb-execution-design.md`）
**范围**: imaudio server 全部 17 个音频操作真实可用

---

## 1. 背景与目标

### 当前状态
- 单点 `launch_app`（sendlink）已真实可用
- 其余 17 个 imaudio tool 的 `yunos-adapter` 方法是 stub（throw not implemented）
- adb-executor 已有命令模式注册表（sendlink 已注册）

### 目标
让 imaudio server 的全部 17 个音频操作（equalizer/soundstage/beosonic/karaoke/locksound/vnc 的 read+set）通过 D-Bus 真实执行。

---

## 2. 约束

- **方案 A**：adb-executor 加通用 `dbus-call` + yunos-adapter 手写每方法
- **渐进策略**：验证机制 → 验证映射 → 批量（3 步，管控风险）
- **车机恢复是 hard prerequisite**：Step1（dbus-send 实测）阻塞 = 全部实现阻塞。车机离线期间只能做代码追溯/映射分析，无法编码验证
- **dbus-send 参数引号转义**：JSON 含双引号，adb-executor 用 `spawn` 传参数数组 + 单引号包裹 JSON（`string:'<json>'`），避开 adb shell 引号嵌套陷阱
- **配置全部 YAML，禁止环境变量**（沿用单点约束）
- **YAGNI**：不做静态分析自动提取（方案 C，终极阶段）

---

## 3. 已验证的事实（应用代码探索）

### 3.1 D-Bus method 调用模式（BaseProxy 统一）
```typescript
let msg = this._iface.createMethodCallMessage("<methodName>");
msg.writeString(this.generateQueryParam({ ...params }));   // 参数 = JSON 字符串
this._iface.sendMethodCallMessage(msg, (err, result) => {
    let data = result.readJSON();                            // 返回 = JSON
});
```
- **统一**：所有 method 用 `writeString(JSON)` 传参、`readJSON()` 解析返回
- **无需 D-Bus 类型签名推导**（最大难点消除）——参数永远是 `string:<json>`

### 3.2 参数序列化结构（generateQueryParam）
```json
{
  "body": { "<method 参数>", "vin": "<车机VIN>" },
  "header": { "token": "" }
}
```
每个 method 调用都包这个结构。vin 是车机标识，必填。

### 3.3 多 Proxy 结构（4 业务 Proxy，三元组各异）
| Proxy | busName | busPath | methods |
|-------|---------|---------|---------|
| IMAudioProxy | `imaudio.alios.cn` | `/imaudio/alios/cn` | 12 |
| AudioPolicyProxy | `BUS_NAME` 常量(待查) | `BUS_PATH` | 8 |
| MAFProxy | `cn.alios.mafservice.mediacenter` | `/cn/alios/mafservice/mediacenter` | 7 |
| IMMusicProxy | `cn.alios.mafservice.data.music` | `/cn/alios/mafservice/data/music` | 2 |

interface = busName + ".interface"（BaseProxy 默认）。

### 3.4 capability ↔ Proxy method 关系
- 17 capability（analysis.json，Model 层）与 29 Proxy method（D-Bus 层）**非 1:1**
- 需逐个追溯 `Model → Manager → Proxy method` 定位（这是手写 17 方法的主要工作量）

### 3.5 车机有 dbus-send
`/usr/bin/dbus-send` 已验证存在（dbus-send/dbus-monitor/busctl/dbus-daemon 完整工具链）。

---

## 4. 架构

```
yunos-adapter (17 方法, 渐进实现)
  每方法:
    1. 组装 params (capability 参数)
    2. 序列化 generateQueryParam 结构 (body+vin, header)
    3. adb-executor.dbusCall(busName, busPath, method, paramsJson, busType)
    4. 解析返回 JSON → Result 类型

adb-executor (已有 sendlink, 新增 dbus-call)
  registerCommand("dbus-call", (a) =>
    `shell dbus-send --${a.busType} --print-reply --dest=${a.busName} ${a.busPath} ${a.interface}.${a.method} "string:${a.paramsJson}"`)
  + 解析 --print-reply 输出
```

---

## 5. 参数序列化（复刻 generateQueryParam）

yunos-adapter 内复刻（不依赖应用代码）：
```typescript
function buildParam(methodParams: Record<string, unknown>, vin: string): string {
  return JSON.stringify({
    body: { ...methodParams, vin },
    header: { token: "" },
  });
}
```

---

## 6. D-Bus 三元组映射

每 capability 的 (busName, busPath, method) 通过追溯 `sourceRef → Model → Manager → Proxy` 定位。

**AudioPolicyProxy 的 BUS_NAME/BUS_PATH 常量**：Step2 时查 `AudioPolicyProxy.ts` 顶部常量定义补全。

三元组表随实现填充（spec 不预填未追溯的，避免错误假设）。

---

## 7. 渐进 3 步实施（核心风险管控）

### Step 1：实测 dbus-send 机制（待车机恢复）
- 车机恢复后，手动跑：
  ```
  adb -host shell dbus-send --session --print-reply --dest=imaudio.alios.cn /imaudio/alios/cn imaudio.alios.cn.interface.querySoundLibrary
  ```
- 确认：session vs system bus、返回 JSON 格式、权限
- **不通过则停止**，重新评估机制

### Step 2：追溯 + 实现 1-2 个 capability（验证映射模式）
- 选映射明确的（如 `equalizer_read` → IMAudioProxy 的 query method）
- 追溯 Model→Manager→Proxy method + params
- yunos-adapter 实现 + adb-executor dbus-call 注册
- 端到端实测（车机真实返回）
- **映射模式确认**后进入 Step3

### Step 3：批量其余 capability
- 模式确认后，按 Step2 模板机械复制
- 每 domain 一组（equalizer/soundstage/beosonic/karaoke/locksound/vnc）
- 每个追溯 + 实现 + 测试

---

## 8. vin 获取

- **首版**：`config.yaml` 配置 `vin: "<车机VIN>"`
- config.ts 扩展读 vin，传 yunos-adapter
- **后续优化**：carinfo_read 查询缓存（Step3 后）

---

## 9. 返回解析（dbus-send --print-reply）

dbus-send --print-reply 输出形如：
```
method return time=... sender=... destination=...
   string "{\"code\":0,\"data\":...}"
```
adb-executor 解析：提取 `string "..."` 内的 JSON，JSON.parse → ExecResult.parsed。

---

## 10. 错误处理

- adb 执行失败 / dbus-send 非零退出 → `{success:false, rawOutput}`
- JSON 解析失败 → `{success:false, error:"invalid reply JSON"}`
- dbus error reply（如 service 不存在/权限）→ 透传 rawOutput
- 不重试（YAGNI）

---

## 11. 风险

| 风险 | 缓解 |
|------|------|
| dbus-send 实测不通过（session/system/权限） | Step1 先验证，不通过则停 |
| capability→method 映射复杂（部分非 1:1） | Step2 验证模式；个别复杂 capability 单独处理或降级 stub |
| vin 未知 | config 配置；或 Step1 实测时通过 carinfo 查 |
| AudioPolicyProxy 三元组常量未查 | Step2 时查源码补全 |

---

## 12. 验收标准

- [ ] adb-executor 注册 `dbus-call` 命令 + --print-reply 返回解析
- [ ] config.yaml + config.ts 加 `vin` 配置
- [ ] Step1：dbus-send 实测 querySoundLibrary 返回 JSON（车机恢复后）
- [ ] Step2：1-2 个 capability（如 equalizer_read）端到端真实返回
- [ ] Step3：17 个 capability 全部真实可用（端到端验证）
- [ ] mock-adapter 同步更新（保持 e2e 测试可用）
- [ ] 其余 domain capability 如映射过难，降级为 stub + 文档记录（不阻塞）

---

## 13. 不做（YAGNI）

- ❌ 静态分析自动提取（方案 C，终极阶段）
- ❌ 泛化到 aipet/hvac（先做深 imaudio）
- ❌ 配置驱动映射表（方案 B，收益有限）
- ❌ vin 自动查询缓存（首版配置）
- ❌ 任何环境变量配置
