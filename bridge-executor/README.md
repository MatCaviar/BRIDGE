# bridge-executor — 车端执行器源码

`com.immotors.bridge.executor`（system priv-app）。bind 目标 app 现有 AIDL service，所有 per-app 知识在 bridge 侧（registry + 手写契约类）。

## 目录

- `src/main/aidl/com/immotors/aidl/` — imaudio 车 v1 契约（**AIDL 声明顺序 = 事务码顺序**: registerCallback=1 / unregisterCallback=2 / executeCommand=3）
- `src/main/java/com/immotors/bridge/executor/ExecutorActivity.kt` — 主逻辑：cmd.json → 按 mechanism 分派 → result.json
- `src/main/java/com/banma/custom/` — CarControlService 契约（手写 binder, 声明序事务码: registerCallback=1/unregisterCallback=2/sendMessage=3/isServiceReady=4）
- `src/main/java/com/ebanma/map/openapi/basicclass/` — BanmaMap common 接口（手写 binder, **88 方法声明序事务码**; typed-parcelable 带 size 前缀）
- `src/main/AndroidManifest.xml` — 权限: BIND_SERVICE + MEDIA_CONTENT_CONTROL + ACCESS_CARCONTROL_SERVICE

## mechanism 分派

| mechanism | 路径 |
|---|---|
| `execmd` | bind imaudio → IIMAudioService.executeCommand({command, params})（**参数键是 params 不是 jsonRequest**） |
| `media` | MediaSessionManager 控制活跃媒体会话（media_* 内置, 无需 registry） |
| `mapnav` | bind BanmaMap common → getMapServiceReadyState → (缺坐标时 getSearchDataByKeyWords 或内置 POI 兜底) → navigateToForAI |
| `carcontrol` | bind CarControlService CustomService → sendMessage(JSON functionId 契约) |
| `intent` | startActivity 页面跳转 |

## 构建

```bash
# JAVA_HOME 用 Android Studio 自带 jbr; 改 .kt 后必须 clean(增量会吃旧 dex 缓存)
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
./gradlew clean :bridge_executor:assembleDebug
# 产物: bridge_executor/build/outputs/apk/debug/bridge_executor-debug.apk
```

## 部署（车封 sideload, 必须 /system + reboot）

1. push APK → `/system/priv-app/bridge_executor/bridge_executor.apk`(chmod 644 + chcon u:object_r:system_file:s0) + `sync`
2. reboot（`persist.adb.tcp.port=5555` 已设, 无线 adb 重启后不掉）
3. 重启后 `adb root`（adbd 掉回 shell）
4. registry: 生成后推到 `/data/user/10/com.immotors.bridge.executor/files/registry.json`（chown u10_a206, chmod 664）
5. 验证: `dumpsys package` 的 MEDIA_CONTENT_CONTROL granted=true

## 关键坑（详见 handoff/README.md §6）

- 本 ROM 显式 bind 也要求 intent action 匹配 filter → registry 每工具带 bindAction
- 部分服务 onBind 读 `packageName` extra 做白名单（空则静默拦截）→ bind intent 带 packageName
- typed-parcelable 的 writeToParcel 必须带 size 前缀块 + 0/1 标记（"Overflow in the size of parcelable" 即此坑）
- 事务码以对端 dex 的 TRANSACTION_* 常量值为准（声明序 vs 字母序, 不能猜）
- media 机制必须 priv-app（MEDIA_CONTENT_CONTROL 是 signature|privileged）

## 签名

部署需要 platform 签名 keystore（`8797_platform.jks`）。**keystore 与密码不随仓库分发**——找交接人取（见 handoff/README.md §7 凭据位置）。
