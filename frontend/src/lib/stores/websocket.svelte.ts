// WebSocket connection store — Svelte 5 runes for reactive agent state.
// Handles connection, reconnection, and message routing.

import type {
  WSMessage,
  WSEventType,
  AgentIdentity,
  AgentStatus,
  StreamDeltaPayload,
  StreamThinkingPayload,
  StreamToolCallPayload,
  StreamToolResultPayload,
  KoryThoughtPayload,
  KoryRoutingPayload,
  ProviderStatusPayload,
  AgentSpawnedPayload,
  AgentStatusPayload,
} from "@koryphaios/shared";

// ─── Agent State ────────────────────────────────────────────────────────────

interface AgentState {
  identity: AgentIdentity;
  status: AgentStatus;
  content: string;
  thinking: string;
  toolCalls: Array<{ name: string; status: string }>;
  task: string;
}

// ─── Feed Entry ─────────────────────────────────────────────────────────────

export interface FeedEntry {
  id: string;
  timestamp: number;
  type: "thought" | "content" | "thinking" | "tool_call" | "tool_result" | "routing" | "error" | "system";
  agentId: string;
  agentName: string;
  glowClass: string;
  text: string;
  metadata?: Record<string, unknown>;
}

// ─── Reactive State (Svelte 5 Runes) ───────────────────────────────────────

let wsConnection = $state<WebSocket | null>(null);
let connectionStatus = $state<"connecting" | "connected" | "disconnected" | "error">("disconnected");
let agents = $state<Map<string, AgentState>>(new Map());
let feed = $state<FeedEntry[]>([]);
let providers = $state<ProviderStatusPayload["providers"]>([]);
let koryThought = $state<string>("");
let koryPhase = $state<string>("");

const MAX_FEED_ENTRIES = 2000;
let feedIdCounter = 0;

// ─── Glow class resolver ────────────────────────────────────────────────────

function resolveGlowClass(agent?: AgentIdentity): string {
  if (!agent) return "";
  switch (agent.domain) {
    case "ui": return "glow-codex";
    case "backend": return "glow-gemini";
    case "general": return "glow-claude";
    case "review": return "glow-claude";
    case "test": return "glow-test";
    default: return "";
  }
}

// ─── Feed Management ────────────────────────────────────────────────────────

function addFeedEntry(entry: Omit<FeedEntry, "id">) {
  const newEntry: FeedEntry = { ...entry, id: `fe-${++feedIdCounter}` };
  feed = [...feed, newEntry].slice(-MAX_FEED_ENTRIES);
}

// ─── Message Handler ────────────────────────────────────────────────────────

