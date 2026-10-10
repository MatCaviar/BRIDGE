# channel-bridge — channelCall 平台统一契约的通用 HTTP 桥模板

把 BRIDGE 的 HTTP transport 桥接到任意实现了 channelcall-sdk `IChannelProvider` 的车机应用——
**平台统一契约意味着一个桥可探全部应用**（有源码、无源码皆可），目标由 `targets.json` 参数化。

## 用法（项目接入三步）

1. 复制本模板到你的项目（或在项目内直接引用本目录构建）；
2. 编辑 `channel-adapter/src/main/assets/targets.json`：
   ```json
   { "<toolName>": {"package": "com.x", "service": "com.x.XChannelProviderService", "channel": true},
     "<页面技能工具>": {"package": "com.y", "activity": "", "channel": false} }
   ```
   `channel:true` 走 `IChannelProvider` bind（`discover-device.mjs` 可自动发现生成）；
   `channel:false` 走 `am start` 页面直达；
3. `bash build-apk.sh` 离线构建（aidl→javac→d8→aapt2→sign，需 Android SDK + JDK，零 gradle/网络）。

## 部署

```bash
adb install -r channel-adapter.apk
adb shell am start -n com.immotors.bridge.imaudio/.BridgeActivity   # 启动桥（127.0.0.1:8766）
adb forward tcp:8766 tcp:8766
# 宿主: analysis.json transport 指向 http://127.0.0.1:8766/call，serve/call 即通
```

## 契约依据

`channel-adapter/src/main/aidl/` 下的接口自 channelcall-sdk AAR 逆向还原（常量池解析），
parcel 布局注释在文件头：`onChannelCall(requestId, argsJson, callback)` / `onResult(requestId, code, message, dataJson)`，
事务码均为 1（单方法接口）。桥对 action 透明：`arguments` 原样透传，应用侧新增能力零改桥。

配套：`skills/bridge-analyze/discover-device.mjs`（感知：发现车机各 app 通道服务，产出 targets.json）、
`skills/bridge-analyze/calibrate.mjs`（校准：错误码驱动契约自修复）。
