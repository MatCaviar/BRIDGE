package com.immotors.bridge.imaudio;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * 桥接入口：启动 HTTP 桥并显示状态。
 *
 * 多目标路由：assets/targets.json 配置 { "<toolName>": {"package":..., "service":..., "channel": true/false} }。
 * channel=true 的工具按各自目标包名/服务 bind IChannelProvider（channelcall-sdk 平台统一契约，
 * 任意 8797 应用通道服务均可作目标——无源码应用的契约发现场景）；channel=false 走 am start 页面技能。
 * 未配置的工具名回退默认 imaudio 目标（向后兼容）。
 *
 * 部署链路（README 有完整手册）：
 *   adb install channel-adapter.apk
 *   adb shell am start -n com.immotors.bridge.imaudio/.BridgeActivity
 *   adb forward tcp:8766 tcp:8766
 *   宿主：mcp-pipeline call/serve --analysis analysis.json（transport=http://127.0.0.1:8766/call）
 */
public class BridgeActivity extends Activity {

    static final String CHANNEL_TOOL_NAME = "imaudio_channelCall";
    static final int PORT = 8766;
    /** 通道声明超时（CSV 契约 5s）：回调等待与它对齐。 */
    static final long CHANNEL_TIMEOUT_MS = 5_000L;

    private ChannelHttpServer server;
    private final Map<String, JSONObject> targets = new HashMap<>();
    private String statusText = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        TextView status = new TextView(this);
        status.setPadding(48, 96, 48, 48);
        status.setTextSize(15);
        setContentView(status);

        loadTargets();
        server = new ChannelHttpServer(PORT, this::handle);
        try {
            server.start();
            statusText = "BRIDGE 多目标通道桥已监听 127.0.0.1:" + PORT
                    + "\n\n已配置目标 " + targets.size() + " 个工具：";
            for (String name : targets.keySet()) {
                JSONObject t = targets.get(name);
                statusText += "\n  " + name + " → " + t.optString("package");
            }
            statusText += "\n\n宿主侧：adb forward tcp:" + PORT + " tcp:" + PORT
                    + "\nmcp-pipeline call --analysis analysis.json --name <tool>";
            status.setText(statusText);
        } catch (Exception e) {
            status.setText("桥启动失败：" + e);
        }
    }

    /** assets/targets.json 读取；缺席时仅含默认 imaudio 目标。 */
    private void loadTargets() {
        try {
            InputStream in = getAssets().open("targets.json");
            byte[] buf = new byte[in.available()];
            in.read(buf);
            in.close();
            JSONObject all = new JSONObject(new String(buf, StandardCharsets.UTF_8));
            for (Iterator<String> it = all.keys(); it.hasNext(); ) {
                String name = it.next();
                targets.put(name, all.getJSONObject(name));
            }
        } catch (Exception ignored) {
        }
        if (targets.isEmpty()) {
            JSONObject def = new JSONObject();
            try {
                def.put("package", ChannelClient.TARGET_PACKAGE);
                def.put("service", ChannelClient.TARGET_SERVICE);
                def.put("channel", true);
                targets.put(CHANNEL_TOOL_NAME, def);
            } catch (Exception ignored) {
            }
        }
    }

    /** BRIDGE HTTP transport 契约：按工具名路由目标，arguments 原样透传。 */
    private JSONObject handle(JSONObject request) throws Exception {
        String name = request.optString("name");
        JSONObject arguments = request.optJSONObject("arguments");
        if (arguments == null) throw new IllegalArgumentException("MISSING_ARGUMENTS");

        JSONObject target = targets.get(name);
        if (target == null) throw new IllegalArgumentException("UNKNOWN_TOOL: " + name);

        if (!target.optBoolean("channel", true)) {
            // 页面技能：am start 直达（无需通道服务）
            IntentLauncher.launch(this, target.optString("package"), target.optString("activity", ""), arguments);
            return new JSONObject().put("code", 0).put("message", "page launch requested")
                    .put("data", new JSONObject()).put("extras", new JSONObject());
        }

        ChannelClient client = new ChannelClient(this, target.optString("package"), target.optString("service"));
        try {
            // 报文边界：应用收到的 args = MCP arguments 完整 JSON（ChannelContract §7.2），不改写。
            return client.call(arguments.toString(), CHANNEL_TIMEOUT_MS);
        } finally {
            client.close();
        }
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        super.onDestroy();
    }
}
