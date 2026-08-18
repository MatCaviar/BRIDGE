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
import { loadConfig } from "../config.js";
import { McpConnector } from "../mcp/connector.js";
import { createLLMClient } from "../llm/factory.js";
import { runObservable } from "./observable.js";
import type { DashboardEvent } from "./events.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function parseArgs(): { configPath: string; port: number } {
  const args = process.argv.slice(2);
  let configPath = path.resolve("config-qwen.yaml");
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
app.post("/api/run", (req, res) => {
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

  // Buffer events so late-connecting SSE clients can still get them
  emitter.on("event", (event: DashboardEvent) => {
    const session = sessions.get(sessionId);
    if (session) {
      session.buffer.push(event);
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

// 语音识别: 接收 WAV → 转发到本地 faster-whisper ASR (127.0.0.1:8765) → 返回 { text, error }
app.post("/api/asr", express.raw({ type: "audio/*", limit: "50mb" }), async (req, res) => {
  const audio = req.body as Buffer;
  if (!audio || audio.length < 100) { res.status(400).json({ error: "empty audio" }); return; }
  try {
    const r = await fetch("http://127.0.0.1:8765/asr", {
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
app.get("/", (_req, res) => {
  const htmlPath = path.resolve("dashboard/index.html");
  if (!fs.existsSync(htmlPath)) {
    res.status(500).send("dashboard/index.html not found. Run from mcp-gateway root.");
    return;
  }
  res.sendFile(htmlPath);
});

// 座舱智能体 App (点阵动画 + 全量状态)
app.get("/cockpit", (_req, res) => {
  const cockpitPath = path.resolve("dashboard/cockpit.html");
  if (!fs.existsSync(cockpitPath)) {
    res.status(500).send("dashboard/cockpit.html not found. Run from mcp-gateway root.");
    return;
  }
  res.sendFile(cockpitPath);
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const configState = { configPath: "", connector: null as McpConnector | null };

async function main(): Promise<void> {
  const { configPath, port } = parseArgs();
  configState.configPath = configPath;

  console.log(`[dashboard] Loading config from ${configPath}`);
  const config = loadConfig(configPath);

  console.log(`[dashboard] LLM: ${config.llm.provider}/${config.llm.model}`);
  console.log(`[dashboard] Connecting to MCP servers: ${config.mcpServers.map((s) => s.name).join(", ")}`);

  const connector = new McpConnector(config.mcpServers);
  await connector.connectAll();
  configState.connector = connector;

  const toolCount = connector.getToolDefinitions().length;
  console.log(`[dashboard] Ready — ${toolCount} tools available`);

  app.listen(port, () => {
    console.log(`[dashboard] MCP Gateway Dashboard running at http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(`[dashboard] Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
