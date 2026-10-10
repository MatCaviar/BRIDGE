package com.immotors.bridge.imaudio;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;

import com.alios.toolsmanager.channel.IChannelProvider;
import com.alios.toolsmanager.channel.IChannelResultCallback;

import org.json.JSONObject;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 通道客户端：绑定 IMAudio 的 channelCall 通道服务，转发一次调用并等待应答。
 *
 * 目标服务（见 imaudio_service 样例工程 AndroidManifest）：
 *   com.immotors.imaudio / .channel.IMAudioChannelProviderService（进程 :imaudio_channel，exported，
 *   action com.alios.toolsmanager.channel.PROVIDE）。
 *
 * 线格式自 channelcall-sdk AAR 逆向还原（见 aidl/ 目录注释），报文边界与
 * com.immotors.imaudio_service.channel.ChannelContract 对齐：
 *   onChannelCall(requestId, argsJson, callback) —— argsJson = MCP arguments 完整 JSON 字符串
 *   onResult(requestId, code, message, dataJson) —— code=0 成功，非 0 见契约错误码表
 *
 * 本类对 action 透明透传：应用侧新增 Action 无需改动本桥，只需更新 analysis.json 协议表。
 */
public final class ChannelClient {

    /** 默认目标：IMAudio（imaudio-bridge 项目主场景）。多目标探测时由 BridgeActivity 按 targets.json 路由传入。 */
    public static final String TARGET_PACKAGE = "com.immotors.imaudio";
    public static final String TARGET_SERVICE =
            "com.immotors.imaudio_service.channel.IMAudioChannelProviderService";

    /** bind 等待上限：app 侧 ChannelProvider 注释声明 bind ≤2s，同口径。 */
    private static final long BIND_TIMEOUT_MS = 2_000L;

    private final Context context;
    private final String targetPackage;
    private final String targetService;
    private IBinder remote;
    private ServiceConnection connection;

    public ChannelClient(Context context) {
        this(context, TARGET_PACKAGE, TARGET_SERVICE);
    }

    /** 多目标构造：channelcall-sdk 是平台统一契约，任意 8797 应用通道服务均可作目标（无源码契约发现场景）。 */
    public ChannelClient(Context context, String targetPackage, String targetService) {
        this.context = context.getApplicationContext();
        this.targetPackage = targetPackage;
        this.targetService = targetService;
    }

    private synchronized IBinder ensureBound() throws Exception {
        if (remote != null && remote.isBinderAlive()) return remote;
        CountDownLatch bound = new CountDownLatch(1);
        AtomicReference<IBinder> got = new AtomicReference<>();
        Intent intent = new Intent().setClassName(targetPackage, targetService);
        ServiceConnection conn = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder service) {
                got.set(service);
                bound.countDown();
            }

            @Override public void onServiceDisconnected(ComponentName name) {
                synchronized (ChannelClient.this) {
                    remote = null;
                }
            }
        };
        if (!context.bindService(intent, conn, Context.BIND_AUTO_CREATE)) {
            throw new IllegalStateException("BIND_FAILED " + targetPackage + "/" + targetService);
        }
        this.connection = conn;
        if (!bound.await(BIND_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
            throw new IllegalStateException("BIND_TIMEOUT");
        }
        this.remote = got.get();
        return this.remote;
    }

    /**
     * 一次通道调用。
     * @param argsJson MCP arguments 完整 JSON（{action, 业务参数..., extras{...}}）
     * @param timeoutMs 回调等待上限（须与通道声明超时对齐，CSV 契约 5s）
     * @return BRIDGE 信封 {code, message, data, extras}
     */
    public JSONObject call(String argsJson, long timeoutMs) throws Exception {
        IChannelProvider provider = IChannelProvider.Stub.asInterface(ensureBound());
        final String requestId = "br-" + System.nanoTime();
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<Object[]> result = new AtomicReference<>();
        provider.onChannelCall(requestId, argsJson, new IChannelResultCallback.Stub() {
            @Override public void onResult(String rid, int code, String message, String dataJson) {
                result.set(new Object[]{code, message, dataJson});
                latch.countDown();
            }
        });
        if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS)) {
            throw new IllegalStateException("CALLBACK_TIMEOUT");
        }
        Object[] r = result.get();
        int code = (Integer) r[0];
        String message = (String) r[1];
        String dataJson = (String) r[2];
        JSONObject body = new JSONObject();
        body.put("code", code);
        body.put("message", message == null ? "" : message);
        body.put("data", dataJson == null || dataJson.isEmpty() ? new JSONObject() : new JSONObject(dataJson));
        body.put("extras", new JSONObject());
        return body;
    }

    public synchronized void close() {
        if (connection != null) {
            try {
                context.unbindService(connection);
            } catch (IllegalArgumentException ignored) {
                // 服务已断开时 unbind 抛 IAE，属正常路径
            }
            connection = null;
            remote = null;
        }
    }
}
