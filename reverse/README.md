# 逆向素材

车端 app 的 dex 反编译 dump（**体积大, 不入库**）。素材在交接人本地:

| 素材 | 本地路径 | 内容 | 用途 |
|---|---|---|---|
| imaudio-dex | `D:\IM\bridge_test\reverse\imaudio-dex\` | 车 v1 imaudio classes*.dex dump | execmd 契约/UI 状态源 |
| map-dex | `D:\IM\bridge_test\reverse\map-dex\` | BanmaMap dex | 88 方法声明序事务码/Parcelable 布局 |
| va-dex | `D:\IM\bridge_test\reverse\va-dex\` | VoiceAssistant dex | AI 规范实现参考 |
| ccs-dex | `D:\IM\bridge_test\reverse\ccs-dex\` | CarControlService dex | CustomService 契约/handler 清单 |
| byod-dex | `D:\IM\bridge_test\reverse\byod-dex\` | ByodService dex | 全量 domainfunctions 常量(500+ 功能) |

## 入库的产物（tools/）

- `carcontrol_handlers.json` — 57 个 handler → functionId 映射（本车 CustomService 实际注册）
- `carcontrol_tools_candidate.json` — 57 个候选 registry 工具（status=candidate, 待批量 probe 验证）

## 提取方法（新素材时）

```bash
# 车上解压 dex → 拉回本地
adb shell "rm -rf /data/local/tmp/xdex && mkdir -p /data/local/tmp/xdex && unzip -o <apk> 'classes*.dex' -d /data/local/tmp/xdex"
adb pull /data/local/tmp/xdex <本地目录>
# 反编译为文本(Windows 注意用 exec-out 或本地文件避免编码问题)
dexdump -d classes.dex > classes.dex.txt
```
