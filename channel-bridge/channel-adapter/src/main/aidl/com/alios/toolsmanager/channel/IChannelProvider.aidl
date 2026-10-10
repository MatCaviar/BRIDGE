package com.alios.toolsmanager.channel;

import com.alios.toolsmanager.channel.IChannelResultCallback;

// 自 channelcall-sdk-1.0.0-SNAPSHOT.aar 逆向还原（javap 常量池解析）。
// descriptor = "com.alios.toolsmanager.channel.IChannelProvider"
// 单方法接口：onChannelCall 事务码 = FIRST_CALL_TRANSACTION (1)
// 请求 parcel 布局：[interfaceToken, String requestId, String argsJson, strongBinder(callback)]
// argsJson = MCP 报文 arguments 的完整 JSON 字符串（含 action 分派键、业务参数、extras），
// 与 com.immotors.imaudio 侧 ChannelContract.kt 的报文边界定义一致。
interface IChannelProvider {
    void onChannelCall(String requestId, String argsJson, IChannelResultCallback callback);
}
