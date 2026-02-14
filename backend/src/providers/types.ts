// Provider abstraction layer — modeled after OpenCode's baseProvider pattern.
// Each provider implements a uniform streaming interface regardless of underlying API.

import type { ModelDef, ProviderConfig, ProviderName } from "@koryphaios/shared";

// ─── Provider Events (streaming protocol) ───────────────────────────────────

export type ProviderEventType =
  | "content_delta"
  | "thinking_delta"
  | "tool_use_start"
  | "tool_use_delta"
  | "tool_use_stop"
  | "usage_update"
  | "complete"
  | "error";

export interface ProviderEvent {
  type: ProviderEventType;
  content?: string;
  thinking?: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: string;
  tokensIn?: number;
  tokensOut?: number;
  finishReason?: "end_turn" | "tool_use" | "max_tokens" | "stop";
  error?: string;
}

// ─── Tool definition for provider calls ─────────────────────────────────────

export interface ProviderToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ─── Message format for provider calls ──────────────────────────────────────

export interface ProviderMessage {
  role: "user" | "assistant" | "system";
  content: string | ProviderContentBlock[];
}

export interface ProviderContentBlock {
  type: "text" | "image" | "tool_use" | "tool_result";
  text?: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  isError?: boolean;
  imageData?: string;
  imageMimeType?: string;
}

// ─── Stream request ─────────────────────────────────────────────────────────

export interface StreamRequest {
  model: string;
  messages: ProviderMessage[];
  systemPrompt: string;
  tools?: ProviderToolDef[];
  maxTokens?: number;
  temperature?: number;
  /** For reasoning models — never restrict this */
  reasoningEffort?: "low" | "medium" | "high";
  /** Signal to abort the stream */
  signal?: AbortSignal;
}

// ─── Provider interface ─────────────────────────────────────────────────────

export interface Provider {
  readonly name: ProviderName;
  readonly config: ProviderConfig;

  /** Stream a response from the model. Yields events as they arrive. */
  streamResponse(request: StreamRequest): AsyncGenerator<ProviderEvent>;

  /** Check if this provider is configured and authenticated. */
  isAvailable(): boolean;

  /** List models available for this provider. */
  listModels(): ModelDef[];
}

// ─── Provider factory ───────────────────────────────────────────────────────

export type ProviderFactory = (config: ProviderConfig) => Provider;

// ─── Model catalog ──────────────────────────────────────────────────────────
// Ported from OpenCode's models.go — comprehensive model definitions.

export const MODEL_CATALOG: Record<string, ModelDef> = {
  // ── Anthropic ──────────────────────────────────────────────────────────
  "claude-sonnet-4-20250514": {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "claude-3-7-sonnet-20250219": {
    id: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "claude-3-5-sonnet-20241022": {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "claude-opus-4-20250514": {
    id: "claude-opus-4-20250514",
    name: "Claude Opus 4",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    costPerMInputTokens: 15.0,
    costPerMOutputTokens: 75.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────
  "gpt-4.1": {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    contextWindow: 1_047_576,
    maxOutputTokens: 32_768,
    costPerMInputTokens: 2.0,
    costPerMOutputTokens: 8.0,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "o4-mini": {
    id: "o4-mini",
    name: "O4 Mini",
    provider: "openai",
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    costPerMInputTokens: 1.1,
    costPerMOutputTokens: 4.4,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "o3": {
    id: "o3",
    name: "O3",
    provider: "openai",
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    costPerMInputTokens: 2.0,
    costPerMOutputTokens: 8.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "codex-mini-latest": {
    id: "codex-mini-latest",
    name: "Codex Mini",
    provider: "openai",
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    costPerMInputTokens: 1.5,
    costPerMOutputTokens: 6.0,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },

  // ── Gemini ─────────────────────────────────────────────────────────────
  "gemini-2.5-pro-preview-05-06": {
    id: "gemini-2.5-pro-preview-05-06",
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    costPerMInputTokens: 1.25,
    costPerMOutputTokens: 10.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gemini-2.5-flash-preview-05-20": {
    id: "gemini-2.5-flash-preview-05-20",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    costPerMInputTokens: 0.15,
    costPerMOutputTokens: 3.5,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // ── Groq ───────────────────────────────────────────────────────────────
  "llama-3.3-70b-versatile": {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B",
    provider: "groq",
    contextWindow: 128_000,
    maxOutputTokens: 32_768,
    costPerMInputTokens: 0.59,
    costPerMOutputTokens: 0.79,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },

  // ── xAI ────────────────────────────────────────────────────────────────
  "grok-3": {
    id: "grok-3",
    name: "Grok 3",
    provider: "xai",
    contextWindow: 131_072,
    maxOutputTokens: 131_072,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "grok-3-mini": {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    provider: "xai",
    contextWindow: 131_072,
    maxOutputTokens: 131_072,
    costPerMInputTokens: 0.3,
    costPerMOutputTokens: 0.5,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },
};

// ─── Resolve model from catalog or create custom ────────────────────────────

export function resolveModel(modelId: string): ModelDef | undefined {
  return MODEL_CATALOG[modelId];
}

export function getModelsForProvider(providerName: ProviderName): ModelDef[] {
  return Object.values(MODEL_CATALOG).filter((m) => m.provider === providerName);
}
