// Koryphaios Backend Server — Bun HTTP + WebSocket server.
// This is the main entry point that wires everything together.

import type { WSMessage, KoryphaiosConfig, APIResponse, SendMessageRequest, CreateSessionRequest, Session } from "@koryphaios/shared";
import { ProviderRegistry } from "./providers";
import { ToolRegistry, BashTool, ReadFileTool, WriteFileTool, EditFileTool, GrepTool, GlobTool, LsTool, WebSearchTool, WebFetchTool } from "./tools";
import { KoryManager } from "./kory/manager";
import { TelegramBridge } from "./telegram/bot";
import { MCPManager } from "./mcp/client";
import { wsBroker } from "./pubsub";
import { nanoid } from "nanoid";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ─── Configuration Loading ──────────────────────────────────────────────────

function loadConfig(): KoryphaiosConfig {
  const configPaths = [
    join(process.cwd(), "koryphaios.json"),
    join(homedir(), ".config", "koryphaios", "config.json"),
    join(homedir(), ".koryphaios.json"),
  ];

  let fileConfig: Partial<KoryphaiosConfig> = {};

  for (const path of configPaths) {
    if (existsSync(path)) {
      try {
        fileConfig = JSON.parse(readFileSync(path, "utf-8"));
        console.log(`[Koryphaios] Loaded config from ${path}`);
        break;
      } catch (err) {
        console.warn(`[Koryphaios] Failed to parse config at ${path}:`, err);
      }
    }
  }

  const config: KoryphaiosConfig = {
    providers: fileConfig.providers ?? {},
    agents: fileConfig.agents ?? {
      manager: { model: "claude-sonnet-4-20250514" },
      coder: { model: "claude-sonnet-4-20250514" },
      task: { model: "o4-mini" },
    },
    server: {
      port: Number(process.env.KORYPHAIOS_PORT ?? fileConfig.server?.port ?? 3000),
      host: process.env.KORYPHAIOS_HOST ?? fileConfig.server?.host ?? "localhost",
    },
    telegram: fileConfig.telegram ?? (process.env.TELEGRAM_BOT_TOKEN
      ? {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          adminId: Number(process.env.TELEGRAM_ADMIN_ID ?? 0),
          secretToken: process.env.TELEGRAM_SECRET_TOKEN,
        }
      : undefined),
    mcpServers: fileConfig.mcpServers,
    contextPaths: fileConfig.contextPaths ?? [".cursorrules", "CLAUDE.md", "AGENTS.md", ".opencode.json"],
    dataDirectory: fileConfig.dataDirectory ?? ".koryphaios",
  };

  return config;
}

// ─── Session Store (in-memory + file persistence) ───────────────────────────

