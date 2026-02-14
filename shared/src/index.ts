// Koryphaios Shared Types — The contract between backend and frontend.

// ─── Provider & Model Definitions ───────────────────────────────────────────

export const ProviderName = {
  Anthropic: "anthropic",
  OpenAI: "openai",
  Gemini: "gemini",
  Copilot: "copilot",
  OpenRouter: "openrouter",
  Groq: "groq",
  XAI: "xai",
  Azure: "azure",
  Bedrock: "bedrock",
  VertexAI: "vertexai",
  Local: "local",
} as const;

export type ProviderName = (typeof ProviderName)[keyof typeof ProviderName];

export interface ModelDef {
  id: string;
  name: string;
  provider: ProviderName;
  contextWindow: number;
  maxOutputTokens: number;
  costPerMInputTokens: number;
  costPerMOutputTokens: number;
  canReason: boolean;
  supportsAttachments: boolean;
  supportsStreaming: boolean;
}

export interface ProviderConfig {
  name: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  disabled: boolean;
  models?: string[];
  headers?: Record<string, string>;
}

// ─── Agent & Worker Types ───────────────────────────────────────────────────

export type AgentRole = "manager" | "coder" | "task" | "reviewer" | "title" | "summarizer";

export type AgentStatus = "idle" | "thinking" | "tool_calling" | "streaming" | "verifying" | "error" | "done";

export type WorkerDomain = "ui" | "backend" | "general" | "review" | "test";

export interface AgentIdentity {
  id: string;
  name: string;
  role: AgentRole;
  model: string;
  provider: ProviderName;
  domain: WorkerDomain;
  /** CSS glow color for the UI */
  glowColor: string;
}

// ─── Tool System ────────────────────────────────────────────────────────────

export type ToolName =
  | "bash"
  | "read_file"
  | "write_file"
  | "edit_file"
  | "patch"
  | "grep"
  | "glob"
  | "ls"
  | "web_fetch"
  | "web_search"
  | "diff"
  | "agent"
  | string; // MCP tools use dynamic names

export interface ToolCall {
  id: string;
  name: ToolName;
  input: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  name: ToolName;
  output: string;
  isError: boolean;
  durationMs: number;
}

// ─── Message & Content Types ────────────────────────────────────────────────

export type ContentBlockType = "text" | "thinking" | "tool_use" | "tool_result" | "image";

export interface ContentBlock {
  type: ContentBlockType;
  text?: string;
  thinking?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  imageUrl?: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: ContentBlock[];
  model?: string;
  provider?: ProviderName;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  createdAt: number;
}

// ─── Session Types ──────────────────────────────────────────────────────────

export interface Session {
  id: string;
  title: string;
  parentSessionId?: string;
  messageCount: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Permission System ──────────────────────────────────────────────────────

export interface PermissionRequest {
  id: string;
  sessionId: string;
  toolName: ToolName;
  action: string;
  path?: string;
  description: string;
  createdAt: number;
}

export type PermissionResponse = "granted" | "denied" | "granted_session";

// ─── WebSocket Protocol ─────────────────────────────────────────────────────
// Every message over the wire follows this envelope.

export type WSEventType =
  // Agent lifecycle
  | "agent.spawned"
  | "agent.status"
  | "agent.completed"
  | "agent.error"
  // Streaming content
  | "stream.delta"
  | "stream.thinking"
  | "stream.tool_call"
  | "stream.tool_result"
  | "stream.complete"
  // Session events
  | "session.created"
  | "session.updated"
  | "session.deleted"
  // Permission events
  | "permission.request"
  | "permission.response"
  // Provider status
  | "provider.status"
  // System
  | "system.error"
  | "system.info"
  // Kory-specific
  | "kory.thought"
  | "kory.routing"
  | "kory.verification"
  | "kory.task_breakdown";

export interface WSMessage<T = unknown> {
  type: WSEventType;
  payload: T;
  timestamp: number;
  sessionId?: string;
  agentId?: string;
}

// ─── Specific Payloads ──────────────────────────────────────────────────────

export interface AgentSpawnedPayload {
  agent: AgentIdentity;
  task: string;
  parentAgentId?: string;
}

export interface AgentStatusPayload {
  agentId: string;
  status: AgentStatus;
  detail?: string;
}

export interface StreamDeltaPayload {
  agentId: string;
  content: string;
  model: string;
}

export interface StreamThinkingPayload {
  agentId: string;
  thinking: string;
}

export interface StreamToolCallPayload {
  agentId: string;
  toolCall: ToolCall;
}

export interface StreamToolResultPayload {
  agentId: string;
  toolResult: ToolResult;
}

export interface KoryThoughtPayload {
  thought: string;
  phase: "analyzing" | "routing" | "delegating" | "verifying" | "synthesizing";
}

export interface KoryRoutingPayload {
  domain: WorkerDomain;
  selectedModel: string;
  selectedProvider: ProviderName;
  reasoning: string;
}

export interface KoryTaskBreakdownPayload {
  tasks: Array<{
    id: string;
    description: string;
    domain: WorkerDomain;
    assignedModel: string;
    status: "pending" | "active" | "done" | "failed";
  }>;
}

export interface ProviderStatusPayload {
  providers: Array<{
    name: ProviderName;
    enabled: boolean;
    authenticated: boolean;
    models: string[];
    error?: string;
  }>;
}

// ─── Configuration ──────────────────────────────────────────────────────────

export interface KoryphaiosConfig {
  providers: Record<string, ProviderConfig>;
  agents: {
    manager: { model: string; maxTokens?: number; reasoningEffort?: "low" | "medium" | "high" };
    coder: { model: string; maxTokens?: number; reasoningEffort?: "low" | "medium" | "high" };
    task: { model: string; maxTokens?: number };
  };
  mcpServers?: Record<string, MCPServerConfig>;
  telegram?: {
    botToken: string;
    adminId: number;
    webhookUrl?: string;
    secretToken?: string;
  };
  server: {
    port: number;
    host: string;
  };
  contextPaths?: string[];
  dataDirectory: string;
}

export interface MCPServerConfig {
  type: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

// ─── REST API Types ─────────────────────────────────────────────────────────

export interface APIResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface SendMessageRequest {
  sessionId: string;
  content: string;
  attachments?: Array<{ type: "image" | "file"; data: string; name: string }>;
  model?: string;
}

export interface CreateSessionRequest {
  title?: string;
  parentSessionId?: string;
}
