// WebSocket connection store — Svelte 5 runes for reactive agent state.
// Handles connection, reconnection, message routing, user messages, and permissions.

import type {
  WSMessage,
  WSEventType,
  AgentIdentity,
  AgentStatus,
  StreamDeltaPayload,
  StreamThinkingPayload,
  StreamToolCallPayload,
  StreamToolResultPayload,
  StreamFileDeltaPayload,
  StreamFileCompletePayload,
  KoryThoughtPayload,
  KoryRoutingPayload,
  ProviderStatusPayload,
  AgentSpawnedPayload,
  AgentStatusPayload,
  PermissionRequest,
  Session,
} from "@koryphaios/shared";
import { sessionStore } from './sessions.svelte';
import { browser } from '$app/environment';

// ─── Agent State ────────────────────────────────────────────────────────────

interface AgentState {
  identity: AgentIdentity;
  status: AgentStatus;
  content: string;
  thinking: string;
  toolCalls: Array<{ name: string; status: string }>;
  task: string;
  tokensUsed: number;
  contextMax: number;
}

// ─── Feed Entry ─────────────────────────────────────────────────────────────

export interface FeedEntry {
  id: string;
  timestamp: number;
  type: "user_message" | "thought" | "content" | "thinking" | "tool_call" | "tool_result" | "routing" | "error" | "system";
  agentId: string;
  agentName: string;
  glowClass: string;
  text: string;
  metadata?: Record<string, unknown>;
}

// ─── Reactive State (Svelte 5 Runes) ─────────────────────────────────────

let wsConnection = $state<WebSocket | null>(null);
let connectionStatus = $state<"connecting" | "connected" | "disconnected" | "error">("disconnected");
let feed = $state<FeedEntry[]>([]);
let providers = $state<ProviderStatusPayload["providers"]>([]);
let koryThought = $state<string>("");
let koryPhase = $state<string>("");
let pendingPermissions = $state<PermissionRequest[]>([]);

// Initialize manager agent state
const initialAgents = new Map<string, AgentState>();
initialAgents.set("kory-manager", {
  identity: {
    id: "kory-manager",
    name: "Kory",
    role: "manager",
    model: "claude-sonnet-4-5",
    provider: "anthropic",
    domain: "general",
    glowColor: "rgba(255,215,0,0.6)",
  },
  status: "idle",
  content: "",
  thinking: "",
  toolCalls: [],
  task: "Orchestrating...",
  tokensUsed: 0,
  contextMax: 200000,
});

let agents = $state<Map<string, AgentState>>(initialAgents);

// File edit streaming state (Cursor-style live preview)
interface ActiveFileEdit {
  path: string;
  content: string;
  operation: "create" | "edit";
  agentId: string;
  startedAt: number;
}
let activeFileEdits = $state<Map<string, ActiveFileEdit>>(new Map());

const MAX_FEED_ENTRIES = 2000;
let feedIdCounter = 0;

// ─── Glow class resolver ───────────────────────────────────────────────────

