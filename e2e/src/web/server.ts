#!/usr/bin/env node

/**
 * MCP Gateway Dashboard — web server with real-time SSE streaming.
 *
 * Usage:
 *   npx tsx src/web/server.ts                     # Uses config-qwen.yaml
 *   npx tsx src/web/server.ts --config other.yaml # Custom config
 */

import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import express from "express";
import type { Response } from "express";
import { loadConfig } from "../config.js";
import { McpConnector } from "../mcp/connector.js";
import { createLLMClient } from "../llm/factory.js";
import { runObservable } from "./observable.js";
import type { DashboardEvent } from "./events.js";

const E2E_ROOT = path.resolve(import.meta.dirname, "../..");
const ASR_URL = process.env.BRIDGE_ASR_URL || "http://127.0.0.1:8765/asr";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function parseArgs(): { configPath: string; port: number } {
  const args = process.argv.slice(2);
  let configPath = path.join(E2E_ROOT, "config-cockpit.yaml");
  let port = 3000;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--config" || args[i] === "-c") && args[i + 1]) {
      configPath = path.resolve(args[i + 1]);
      i++;
    }
    if ((args[i] === "--port" || args[i] === "-p") && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`Invalid port: ${args[i + 1]}. Must be 1-65535.`);
      }
      port = parsed;
      i++;
    }
  }

  return { configPath, port };
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

interface Session {
  readonly emitter: EventEmitter;
  readonly buffer: DashboardEvent[];
  status: "running" | "completed" | "error";
  sseClientCount: number;
  /** 登记字段(供 /api/sessions 与 cockpit 自动跟随) */
  startedAt?: string;
  message?: string;
}

const SESSION_TTL_MS = 120_000;
const sessions = new Map<string, Session>();

function createSession(): { sessionId: string; emitter: EventEmitter } {
  const sessionId = `sess_${crypto.randomUUID().replace(/-/g, "").substring(0, 12)}`;
  const emitter = new EventEmitter();
  sessions.set(sessionId, { emitter, buffer: [], status: "running", sseClientCount: 0 });

  // Auto-cleanup after TTL
  setTimeout(() => {
    sessions.delete(sessionId);
  }, SESSION_TTL_MS);

  return { sessionId, emitter };
}

function hasActiveSession(): boolean {
  for (const session of sessions.values()) {
    if (session.status === "running") return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Start a new orchestration session
app.post("/api/run", async (req, res) => {
  // HTTP 先于 MCP 发现就绪(listen 不等 connectAll) — run 必须等工具注册表填充完成,
  // 否则早到的请求会以 "No MCP tools discovered" 失败(自动端到端测试实测发现的竞态)
  if (configState.connectPromise) {
    try {
      await Promise.race([
        configState.connectPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("MCP servers not ready (120s)")), 120000)),
      ]);
    } catch (err: unknown) {
      res.status(503).json({ error: err instanceof Error ? err.message : String(err) });
      return;
    }
  }
  if (hasActiveSession()) {
    res.status(409).json({ error: "A session is already running. Please wait." });
    return;
  }

  const message = req.body?.message;
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "Request body must include a non-empty 'message' string." });
    return;
  }

  const { sessionId, emitter } = createSession();

  // 会话登记(供 cockpit 自动跟随 agent 驱动的测试回合): 记录首条用户消息与时间
  const session = sessions.get(sessionId)!;
  session.startedAt = new Date().toISOString();
  session.message = message.trim().slice(0, 120);

  // Buffer events so late-connecting SSE clients can still get them
  emitter.on("event", (event: DashboardEvent) => {
    const s = sessions.get(sessionId);
    if (s) {
      s.buffer.push(event);
    }
  });

  // Run orchestrator in background (do NOT await)
  setImmediate(() => {
    (async () => {
      try {
        const baseConfig = loadConfig(configState.configPath);
        const config = {
          ...baseConfig,
          task: {
            ...baseConfig.task,
            userMessage: message.trim(),
          },
        };
        const llm = createLLMClient(config.llm);
        await runObservable(llm, configState.connector!, config, emitter, sessionId);
        const session = sessions.get(sessionId);
        if (session) session.status = "completed";
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // Only emit if the observable didn't already emit session_error
        const session = sessions.get(sessionId);
        const alreadyErrored = session?.buffer.some(
          (e) => e.type === "session_error",
        );
        if (!alreadyErrored) {
          emitter.emit("event", {
            type: "session_error",
            timestamp: new Date().toISOString(),
            error: errorMsg,
          } satisfies DashboardEvent);
        }
        if (session) session.status = "error";
      }
    })().catch((err) => {
      console.error("[dashboard] Unhandled orchestration error:", err);
    });
  });

  res.json({ sessionId });
});

