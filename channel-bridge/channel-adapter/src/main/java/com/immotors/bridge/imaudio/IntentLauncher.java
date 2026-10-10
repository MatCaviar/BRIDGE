package com.immotors.bridge.imaudio;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/**
 * 页面技能直达：无源码应用的 open/close 验证路径——不依赖通道服务，
 * monkey 式启动目标包（activity 未知时用 launcher intent），已知 activity 时精确直达。
 */
public final class IntentLauncher {

    public static void launch(Context context, String pkg, String activity, JSONObject arguments) {
        Intent intent;
        if (activity != null && !activity.isEmpty()) {
            intent = new Intent().setComponent(new ComponentName(pkg, activity));
        } else {
            intent = context.getPackageManager().getLaunchIntentForPackage(pkg);
        }
        if (intent == null) throw new IllegalStateException("LAUNCH_FAILED package not found: " + pkg);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private IntentLauncher() {}
}