function resolveGlowClass(agent?: AgentIdentity): string {
  if (!agent) return "";
  switch (agent.domain) {
    case "ui": return "glow-codex";
    case "backend": return "glow-google";
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

// Accumulate streaming text into the last matching feed entry instead of creating one per token
function accumulateFeedEntry(entry: Omit<FeedEntry, "id">) {
  const lastIdx = feed.length - 1;
  const last = lastIdx >= 0 ? feed[lastIdx] : null;
  if (last && last.type === entry.type && last.agentId === entry.agentId) {
    // Mutate-then-replace to avoid creating a new entry per token
    const updated = { ...last, text: last.text + entry.text, timestamp: entry.timestamp };
    feed = [...feed.slice(0, lastIdx), updated];
  } else {
    addFeedEntry(entry);
  }
}

function addUserMessage(sessionId: string, content: string) {
  const userEntry: FeedEntry = {
    id: `user-${++feedIdCounter}`,
    timestamp: Date.now(),
    type: "user_message",
    agentId: "user",
    agentName: "You",
    glowClass: "",
    text: content,
    metadata: { sessionId },
  };
  feed = [...feed, userEntry].slice(-MAX_FEED_ENTRIES);
}

// ─── Message Handler ───────────────────────────────────────────────────────

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
        tokensUsed: 0,
        contextMax: 128000,
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
      accumulateFeedEntry({
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
      accumulateFeedEntry({
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

    case "stream.file_delta": {
      const p = msg.payload as StreamFileDeltaPayload;
      const existing = activeFileEdits.get(p.path);
      if (existing) {
        existing.content += p.delta;
        activeFileEdits = new Map(activeFileEdits);
      } else {
        activeFileEdits.set(p.path, {
          path: p.path,
          content: p.delta,
          operation: p.operation,
          agentId: p.agentId,
          startedAt: Date.now(),
        });
        activeFileEdits = new Map(activeFileEdits);
      }
      break;
    }

    case "stream.file_complete": {
      const p = msg.payload as StreamFileCompletePayload;
      // Keep the completed edit visible briefly, then remove
      setTimeout(() => {
        activeFileEdits.delete(p.path);
        activeFileEdits = new Map(activeFileEdits);
      }, 2000);
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

    case "session.updated": {
      const p = msg.payload as { session: Session };
      if (p.session) sessionStore.handleSessionUpdate(p.session);
      break;
    }

    case "session.deleted": {
      const p = msg.payload as { sessionId: string };
      if (p.sessionId) sessionStore.handleSessionDeleted(p.sessionId);
      break;
    }

    case "permission.request": {
      const p = msg.payload as PermissionRequest;
      pendingPermissions = [...pendingPermissions, p];
      break;
    }

    case "permission.response": {
      const p = msg.payload as { id: string; response: string };
      pendingPermissions = pendingPermissions.filter(perm => perm.id !== p.id);
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
  if (!browser) return;
  if (wsConnection?.readyState === WebSocket.OPEN) return;

  const wsUrl = url ?? `ws://${window.location.hostname}:3000/ws`;
  connectionStatus = "connecting";

  try {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connectionStatus = "connected";
      reconnectAttempts = 0;
      wsConnection = ws;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        handleMessage(msg);
      } catch { }
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

function sendMessage(sessionId: string, content: string, model?: string, reasoningLevel?: string) {
  addUserMessage(sessionId, content);
  fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, content, model, reasoningLevel }),
  }).catch(() => { });
}

function respondToPermission(id: string, approved: boolean) {
  if (wsConnection?.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({
      type: "permission.response",
      payload: { id, response: approved ? "granted" : "denied" },
      timestamp: Date.now(),
    }));
  }
  pendingPermissions = pendingPermissions.filter(perm => perm.id !== id);
}

// ─── Session Message Loading ────────────────────────────────────────────────

function loadSessionMessages(sessionId: string, messages: Array<{ id: string; role: string; content: string; createdAt: number; model?: string; cost?: number }>) {
  // Clear current feed and populate with historical messages
  feed = messages.map((m) => ({
    id: `hist-${m.id}`,
    timestamp: m.createdAt,
    type: m.role === "user" ? "user_message" as const : "content" as const,
    agentId: m.role === "user" ? "user" : "kory-manager",
    agentName: m.role === "user" ? "You" : "Kory",
    glowClass: m.role === "user" ? "" : "glow-kory",
    text: m.content,
    metadata: { sessionId, model: m.model, cost: m.cost },
  }));
}

function removeEntries(ids: Set<string>) {
  feed = feed.filter(e => !ids.has(e.id));
}

// ─── Derived helpers ────────────────────────────────────────────────────────

function getManagerStatus(): AgentStatus {
  const manager = agents.get('kory-manager');
  if (manager) return manager.status;
  // Fallback: if any agent is active, infer from their states
  for (const a of agents.values()) {
    if (a.status !== 'idle' && a.status !== 'done') return a.status;
  }
  return 'idle';
}

function getContextUsage(): { used: number; max: number; percent: number } {
  const manager = agents.get('kory-manager');
  if (manager && manager.contextMax > 0) {
    const percent = Math.min(100, Math.round((manager.tokensUsed / manager.contextMax) * 100));
    return { used: manager.tokensUsed, max: manager.contextMax, percent };
  }
  // Aggregate across all agents
  let totalUsed = 0;
  let maxCtx = 128000;
  for (const a of agents.values()) {
    totalUsed += a.tokensUsed;
    if (a.contextMax > 0) maxCtx = Math.max(maxCtx, a.contextMax);
  }
  const percent = maxCtx > 0 ? Math.min(100, Math.round((totalUsed / maxCtx) * 100)) : 0;
  return { used: totalUsed, max: maxCtx, percent };
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
  get pendingPermissions() { return pendingPermissions; },
  get activeFileEdits() { return activeFileEdits; },
  get managerStatus() { return getManagerStatus(); },
  get contextUsage() { return getContextUsage(); },
  connect,
  disconnect,
  sendMessage,
  loadSessionMessages,
  removeEntries,
  respondToPermission,
  clearFeed() { feed = []; },
};
