package com.immotors.bridge.imaudio;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * 极简回环 HTTP 端点（零第三方依赖）：POST /call，body = {name, arguments}。
 *
 * 这是 BRIDGE HTTP transport 的宿主侧契约（见 docs/tool-contract.md「Execution」）：
 * 宿主经 adb forward POST {name, arguments}，本桥转发到真车通道并把
 * {code, message, data, extras} 信封原样回给宿主；业务码解释权在宿主契约
 * （successCodes/errorCodes），本桥不吞不改。
 *
 * 仅监听 127.0.0.1：设备外访问必须 adb forward，天然不对局域网暴露。
 */
public final class ChannelHttpServer {

    /** 处理器返回完整信封 JSON；抛 IllegalStateException 视为网关级失败（504）。 */
    public interface RequestHandler {
        JSONObject handle(JSONObject request) throws Exception;
    }

    private final int port;
    private final RequestHandler handler;
    private volatile boolean running;
    private ServerSocket serverSocket;
    private Thread acceptor;

    public ChannelHttpServer(int port, RequestHandler handler) {
        this.port = port;
        this.handler = handler;
    }

    public synchronized void start() throws IOException {
        if (running) return;
        serverSocket = new ServerSocket(port, 8, InetAddress.getByName("127.0.0.1"));
        running = true;
        acceptor = new Thread(() -> {
            while (running) {
                try {
                    Socket socket = serverSocket.accept();
                    worker(socket).start();
                } catch (IOException e) {
                    if (running) System.err.println("[bridge] accept error: " + e);
                }
            }
        }, "channel-http-accept");
        acceptor.setDaemon(true);
        acceptor.start();
    }

    /** 每连接一线程：调用链是低频语音指令，无并发压力，简单优先。 */
    private Thread worker(final Socket socket) {
        Thread t = new Thread(() -> {
            try {
                socket.setSoTimeout(10_000);
                serve(socket);
            } catch (Exception e) {
                System.err.println("[bridge] serve error: " + e);
            } finally {
                try {
                    socket.close();
                } catch (IOException ignored) {
                }
            }
        }, "channel-http-conn");
        t.setDaemon(true);
        return t;
    }

    /** 头部按 ASCII 逐行读、正文按原始字节读：中文字段不能经字符解码器二次转码。 */
    private void serve(Socket socket) throws Exception {
        InputStream in = socket.getInputStream();
        String requestLine = readAsciiLine(in);
        if (requestLine == null) return;
        int contentLength = 0;
        String line;
        while ((line = readAsciiLine(in)) != null && !line.isEmpty()) {
            if (line.regionMatches(true, 0, "content-length:", 0, 15)) {
                contentLength = Integer.parseInt(line.substring(15).trim());
            }
        }
        byte[] body = new byte[contentLength];
        int read = 0;
        while (read < contentLength) {
            int n = in.read(body, read, contentLength - read);
            if (n < 0) break;
            read += n;
        }

        JSONObject response;
        int httpStatus = 200;
        String[] parts = requestLine.split(" ");
        String method = parts[0];
        String path = parts.length > 1 ? parts[1] : "/";
        if (!"POST".equals(method) || !"/call".equals(path)) {
            response = envelope("BAD_REQUEST", "only POST /call is supported");
            httpStatus = 404;
        } else {
            try {
                response = handler.handle(new JSONObject(new String(body, 0, read, StandardCharsets.UTF_8)));
            } catch (IllegalStateException e) {
                // BIND_FAILED/BIND_TIMEOUT/CALLBACK_TIMEOUT 等链路级失败：504，宿主按 transport error 归一
                response = envelope(e.getMessage(), e.getMessage());
                httpStatus = 504;
            } catch (Exception e) {
                response = envelope("ADAPTER_ERROR", String.valueOf(e.getMessage()));
                httpStatus = 500;
            }
        }

        byte[] out = response.toString().getBytes(StandardCharsets.UTF_8);
        OutputStream os = socket.getOutputStream();
        os.write(("HTTP/1.1 " + httpStatus + " " + (httpStatus == 200 ? "OK" : "ERROR")
                + "\r\nContent-Type: application/json; charset=utf-8"
                + "\r\nContent-Length: " + out.length
                + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        os.write(out);
        os.flush();
    }

    /** 从原始字节流读一行 ASCII 头（到 \n，剔除 \r）；流结束返回 null。 */
    private static String readAsciiLine(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream(96);
        for (int c = in.read(); c >= 0; c = in.read()) {
            if (c == '\n') {
                int size = buf.size();
                byte[] raw = buf.toByteArray();
                if (size > 0 && raw[size - 1] == '\r') size--;
                return new String(raw, 0, size, StandardCharsets.US_ASCII);
            }
            buf.write(c);
        }
        return buf.size() == 0 ? null : buf.toString("US_ASCII");
    }

    private static JSONObject envelope(String code, String message) throws org.json.JSONException {
        JSONObject o = new JSONObject();
        o.put("code", code);
        o.put("message", message);
        o.put("data", new JSONObject());
        o.put("extras", new JSONObject());
        return o;
    }

    public synchronized void stop() {
        running = false;
        if (serverSocket != null) {
            try {
                serverSocket.close();
            } catch (IOException ignored) {
            }
            serverSocket = null;
        }
    }
}