class SessionStore {
  private sessions = new Map<string, Session>();
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = join(dataDir, "sessions");
    mkdirSync(this.dataDir, { recursive: true });
    this.loadFromDisk();
  }

  create(title?: string, parentId?: string): Session {
    const session: Session = {
      id: nanoid(12),
      title: title ?? "New Session",
      parentSessionId: parentId,
      messageCount: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCost: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    this.saveToDisk(session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(): Session[] {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  update(id: string, updates: Partial<Session>) {
    const session = this.sessions.get(id);
    if (!session) return;
    Object.assign(session, updates, { updatedAt: Date.now() });
    this.saveToDisk(session);
  }

  delete(id: string) {
    this.sessions.delete(id);
    try {
      const fs = require("fs");
      fs.unlinkSync(join(this.dataDir, `${id}.json`));
    } catch {}
  }

  private saveToDisk(session: Session) {
    writeFileSync(join(this.dataDir, `${session.id}.json`), JSON.stringify(session, null, 2));
  }

  private loadFromDisk() {
    try {
      const { readdirSync } = require("fs");
      const files = readdirSync(this.dataDir).filter((f: string) => f.endsWith(".json"));
      for (const file of files) {
        try {
          const data = JSON.parse(readFileSync(join(this.dataDir, file), "utf-8"));
          this.sessions.set(data.id, data);
        } catch {}
      }
    } catch {}
  }
}

// ─── WebSocket Client Manager ───────────────────────────────────────────────

interface WSClient {
  ws: any;
  subscribedSessions: Set<string>;
}

class WSManager {
  private clients = new Map<string, WSClient>();

  add(ws: any) {
    const id = ws.data.id;
    this.clients.set(id, { ws, subscribedSessions: new Set() });
  }

  remove(ws: any) {
    this.clients.delete(ws.data.id);
  }

  broadcast(message: WSMessage) {
    const data = JSON.stringify(message);
    for (const [, client] of this.clients) {
      try {
        if (client.ws.readyState === 1) {
          client.ws.send(data);
        }
      } catch {}
    }
  }

  broadcastToSession(sessionId: string, message: WSMessage) {
    const data = JSON.stringify(message);
    for (const [, client] of this.clients) {
      if (client.subscribedSessions.has(sessionId) || client.subscribedSessions.size === 0) {
        try {
          if (client.ws.readyState === 1) {
            client.ws.send(data);
          }
        } catch {}
      }
    }
  }

  get clientCount() {
    return this.clients.size;
  }
}

// ─── Main Server ────────────────────────────────────────────────────────────

async function main() {
  console.log("\n  ╔═══════════════════════════════════════╗");
  console.log("  ║         KORYPHAIOS v0.1.0              ║");
  console.log("  ║   AI Agent Orchestration Dashboard     ║");
  console.log("  ╚═══════════════════════════════════════╝\n");

  const config = loadConfig();

  // Initialize data directory
  const dataDir = join(process.cwd(), config.dataDirectory);
  mkdirSync(dataDir, { recursive: true });

  // Initialize providers (auth hub)
  const providers = new ProviderRegistry(config);

  // Initialize tools
  const tools = new ToolRegistry();
  tools.register(new BashTool());
  tools.register(new ReadFileTool());
  tools.register(new WriteFileTool());
  tools.register(new EditFileTool());
  tools.register(new GrepTool());
  tools.register(new GlobTool());
  tools.register(new LsTool());
  tools.register(new WebSearchTool());
  tools.register(new WebFetchTool());

  // Initialize MCP connections
  const mcpManager = new MCPManager();
  if (config.mcpServers) {
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      await mcpManager.connectServer({
        name,
        transport: serverConfig.type,
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
        url: serverConfig.url,
        headers: serverConfig.headers,
      }, tools);
    }
    console.log(`[Koryphaios] MCP: ${mcpManager.getStatus().length} server(s) connected`);
  }

  // Initialize Kory
  const kory = new KoryManager(providers, tools, process.cwd());

  // Initialize sessions
  const sessions = new SessionStore(dataDir);

  // Initialize WebSocket manager
  const wsManager = new WSManager();

  // Wire up pub/sub → WebSocket broadcast
  const wsStream = wsBroker.subscribe();
  const wsReader = wsStream.getReader();
  (async () => {
    try {
      while (true) {
        const { done, value } = await wsReader.read();
        if (done) break;
        wsManager.broadcast(value.payload);
      }
    } catch {}
  })();

  // Initialize Telegram bridge (optional)
  let telegram: TelegramBridge | undefined;
  if (config.telegram?.botToken && config.telegram.adminId) {
    telegram = new TelegramBridge(
      {
        botToken: config.telegram.botToken,
        adminId: config.telegram.adminId,
        secretToken: config.telegram.secretToken,
      },
      kory,
    );
    console.log(`[Koryphaios] Telegram bridge enabled (admin ID: ${config.telegram.adminId})`);
  }

  // ─── HTTP + WebSocket Server ────────────────────────────────────────────

  const server = Bun.serve<{ id: string }>({
    port: config.server.port,
    hostname: config.server.host,

    async fetch(req, server) {
      const url = new URL(req.url);
      const method = req.method;

      // CORS headers for frontend
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      };

      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // ── WebSocket upgrade ──
      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req, {
          data: { id: nanoid(8) },
        });
        if (upgraded) return undefined;
        return json({ ok: false, error: "WebSocket upgrade failed" }, 400, corsHeaders);
      }

      // ── Telegram webhook ──
      if (url.pathname === "/api/telegram/webhook" && telegram) {
        try {
          const handler = telegram.getWebhookHandler();
          return await handler(req);
        } catch (err: any) {
          return json({ ok: false, error: err.message }, 500, corsHeaders);
        }
      }

      // ── REST API Routes ──

      // Sessions
      if (url.pathname === "/api/sessions" && method === "GET") {
        return json({ ok: true, data: sessions.list() }, 200, corsHeaders);
      }

      if (url.pathname === "/api/sessions" && method === "POST") {
        const body = await req.json() as CreateSessionRequest;
        const session = sessions.create(body.title, body.parentSessionId);
        return json({ ok: true, data: session }, 201, corsHeaders);
      }

      if (url.pathname.startsWith("/api/sessions/") && method === "GET") {
        const id = url.pathname.split("/")[3];
        const session = sessions.get(id);
        if (!session) return json({ ok: false, error: "Session not found" }, 404, corsHeaders);
        return json({ ok: true, data: session }, 200, corsHeaders);
      }

      if (url.pathname.startsWith("/api/sessions/") && method === "DELETE") {
        const id = url.pathname.split("/")[3];
        sessions.delete(id);
        return json({ ok: true }, 200, corsHeaders);
      }

      // Send message (trigger Kory)
      if (url.pathname === "/api/messages" && method === "POST") {
        const body = await req.json() as SendMessageRequest;

        if (!body.sessionId || !body.content) {
          return json({ ok: false, error: "sessionId and content are required" }, 400, corsHeaders);
        }

        // Ensure session exists
        let session = sessions.get(body.sessionId);
        if (!session) {
          session = sessions.create("Auto-created session");
          body.sessionId = session.id;
        }

        // Process async — results stream via WebSocket
        kory.processVibe(body.sessionId, body.content).catch((err) => {
          console.error("[Kory] Error processing vibe:", err);
          wsManager.broadcast({
            type: "system.error",
            payload: { error: err.message },
            timestamp: Date.now(),
            sessionId: body.sessionId,
          });
        });

        return json({ ok: true, data: { sessionId: body.sessionId, status: "processing" } }, 202, corsHeaders);
      }

      // Provider status
      if (url.pathname === "/api/providers" && method === "GET") {
        return json({ ok: true, data: providers.getStatus() }, 200, corsHeaders);
      }

      // Agent status
      if (url.pathname === "/api/agents/status" && method === "GET") {
        return json({ ok: true, data: kory.getStatus() }, 200, corsHeaders);
      }

      // Cancel all
      if (url.pathname === "/api/agents/cancel" && method === "POST") {
        kory.cancel();
        return json({ ok: true }, 200, corsHeaders);
      }

      // Health check
      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          data: {
            version: "0.1.0",
            uptime: process.uptime(),
            providers: providers.getAvailable().length,
            wsClients: wsManager.clientCount,
          },
        }, 200, corsHeaders);
      }

      // SSE endpoint for clients that don't support WebSocket
      if (url.pathname === "/api/events") {
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const sub = wsBroker.subscribe();
            const reader = sub.getReader();

            (async () => {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const data = `data: ${JSON.stringify(value.payload)}\n\n`;
                  controller.enqueue(encoder.encode(data));
                }
              } catch {
                controller.close();
              }
            })();
          },
        });

        return new Response(stream, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      }

      return json({ ok: false, error: "Not found" }, 404, corsHeaders);
    },

    websocket: {
      open(ws: any) {
        wsManager.add(ws);
        console.log(`[WS] Client connected (${wsManager.clientCount} total)`);

        // Send initial state
        ws.send(JSON.stringify({
          type: "provider.status",
          payload: { providers: providers.getStatus() },
          timestamp: Date.now(),
        } satisfies WSMessage));
      },

      message(ws: any, message: string | Buffer) {
        try {
          const msg = JSON.parse(String(message));

          // Handle client commands
          if (msg.type === "subscribe_session") {
            const client = wsManager["clients"].get(ws.data.id);
            if (client) client.subscribedSessions.add(msg.sessionId);
          }
        } catch {}
      },

      close(ws: any) {
        wsManager.remove(ws);
        console.log(`[WS] Client disconnected (${wsManager.clientCount} total)`);
      },
    },
  });

  console.log(`[Koryphaios] Server running at http://${config.server.host}:${config.server.port}`);
  console.log(`[Koryphaios] WebSocket at ws://${config.server.host}:${config.server.port}/ws`);
  console.log(`[Koryphaios] SSE fallback at http://${config.server.host}:${config.server.port}/api/events`);

  if (telegram && process.env.TELEGRAM_POLLING === "true") {
    await telegram.startPolling();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(data: APIResponse, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

// ─── Start ──────────────────────────────────────────────────────────────────

main().catch(console.error);
