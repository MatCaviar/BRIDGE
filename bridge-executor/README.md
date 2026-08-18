# bridge-executor — 车端执行器

`com.immotors.bridge.executor`(system priv-app)。bind 目标 app 现有 AIDL service, 按 registry 分派。
机制: execmd(imaudio executeCommand) / media(MediaController) / mapnav(BanmaMap navigateToForAI) / carcontrol(CustomService sendMessage) / intent。
构建: `export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" && ./gradlew clean :bridge_executor:assembleDebug`(改 .kt 必须 clean)。
部署: /system/priv-app push + reboot(车封 sideload)。坑与契约细节: 见仓库根 handoff/README.md §6。
