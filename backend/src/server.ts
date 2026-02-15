// Koryphaios Backend Server — Bun HTTP + WebSocket server.
// This is the main entry point that wires everything together.

import type { WSMessage, KoryphaiosConfig, APIResponse, SendMessageRequest, CreateSessionRequest, Session } from "@koryphaios/shared";
import { ProviderRegistry } from "./providers";
import { ToolRegistry, BashTool, ReadFileTool, WriteFileTool, EditFileTool, GrepTool, GlobTool, LsTool, WebSearchTool, WebFetchTool, DeleteFileTool, MoveFileTool, DiffTool, PatchTool } from "./tools";
import { KoryManager } from "./kory/manager";
import { TelegramBridge } from "./telegram/bot";
import { MCPManager } from "./mcp/client";
import { wsBroker } from "./pubsub";
import { serverLog } from "./logger";
import { getCorsHeaders, validateSessionId, validateProviderName, sanitizeString, encryptApiKey, RateLimiter } from "./security";
import { ConfigError, ValidationError, SessionError, handleError, safeJsonParse } from "./errors";
import { SESSION, MESSAGE, ID, RATE_LIMIT, SERVER, FS, AGENT, DEFAULT_CONTEXT_PATHS } from "./constants";
import { validateConfig, validateEnvironment } from "./config-schema";
import { nanoid } from "nanoid";
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from "fs";
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
        const rawConfig = readFileSync(path, "utf-8");
        fileConfig = safeJsonParse(rawConfig, {}, { path });
        if (Object.keys(fileConfig).length > 0) {
          serverLog.info({ path }, "Loaded config");
          break;
        }
      } catch (err) {
        serverLog.warn({ path, err }, "Failed to parse config");
        throw new ConfigError(`Invalid config file: ${path}`, { path, error: String(err) });
      }
    }
  }

  const config: KoryphaiosConfig = {
    providers: fileConfig.providers ?? {},
    agents: fileConfig.agents ?? {
      manager: { model: AGENT.DEFAULT_MANAGER_MODEL, reasoningEffort: AGENT.DEFAULT_REASONING_EFFORT },
      coder: { model: AGENT.DEFAULT_CODER_MODEL, maxTokens: AGENT.CODER_MAX_TOKENS },
      task: { model: AGENT.DEFAULT_TASK_MODEL, maxTokens: AGENT.DEFAULT_MAX_TOKENS },
    },
    server: {
      port: Number(process.env.KORYPHAIOS_PORT ?? fileConfig.server?.port ?? SERVER.DEFAULT_PORT),
      host: process.env.KORYPHAIOS_HOST ?? fileConfig.server?.host ?? SERVER.DEFAULT_HOST,
    },
    telegram: fileConfig.telegram ?? (process.env.TELEGRAM_BOT_TOKEN
      ? {
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          adminId: Number(process.env.TELEGRAM_ADMIN_ID ?? 0),
          secretToken: process.env.TELEGRAM_SECRET_TOKEN,
        }
      : undefined),
    mcpServers: fileConfig.mcpServers,
    contextPaths: fileConfig.contextPaths ?? DEFAULT_CONTEXT_PATHS,
    dataDirectory: fileConfig.dataDirectory ?? FS.DEFAULT_DATA_DIR,
  };

  // Validate configuration
  validateConfig(config);

  return config;
}

// ─── .env Persistence ───────────────────────────────────────────────────────

function persistEnvVar(key: string, value: string) {
  const envPath = join(process.cwd(), ".env");
  let content = "";
  try {
    content = readFileSync(envPath, "utf-8");
  } catch (err) {
    serverLog.debug({ key, error: String(err) }, "No existing .env file, creating new one");
  }

  // Also set it in the current process
  process.env[key] = value;

  const lines = content.split("\n");
  const existingIdx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (existingIdx >= 0) {
    lines[existingIdx] = `${key}=${value}`;
  } else {
    lines.push(`${key}=${value}`);
  }

  try {
    writeFileSync(envPath, lines.join("\n"));
    serverLog.debug({ key }, "Persisted environment variable");
  } catch (err) {
    serverLog.error({ key, error: String(err) }, "Failed to persist environment variable");
  }
}

