# bridge-executor — 车端执行器

`com.immotors.bridge.executor`(system priv-app)。bind 目标 app 现有 AIDL service, 按 registry 分派。
机制: execmd(imaudio executeCommand) / media(MediaController) / mapnav(BanmaMap navigateToForAI) / carcontrol(CustomService sendMessage) / intent。
构建: macOS/Linux 运行 `./gradlew clean assembleDebug`，Windows 运行 `gradlew.bat clean assembleDebug`（使用本机已配置的 JDK 17 与 Android SDK）。
部署: /system/priv-app push + reboot(车封 sideload)。坑与契约细节: 见仓库根 handoff/README.md §6。
