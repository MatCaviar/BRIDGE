#!/usr/bin/env bash
# 离线构建 channel-adapter.apk（无 gradle/AGP，零网络依赖）
# 链路：aidl 生成 Stub/Proxy → javac → d8 → aapt2 link → 注入 classes.dex → zipalign → apksigner
# 前提：Android SDK（platforms/android-36 + build-tools/37.0.0）与 JDK（javac/keytool）
set -euo pipefail

SDK="D:/Android/Sdk"
BT="$SDK/build-tools/37.0.0"
PLATFORM="$SDK/platforms/android-36/android.jar"
ROOT="$(cd "$(dirname "$0")" && pwd)" && ROOT="D:${ROOT#/d}"   # 归一为 D:/... 形式，供 PE 工具直接使用
SRC="$ROOT/channel-adapter"
OUT="$ROOT/build"

# d8/R8 需要 Java 11+：Android Studio JBR 优先（d8.bat/apksigner.bat 先读 JAVA_HOME）
export JAVA_HOME="D:\\android studio\\jbr"
export PATH="/d/android studio/jbr/bin:$PATH"

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes"

echo "[1/6] AIDL → Java Stub/Proxy"
"$BT/aidl.exe" -I "$SRC/src/main/aidl" \
  "$SRC/src/main/aidl/com/alios/toolsmanager/channel/IChannelResultCallback.aidl" \
  "$OUT/gen/com/alios/toolsmanager/channel/IChannelResultCallback.java"
"$BT/aidl.exe" -I "$SRC/src/main/aidl" \
  "$SRC/src/main/aidl/com/alios/toolsmanager/channel/IChannelProvider.aidl" \
  "$OUT/gen/com/alios/toolsmanager/channel/IChannelProvider.java"

echo "[2/6] javac"
find "$SRC/src/main/java" "$OUT/gen" -name '*.java' | while read -r f; do cygpath -m "$f"; done > "$OUT/sources.txt"
javac -source 11 -target 11 -encoding UTF-8 -cp "$PLATFORM" -d "$OUT/classes" @"$OUT/sources.txt"

echo "[3/6] d8 → classes.dex"
"$BT/d8.bat" --release --min-api 28 --lib "$PLATFORM" --output "$OUT" \
  $(find "$OUT/classes" -name '*.class')

echo "[4/6] aapt2 link（manifest + assets/targets.json）"
"$BT/aapt2.exe" link -o "$OUT/unsigned.apk" -I "$PLATFORM" \
  -A "$SRC/src/main/assets" \
  --manifest "$SRC/src/main/AndroidManifest.xml" \
  --min-sdk-version 28 --target-sdk-version 36

echo "[5/6] 注入 classes.dex"
python - "$OUT" <<'PYEOF'
import sys, zipfile, os
out = sys.argv[1]
apk = os.path.join(out, "unsigned.apk")
with zipfile.ZipFile(apk, "a", zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(out, "classes.dex"), "classes.dex")
print("classes.dex injected ->", apk)
PYEOF

echo "[6/6] zipalign + apksigner"
"$BT/zipalign.exe" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
KEYSTORE="$HOME/.android/debug.keystore"
WIN_KEYSTORE="$(cygpath -w "$KEYSTORE")"
if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$HOME/.android"
  keytool -genkeypair -keystore "$WIN_KEYSTORE" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US"
fi
"$BT/apksigner.bat" sign --ks "$WIN_KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --out "$ROOT/channel-adapter.apk" "$OUT/aligned.apk"

"$BT/apksigner.bat" verify --print-certs "$ROOT/channel-adapter.apk" | head -5
echo "OK -> $ROOT/channel-adapter.apk"