// ─── Session Store (in-memory + file persistence) ───────────────────────────

class SessionStore {
  private sessions = new Map<string, Session>();
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = join(dataDir, FS.SESSIONS_DIR);
    mkdirSync(this.dataDir, { recursive: true });
    this.loadFromDisk();
  }

  create(title?: string, parentId?: string): Session {
    const session: Session = {
      id: nanoid(ID.SESSION_ID_LENGTH),
      title: title ?? SESSION.DEFAULT_TITLE,
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

  update(id: string, updates: Partial<Session>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    Object.assign(session, updates, { updatedAt: Date.now() });
    this.saveToDisk(session);
    return session;
  }

  delete(id: string) {
    this.sessions.delete(id);
    try {
      unlinkSync(join(this.dataDir, `${id}${FS.SESSION_FILE_SUFFIX}`));
    } catch (err) {
      serverLog.warn({ sessionId: id, error: String(err) }, "Failed to delete session file");
    }
    // Also delete messages file
    try {
      unlinkSync(join(this.dataDir, `${id}${FS.MESSAGES_FILE_SUFFIX}`));
    } catch (err) {
      serverLog.warn({ sessionId: id, error: String(err) }, "Failed to delete messages file");
    }
  }

  private saveToDisk(session: Session) {
    try {
      writeFileSync(join(this.dataDir, `${session.id}${FS.SESSION_FILE_SUFFIX}`), JSON.stringify(session, null, 2));
    } catch (err) {
      serverLog.error({ sessionId: session.id, error: String(err) }, "Failed to save session to disk");
    }
  }

  private loadFromDisk() {
    try {
      const files = readdirSync(this.dataDir).filter(
        (f: string) => f.endsWith(FS.SESSION_FILE_SUFFIX) && !f.endsWith(FS.MESSAGES_FILE_SUFFIX)
      );
      for (const file of files) {
        try {
          const rawData = readFileSync(join(this.dataDir, file), "utf-8");
          const data = safeJsonParse<Session>(rawData, null as any, { file });
          if (data?.id) {
            this.sessions.set(data.id, data);
          }
        } catch (err) {
          serverLog.warn({ file, error: String(err) }, "Failed to load session file");
        }
      }
      serverLog.info({ count: this.sessions.size }, "Loaded sessions from disk");
    } catch (err) {
      serverLog.warn({ error: String(err) }, "Failed to read sessions directory");
    }
  }
}

// ─── Message Store (per-session persistence) ────────────────────────────────

interface StoredMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  provider?: string;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  createdAt: number;
}

class MessageStore {
  private dataDir: string;
  private cache = new Map<string, StoredMessage[]>();

  constructor(dataDir: string) {
    this.dataDir = join(dataDir, FS.SESSIONS_DIR);
    mkdirSync(this.dataDir, { recursive: true });
  }

  add(sessionId: string, msg: StoredMessage): void {
    const messages = this.getAll(sessionId);
    messages.push(msg);
    this.cache.set(sessionId, messages);
    this.saveToDisk(sessionId, messages);
  }

  getAll(sessionId: string): StoredMessage[] {
    if (this.cache.has(sessionId)) return this.cache.get(sessionId)!;
    try {
      const rawData = readFileSync(join(this.dataDir, `${sessionId}${FS.MESSAGES_FILE_SUFFIX}`), "utf-8");
      const messages = safeJsonParse<StoredMessage[]>(rawData, [], { sessionId });
      this.cache.set(sessionId, messages);
      return messages;
    } catch (err) {
      serverLog.debug({ sessionId, error: String(err) }, "No messages file found, returning empty array");
      return [];
    }
  }

  private saveToDisk(sessionId: string, messages: StoredMessage[]): void {
    try {
      writeFileSync(join(this.dataDir, `${sessionId}${FS.MESSAGES_FILE_SUFFIX}`), JSON.stringify(messages));
    } catch (err) {
      serverLog.error({ sessionId, error: String(err) }, "Failed to save messages to disk");
    }
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
    serverLog.debug({ clientId: id, totalClients: this.clients.size }, "WebSocket client added");
  }