function handleMessage(msg: WSMessage) {
  switch (msg.type) {
    case "agent.spawned": {
      const p = msg.payload as AgentSpawnedPayload;
      agents.set(p.agent.id, {
        identity: p.agent,
        status: "thinking",
        content: "",
        thinking: "",
        toolCalls: [],
        task: p.task,
      });
      agents = new Map(agents);
      addFeedEntry({
        timestamp: msg.timestamp,
        type: "system",
        agentId: p.agent.id,
        agentName: p.agent.name,
        glowClass: resolveGlowClass(p.agent),
        text: `Worker spawned: ${p.agent.name} (${p.agent.model})`,
        metadata: { domain: p.agent.domain },
      });
      break;
    }

    case "agent.status": {
      const p = msg.payload as AgentStatusPayload;
      const agent = agents.get(p.agentId);
      if (agent) {
        agent.status = p.status;
        agents = new Map(agents);
      }
      break;
    }

    case "agent.completed":
    case "stream.complete": {
      const p = msg.payload as any;
      const agent = agents.get(p.agentId);
      if (agent) {
        agent.status = "done";
        agents = new Map(agents);
      }
      break;
    }

    case "agent.error": {
      const p = msg.payload as any;
      addFeedEntry({
        timestamp: msg.timestamp,
        type: "error",
        agentId: p.agentId ?? "",
        agentName: agents.get(p.agentId)?.identity.name ?? "Unknown",
        glowClass: "",
        text: p.error ?? "Unknown error",
      });
      break;
    }

    case "stream.delta": {
      const p = msg.payload as StreamDeltaPayload;
      const agent = agents.get(p.agentId);
      if (agent) {
        agent.content += p.content;
        agent.status = "streaming";
        agents = new Map(agents);
      }
      addFeedEntry({
        timestamp: msg.timestamp,
        type: "content",
        agentId: p.agentId,
        agentName: agents.get(p.agentId)?.identity.name ?? "Worker",
        glowClass: resolveGlowClass(agents.get(p.agentId)?.identity),
        text: p.content,
      });
      break;
    }

    case "stream.thinking": {
      const p = msg.payload as StreamThinkingPayload;
      const agent = agents.get(p.agentId);
      if (agent) {
        agent.thinking += p.thinking;
        agents = new Map(agents);
      }
      addFeedEntry({
        timestamp: msg.timestamp,
        type: "thinking",
        agentId: p.agentId,
        agentName: agents.get(p.agentId)?.identity.name ?? "Worker",
        glowClass: resolveGlowClass(agents.get(p.agentId)?.identity),
        text: p.thinking,
      });
      break;
    }

    case "stream.tool_call": {
      const p = msg.payload as StreamToolCallPayload;
      const agent = agents.get(p.agentId);
      if (agent) {
        agent.toolCalls.push({ name: p.toolCall.name, status: "running" });
        agent.status = "tool_calling";
        agents = new Map(agents);
      }
      addFeedEntry({
        timestamp: msg.timestamp,
        type: "tool_call",
        agentId: p.agentId,
        agentName: agents.get(p.agentId)?.identity.name ?? "Worker",
        glowClass: resolveGlowClass(agents.get(p.agentId)?.identity),
        text: `Calling tool: ${p.toolCall.name}`,
        metadata: { toolCall: p.toolCall },
      });
      break;
    }

    case "stream.tool_result": {
      const p = msg.payload as StreamToolResultPayload;
      addFeedEntry({
        timestamp: msg.timestamp,
        type: "tool_result",
        agentId: p.agentId,
        agentName: agents.get(p.agentId)?.identity.name ?? "Worker",
        glowClass: resolveGlowClass(agents.get(p.agentId)?.identity),
        text: p.toolResult.isError
          ? `Tool error: ${p.toolResult.output.slice(0, 200)}`
          : `Tool result (${p.toolResult.durationMs.toFixed(0)}ms): ${p.toolResult.output.slice(0, 200)}`,
        metadata: { toolResult: p.toolResult },
      });
      break;
    }

    case "kory.thought": {
      const p = msg.payload as KoryThoughtPayload;
      koryThought = p.thought;
      koryPhase = p.phase;
      addFeedEntry({
        timestamp: msg.timestamp,
        type: "thought",
        agentId: "kory-manager",
        agentName: "Kory",
        glowClass: "glow-kory",
        text: p.thought,
        metadata: { phase: p.phase },
      });
      break;
    }

    case "kory.routing": {
      const p = msg.payload as KoryRoutingPayload;
      addFeedEntry({
        timestamp: msg.timestamp,
        type: "routing",
        agentId: "kory-manager",
        agentName: "Kory",
        glowClass: "glow-kory",
        text: p.reasoning,
        metadata: { domain: p.domain, model: p.selectedModel, provider: p.selectedProvider },
      });
      break;
    }

    case "provider.status": {
      const p = msg.payload as ProviderStatusPayload;
      providers = p.providers;
      break;
    }

    case "system.error": {
      const p = msg.payload as any;
      addFeedEntry({
        timestamp: msg.timestamp,
        type: "error",
        agentId: "",
        agentName: "System",
        glowClass: "",
        text: p.error ?? "Unknown system error",
      });
      break;
    }
  }
}

// ─── Connection Management ──────────────────────────────────────────────────

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

function connect(url?: string) {
  if (wsConnection?.readyState === WebSocket.OPEN) return;

  const wsUrl = url ?? `ws://${window.location.hostname}:3000/ws`;
  connectionStatus = "connecting";

  try {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connectionStatus = "connected";
      reconnectAttempts = 0;
      wsConnection = ws;
      console.log("[WS] Connected to Koryphaios backend");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        handleMessage(msg);
      } catch (err) {
        console.warn("[WS] Failed to parse message:", err);
      }
    };

    ws.onclose = () => {
      connectionStatus = "disconnected";
      wsConnection = null;
      scheduleReconnect(wsUrl);
    };

    ws.onerror = () => {
      connectionStatus = "error";
    };
  } catch {
    connectionStatus = "error";
    scheduleReconnect(url);
  }
}

function scheduleReconnect(url?: string) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => connect(url), delay);
}

function disconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  wsConnection?.close();
  wsConnection = null;
  connectionStatus = "disconnected";
}

function sendMessage(sessionId: string, content: string) {
  fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, content }),
  }).catch(console.error);
}

// ─── Exported Store ─────────────────────────────────────────────────────────

export const wsStore = {
  get connection() { return wsConnection; },
  get status() { return connectionStatus; },
  get agents() { return agents; },
  get feed() { return feed; },
  get providers() { return providers; },
  get koryThought() { return koryThought; },
  get koryPhase() { return koryPhase; },
  connect,
  disconnect,
  sendMessage,
  clearFeed() { feed = []; },
};
