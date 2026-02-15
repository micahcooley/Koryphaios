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
  authToken?: string;
  baseUrl?: string;
  disabled: boolean;
  models?: string[];
  headers?: Record<string, string>;
}

export type ProviderAuthMode = "api_key" | "auth_only" | "api_key_or_auth" | "base_url_only";

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
  | "delete_file"
  | "move_file"
  | "patch"
  | "diff"
  | "grep"
  | "glob"
  | "ls"
  | "web_fetch"
  | "web_search"
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
  // File edit streaming (Cursor-style per-token preview)
  | "stream.file_delta"
  | "stream.file_complete"
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

export interface StreamFileDeltaPayload {
  agentId: string;
  path: string;
  delta: string;
  /** Current accumulated content so far */
  totalLength: number;
  /** 'create' for new files, 'edit' for edits */
  operation: "create" | "edit";
}

export interface StreamFileCompletePayload {
  agentId: string;
  path: string;
  totalLines: number;
  operation: "create" | "edit";
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
    authMode: ProviderAuthMode;
    supportsApiKey: boolean;
    supportsAuthToken: boolean;
    requiresBaseUrl: boolean;
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

// ─── Reasoning Configuration ─────────────────────────────────────────────
// Comprehensive reasoning config based on provider + model patterns
// Researched from official API docs (Anthropic, OpenAI, Google, Groq, xAI)

export type ReasoningLevel = string;

export interface ReasoningConfig {
  parameter: string;
  options: { value: string; label: string; description: string }[];
  defaultValue: string;
  supportsModelSpecific: boolean;
}

export const PROVIDER_REASONING: Record<string, ReasoningConfig | null> = {
  // Anthropic Claude - effort (Opus 4.5+, Sonnet 3.7+)
  anthropic: {
    parameter: 'effort',
    options: [
      { value: 'low', label: 'Low', description: 'Faster, less thorough' },
      { value: 'medium', label: 'Medium', description: 'Balanced' },
      { value: 'high', label: 'High', description: 'Best quality (default)' },
      { value: 'max', label: 'Max', description: 'Maximum reasoning' },
    ],
    defaultValue: 'high',
    supportsModelSpecific: false,
  },

  // OpenAI - varies significantly by model
  // o1/o3 series: low/medium/high
  // GPT-5 series: none/minimal/low/medium/high/xhigh (varies by model)
  openai: {
    parameter: 'reasoning.effort',
    options: [
      { value: 'low', label: 'Low', description: 'Less reasoning effort' },
      { value: 'medium', label: 'Medium', description: 'Balanced (default)' },
      { value: 'high', label: 'High', description: 'More reasoning effort' },
    ],
    defaultValue: 'medium',
    supportsModelSpecific: true,
  },

  // Google Gemini - thinkingBudget tokens or thinkingLevel
  gemini: {
    parameter: 'thinkingConfig.thinkingBudget',
    options: [
      { value: '0', label: 'Off', description: 'No thinking' },
      { value: '1024', label: 'Low', description: '~1K tokens' },
      { value: '8192', label: 'Medium', description: '~8K tokens' },
      { value: '24576', label: 'High', description: '~24K tokens' },
    ],
    defaultValue: '8192',
    supportsModelSpecific: false,
  },

  // Groq - varies by model family
  // Qwen models: none/default
  // GPT-OSS models: low/medium/high
  groq: {
    parameter: 'reasoning_effort',
    options: [
      { value: 'low', label: 'Low', description: 'Small reasoning effort' },
      { value: 'medium', label: 'Medium', description: 'Balanced (default)' },
      { value: 'high', label: 'High', description: 'Maximum reasoning effort' },
    ],
    defaultValue: 'medium',
    supportsModelSpecific: true,
  },

  // xAI Grok - only low/high for Grok 3
  xai: {
    parameter: 'reasoning_effort',
    options: [
      { value: 'low', label: 'Low', description: 'Lower reasoning' },
      { value: 'high', label: 'High', description: 'Higher reasoning (default)' },
    ],
    defaultValue: 'high',
    supportsModelSpecific: false,
  },

  // Azure OpenAI - same as OpenAI
  azure: {
    parameter: 'reasoning.effort',
    options: [
      { value: 'low', label: 'Low', description: 'Less reasoning' },
      { value: 'medium', label: 'Medium', description: 'Balanced (default)' },
      { value: 'high', label: 'High', description: 'More reasoning' },
    ],
    defaultValue: 'medium',
    supportsModelSpecific: true,
  },

  // No reasoning control exposed
  copilot: null,
  openrouter: null,
  bedrock: null,
  vertexai: null,
  local: null,
};

// Model-specific reasoning options (for providers that vary by model)
export const MODEL_REASONING_OVERRIDES: Array<{
  pattern: RegExp;
  provider: string;
  options: { value: string; label: string; description: string }[];
  defaultValue: string;
}> = [
  // OpenAI GPT-5 series - supports xhigh
  { pattern: /^gpt-5/, provider: 'openai', options: [
    { value: 'none', label: 'None', description: 'No explicit reasoning' },
    { value: 'minimal', label: 'Minimal', description: 'Minimal effort' },
    { value: 'low', label: 'Low', description: 'Low effort' },
    { value: 'medium', label: 'Medium', description: 'Balanced' },
    { value: 'high', label: 'High', description: 'High effort' },
    { value: 'xhigh', label: 'X-High', description: 'Maximum effort' },
  ], defaultValue: 'high' },

  // OpenAI o1-mini - NO reasoning_effort (not supported)
  { pattern: /^o1-mini/, provider: 'openai', options: [], defaultValue: '' },

  // OpenAI o1/o3/o4 series - supports low/medium/high
  { pattern: /^(o1|o3|o4)/, provider: 'openai', options: [
    { value: 'low', label: 'Low', description: 'Less reasoning' },
    { value: 'medium', label: 'Medium', description: 'Balanced (default)' },
    { value: 'high', label: 'High', description: 'More reasoning' },
  ], defaultValue: 'medium' },

  // Groq Qwen models - only none/default
  { pattern: /^qwen/, provider: 'groq', options: [
    { value: 'none', label: 'None', description: 'Disable reasoning' },
    { value: 'default', label: 'Default', description: 'Enable reasoning' },
  ], defaultValue: 'default' },

  // Groq GPT-OSS models - low/medium/high
  { pattern: /^gpt-oss/, provider: 'groq', options: [
    { value: 'low', label: 'Low', description: 'Low effort' },
    { value: 'medium', label: 'Medium', description: 'Balanced (default)' },
    { value: 'high', label: 'High', description: 'High effort' },
  ], defaultValue: 'medium' },

  // Gemini 2.5/3 - thinkingLevel option
  { pattern: /^(gemini-2\.5|gemini-3)/, provider: 'gemini', options: [
    { value: '0', label: 'Off', description: 'No thinking' },
    { value: 'low', label: 'Low', description: 'Low thinking' },
    { value: 'high', label: 'High', description: 'High thinking' },
  ], defaultValue: 'high' },
];

export function getReasoningConfig(provider: string, model?: string): ReasoningConfig | null {
  const providerConfig = PROVIDER_REASONING[provider];
  if (!providerConfig) return null;
  
  // If no model specified or provider doesn't have model-specific options
  if (!model || !providerConfig.supportsModelSpecific) {
    return providerConfig;
  }
  
  // Check for model-specific overrides
  for (const override of MODEL_REASONING_OVERRIDES) {
    if (override.pattern.test(model) && override.provider === provider) {
      if (override.options.length === 0) {
        return null; // Model doesn't support reasoning (e.g., o1-mini)
      }
      return {
        ...providerConfig,
        options: override.options,
        defaultValue: override.defaultValue,
      };
    }
  }
  
  return providerConfig;
}

export function hasReasoningSupport(provider: string, model?: string): boolean {
  const config = getReasoningConfig(provider, model);
  return config !== null && config.options.length > 0;
}

export function getDefaultReasoning(provider: string, model?: string): string {
  const config = getReasoningConfig(provider, model);
  return config?.defaultValue ?? 'medium';
}