  remove(ws: any) {
    const id = ws.data.id;
    this.clients.delete(id);
    serverLog.debug({ clientId: id, totalClients: this.clients.size }, "WebSocket client removed");
  }

  broadcast(message: WSMessage) {
    const data = JSON.stringify(message);
    let successCount = 0;
    let failCount = 0;
    
    for (const [, client] of this.clients) {
      try {
        if (client.ws.readyState === 1) {
          client.ws.send(data);
          successCount++;
        }
      } catch (err) {
        failCount++;
        serverLog.warn({ error: String(err) }, "Failed to send WebSocket message to client");
      }
    }
    
    if (failCount > 0) {
      serverLog.debug({ successCount, failCount }, "Broadcast complete with failures");
    }
  }

  broadcastToSession(sessionId: string, message: WSMessage) {
    const data = JSON.stringify(message);
    let targetCount = 0;
    
    for (const [, client] of this.clients) {
      if (client.subscribedSessions.has(sessionId) || client.subscribedSessions.size === 0) {
        try {
          if (client.ws.readyState === 1) {
            client.ws.send(data);
            targetCount++;
          }
        } catch (err) {
          serverLog.warn({ sessionId, error: String(err) }, "Failed to send session message to client");
        }
      }
    }
    
    serverLog.debug({ sessionId, targetCount }, "Session broadcast complete");
  }

  get clientCount() {
    return this.clients.size;
  }
}

// ─── Main Server ────────────────────────────────────────────────────────────

