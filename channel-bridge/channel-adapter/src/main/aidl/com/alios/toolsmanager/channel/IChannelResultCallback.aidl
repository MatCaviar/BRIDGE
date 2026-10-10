package com.alios.toolsmanager.channel;

// 自 channelcall-sdk-1.0.0-SNAPSHOT.aar 逆向还原（javap 常量池解析）。
// descriptor = "com.alios.toolsmanager.channel.IChannelResultCallback"
// 单方法接口：onResult 事务码 = FIRST_CALL_TRANSACTION (1)
// 回调 parcel 布局：[interfaceToken, String requestId, int code, String message, String dataJson]
interface IChannelResultCallback {
    void onResult(String requestId, int code, String message, String dataJson);
}