// 最近会话列表 — 供 cockpit 自动跟随 agent 驱动的端到端测试(逐轮展示)
app.get("/api/sessions", (_req, res) => {
  const list = [...sessions.entries()]
    .map(([id, s]) => ({ id, status: s.status, startedAt: (s as { startedAt?: string }).startedAt ?? "", message: (s as { message?: string }).message ?? "" }))
    .filter((s) => s.startedAt)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, 20);
  res.json({ sessions: list, active: hasActiveSession() });
});

// 语音识别: 接收 WAV → 转发到本地 faster-whisper ASR (127.0.0.1:8765) → 返回 { text, error }
app.post("/api/asr", express.raw({ type: "audio/*", limit: "50mb" }), async (req, res) => {
  const audio = req.body as Buffer;
  if (!audio || audio.length < 100) { res.status(400).json({ error: "empty audio" }); return; }
  try {
    const r = await fetch(ASR_URL, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: new Uint8Array(audio),
    });
    const j = await r.json().catch(() => ({}));
    const text = String(j?.text ?? "").trim();
    const error = j?.error ? String(j.error) : (!r.ok ? `ASR HTTP ${r.status}` : "");
    res.json({ text, error });
  } catch (e) {
    res.status(502).json({ error: "本地 ASR 服务未运行: " + (e instanceof Error ? e.message : String(e)) });
  }
});

// SSE endpoint for streaming events
app.get("/api/events/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: `Session "${sessionId}" not found.` });
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Send initial connection confirmation
  res.write(`event: connected\ndata: {"sessionId":"${sessionId}"}\n\n`);

  // Replay buffered events so late clients don't miss anything
  for (const event of session.buffer) {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  // If session already ended, close immediately after replay
  if (session.status === "completed" || session.status === "error") {
    res.write(`event: done\ndata: {}\n\n`);
    res.end();
    return;
  }

  session.sseClientCount++;

  // Forward live events from the emitter to the SSE stream
  const onEvent = (event: DashboardEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

    if (event.type === "session_completed" || event.type === "session_error") {
      res.write(`event: done\ndata: {}\n\n`);
      res.end();
      cleanup();
    }
  };

  session.emitter.on("event", onEvent);

  // Heartbeat to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    res.write(":heartbeat\n\n");
  }, 15000);

  // Cleanup on client disconnect
  const cleanup = () => {
    session.emitter.off("event", onEvent);
    clearInterval(heartbeat);
    session.sseClientCount--;
  };

  req.on("close", cleanup);
});

// Serve dashboard HTML
// send 默认 dotfiles:"ignore" — 路径含点目录(如 D:\x\.zcode\workspace)时 sendFile 会被拒绝为 404, 故显式 allow
const sendHtml = (res: Response, p: string) => res.sendFile(p, { dotfiles: "allow" });
app.get("/", (_req, res) => {
  const htmlPath = path.join(E2E_ROOT, "dashboard/index.html");
  if (!fs.existsSync(htmlPath)) {
    res.status(404).send("dashboard/index.html not found.");
    return;
  }
  sendHtml(res, htmlPath);
});

// 座舱智能体 App (点阵动画 + 全量状态)
app.get("/cockpit", (_req, res) => {
  const cockpitPath = path.join(E2E_ROOT, "dashboard/cockpit.html");
  if (!fs.existsSync(cockpitPath)) {
    res.status(404).send("dashboard/cockpit.html not found.");
    return;
  }
  sendHtml(res, cockpitPath);
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const configState = { configPath: "", connector: null as McpConnector | null, connectPromise: null as Promise<void> | null };

async function main(): Promise<void> {
  const { configPath, port } = parseArgs();
  configState.configPath = configPath;

  console.log(`[dashboard] Loading config from ${configPath}`);
  const config = loadConfig(configPath);

  console.log(`[dashboard] LLM: ${config.llm.provider}/${config.llm.model}`);
  console.log(`[dashboard] Connecting to MCP servers: ${config.mcpServers.map((s) => s.name).join(", ")}`);

  const connector = new McpConnector(config.mcpServers);
  configState.connector = connector;
  // 车机离线时 connectAll 可能长时间重试 — 不阻塞 HTTP 服务, 后台连接; run 侧等待该 promise
  const connectPromise = connector.connectAll();
  configState.connectPromise = connectPromise;
  connectPromise.then(() => {
    const toolCount = connector.getToolDefinitions().length;
    console.log(`[dashboard] MCP ready — ${toolCount} tools available`);
  }).catch((err: unknown) => {
    console.error(`[dashboard] MCP connect error: ${err instanceof Error ? err.message : String(err)}`);
  });

  app.listen(port, () => {
    console.log(`[dashboard] MCP Gateway Dashboard running at http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(`[dashboard] Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