async function main() {
  serverLog.info("═══════════════════════════════════════");
  serverLog.info("       KORYPHAIOS v0.1.0");
  serverLog.info("  AI Agent Orchestration Dashboard");
  serverLog.info("═══════════════════════════════════════");

  // Validate environment variables
  validateEnvironment();

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
  tools.register(new DeleteFileTool());
  tools.register(new MoveFileTool());
  tools.register(new DiffTool());
  tools.register(new PatchTool());
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
    serverLog.info({ count: mcpManager.getStatus().length }, "MCP servers connected");
  }

  // Initialize Kory
  const kory = new KoryManager(providers, tools, process.cwd());

  // Initialize sessions
  const sessions = new SessionStore(dataDir);
  const messages = new MessageStore(dataDir);

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
    serverLog.info({ adminId: config.telegram.adminId }, "Telegram bridge enabled");
  }

  // ─── HTTP + WebSocket Server ────────────────────────────────────────────

  const rateLimiter = new RateLimiter(RATE_LIMIT.MAX_REQUESTS, RATE_LIMIT.WINDOW_MS);

  const server = Bun.serve<{ id: string }>({
    port: config.server.port,
    hostname: config.server.host,

    async fetch(req, server) {
      const url = new URL(req.url);
      const method = req.method;
      const origin = req.headers.get("origin");

      // CORS — origin allowlist (not *)
      const corsHeaders = getCorsHeaders(origin);

      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // Rate limiting
      const clientIp = req.headers.get("x-forwarded-for") ?? "local";
      const rateCheck = rateLimiter.check(clientIp);
      if (!rateCheck.allowed) {
        return json({ ok: false, error: "Rate limit exceeded" }, 429, corsHeaders);
      }

      // ── WebSocket upgrade ──
      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req, {
          data: { id: nanoid(ID.WS_CLIENT_ID_LENGTH) },
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

      // Session by ID routes — parse path segments
      if (url.pathname.startsWith("/api/sessions/")) {
        const segments = url.pathname.split("/");
        const id = segments[3];
        const subResource = segments[4]; // "messages", "auto-title", or undefined

        if (!id) return json({ ok: false, error: "Session ID required" }, 400, corsHeaders);

        // GET /api/sessions/:id/messages — fetch message history
        if (subResource === "messages" && method === "GET") {
          const sessionMessages = messages.getAll(id);
          return json({ ok: true, data: sessionMessages }, 200, corsHeaders);
        }

        // POST /api/sessions/:id/auto-title — generate title from first message
        if (subResource === "auto-title" && method === "POST") {
          const sessionMessages = messages.getAll(id);
          const firstUserMsg = sessionMessages.find(m => m.role === "user");
          if (firstUserMsg) {
            // Simple title: first 50 chars of first message, cleaned up
            const rawTitle = firstUserMsg.content.replace(/\n/g, " ").trim();
            const title = rawTitle.length > 50 ? rawTitle.slice(0, 47) + "..." : rawTitle;
            const updated = sessions.update(id, { title });
            if (updated) {
              wsManager.broadcast({
                type: "session.updated",
                payload: { session: updated },
                timestamp: Date.now(),
                sessionId: id,
              } satisfies WSMessage);
            }
            return json({ ok: true, data: { title } }, 200, corsHeaders);
          }
          return json({ ok: true, data: { title: "New Session" } }, 200, corsHeaders);
        }

        // No sub-resource — operate on session itself
        if (!subResource) {
          if (method === "GET") {
            const session = sessions.get(id);
            if (!session) return json({ ok: false, error: "Session not found" }, 404, corsHeaders);
            return json({ ok: true, data: session }, 200, corsHeaders);
          }

          if (method === "PATCH") {
            const body = await req.json() as { title?: string };
            const title = sanitizeString(body.title, SESSION.MAX_TITLE_LENGTH);
            if (!title) return json({ ok: false, error: "title is required" }, 400, corsHeaders);
            const updated = sessions.update(id, { title });
            if (!updated) return json({ ok: false, error: "Session not found" }, 404, corsHeaders);
            wsManager.broadcast({
              type: "session.updated",
              payload: { session: updated },
              timestamp: Date.now(),
              sessionId: id,
            } satisfies WSMessage);
            return json({ ok: true, data: updated }, 200, corsHeaders);
          }

          if (method === "DELETE") {
            sessions.delete(id);
            wsManager.broadcast({
              type: "session.deleted",
              payload: { sessionId: id },
              timestamp: Date.now(),
              sessionId: id,
            } satisfies WSMessage);
            return json({ ok: true }, 200, corsHeaders);
          }
        }
      }

      // Send message (trigger Kory)
      if (url.pathname === "/api/messages" && method === "POST") {
        const body = await req.json() as SendMessageRequest;

        const sessionId = validateSessionId(body.sessionId);
        const content = sanitizeString(body.content, MESSAGE.MAX_CONTENT_LENGTH);

        if (!sessionId || !content) {
          return json({ ok: false, error: "Valid sessionId and content are required" }, 400, corsHeaders);
        }

        // Ensure session exists
        let session = sessions.get(sessionId);
        let activeSessionId = sessionId;
        if (!session) {
          session = sessions.create(SESSION.DEFAULT_TITLE);
          activeSessionId = session.id;
        }

        // Persist user message
        const userMsg: StoredMessage = {
          id: nanoid(ID.SESSION_ID_LENGTH),
          sessionId: activeSessionId,
          role: "user",
          content,
          createdAt: Date.now(),
        };
        messages.add(activeSessionId, userMsg);
        sessions.update(activeSessionId, {
          messageCount: (session.messageCount ?? 0) + 1,
        });

        // Auto-title on first message
        if (session.messageCount === 0 || session.title === SESSION.DEFAULT_TITLE) {
          const rawTitle = content.replace(/\n/g, " ").trim();
          const title = rawTitle.length > SESSION.AUTO_TITLE_CHARS 
            ? rawTitle.slice(0, SESSION.AUTO_TITLE_CHARS - 3) + "..." 
            : rawTitle;
          sessions.update(activeSessionId, { title });
          wsManager.broadcast({
            type: "session.updated",
            payload: { session: sessions.get(activeSessionId) },
            timestamp: Date.now(),
            sessionId: activeSessionId,
          } satisfies WSMessage);
        }

        // Process async — results stream via WebSocket
        kory.processTask(activeSessionId, content).catch((err) => {
          serverLog.error(err, "Error processing request");
          wsManager.broadcast({
            type: "system.error",
            payload: { error: err.message },
            timestamp: Date.now(),
            sessionId: activeSessionId,
          });
        });

        return json({ ok: true, data: { sessionId: activeSessionId, status: "processing" } }, 202, corsHeaders);
      }

      // Provider status
      if (url.pathname === "/api/providers" && method === "GET") {
        return json({ ok: true, data: providers.getStatus() }, 200, corsHeaders);
      }

      // Set provider API key
      if (url.pathname.startsWith("/api/providers/") && method === "PUT") {
        const rawName = url.pathname.split("/")[3];
        const providerName = validateProviderName(rawName);
        if (!providerName) {
          return json({ ok: false, error: "Invalid provider name" }, 400, corsHeaders);
        }

        const body = await req.json() as { apiKey?: string; baseUrl?: string };
        const apiKey = sanitizeString(body.apiKey, 500);

        if (!apiKey) {
          return json({ ok: false, error: "apiKey is required" }, 400, corsHeaders);
        }

        const result = providers.setApiKey(providerName as any, apiKey, body.baseUrl);
        if (result.success) {
          // Persist encrypted key to .env file
          persistEnvVar(providers.getExpectedEnvVar(providerName as any), encryptApiKey(apiKey));

          // Broadcast updated provider status via WebSocket
          wsManager.broadcast({
            type: "provider.status",
            payload: { providers: providers.getStatus() },
            timestamp: Date.now(),
          } satisfies WSMessage);

          return json({ ok: true, data: { provider: providerName, status: "connected" } }, 200, corsHeaders);
        }
        return json({ ok: false, error: result.error }, 400, corsHeaders);
      }

      // Remove provider API key
      if (url.pathname.startsWith("/api/providers/") && method === "DELETE") {
        const rawName = url.pathname.split("/")[3];
        const providerName = validateProviderName(rawName);
        if (!providerName) {
          return json({ ok: false, error: "Invalid provider name" }, 400, corsHeaders);
        }
        providers.removeApiKey(providerName as any);

        wsManager.broadcast({
          type: "provider.status",
          payload: { providers: providers.getStatus() },
          timestamp: Date.now(),
        } satisfies WSMessage);

        return json({ ok: true }, 200, corsHeaders);
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
        serverLog.info({ clients: wsManager.clientCount }, "WS client connected");

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
        serverLog.info({ clients: wsManager.clientCount }, "WS client disconnected");
      },
    },
  });

  serverLog.info({ host: config.server.host, port: config.server.port }, "Server running");
  serverLog.info({ url: `ws://${config.server.host}:${config.server.port}/ws` }, "WebSocket ready");
  serverLog.info({ url: `http://${config.server.host}:${config.server.port}/api/events` }, "SSE fallback ready");

  if (telegram && process.env.TELEGRAM_POLLING === "true") {
    await telegram.startPolling();
  }

  // ─── Graceful Shutdown ──────────────────────────────────────────────────
  
  let isShuttingDown = false;

  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) {
      serverLog.warn("Shutdown already in progress, forcing exit");
      process.exit(1);
    }

    isShuttingDown = true;
    serverLog.info({ signal }, "Received shutdown signal, starting graceful shutdown");

    try {
      // 1. Stop accepting new connections
      server.stop(true);
      serverLog.info("Server stopped accepting new connections");

      // 2. Cancel all running agents
      kory.cancel();
      serverLog.info("Cancelled all running agents");

      // 3. Close WebSocket connections gracefully
      wsManager.broadcast({
        type: "system.info",
        payload: { message: "Server shutting down" },
        timestamp: Date.now(),
      });
      serverLog.info("Notified WebSocket clients");

      // 4. Wait a moment for final messages to send
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 5. Stop Telegram bot if running
      if (telegram && typeof (telegram as any).stop === "function") {
        (telegram as any).stop();
        serverLog.info("Stopped Telegram bot");
      }

      serverLog.info("Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      serverLog.error(err, "Error during graceful shutdown");
      process.exit(1);
    }
  }

  // Register shutdown handlers
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (err) => {
    serverLog.fatal(err, "Uncaught exception");
    gracefulShutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason, promise) => {
    serverLog.fatal({ reason, promise }, "Unhandled promise rejection");
    gracefulShutdown("unhandledRejection");
  });
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

main().catch((err) => serverLog.fatal(err, "Server startup failed"));
