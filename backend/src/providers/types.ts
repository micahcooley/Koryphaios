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
  /** For reasoning models — never restrict this. Can be "low"|"medium"|"high" or provider-specific like "8192" */
  reasoningLevel?: string;
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
// 1:1 port from OpenCode's models/*.go — exact IDs, names, costs, context windows, reasoning flags.

export const MODEL_CATALOG: Record<string, ModelDef> = {
  // ── Anthropic (from anthropic.go) ─────────────────────────────────────

  // Claude 4.6 Series (Current Flagship - February 2026)
  "claude-opus-4-6": {
    id: "claude-opus-4-6",
    name: "Claude 4.6 Opus",
    provider: "anthropic",
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    costPerMInputTokens: 5.0,
    costPerMOutputTokens: 25.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // Claude 4.5 Series (Current - September/November 2025)
  "claude-sonnet-4-5": {
    id: "claude-sonnet-4-5",
    name: "Claude 4.5 Sonnet",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "claude-haiku-4-5": {
    id: "claude-haiku-4-5",
    name: "Claude 4.5 Haiku",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    costPerMInputTokens: 0.25,
    costPerMOutputTokens: 1.25,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // Claude 4 Series
  "claude-sonnet-4-0": {
    id: "claude-sonnet-4-0",
    name: "Claude 4 Sonnet (Legacy)",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "claude-opus-4-0": {
    id: "claude-opus-4-0",
    name: "Claude 4 Opus (Legacy)",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    costPerMInputTokens: 15.0,
    costPerMOutputTokens: 75.0,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // Legacy Claude 3 Models (Deprecated - October 2025)
  "claude-3-haiku-20240307": {
    id: "claude-3-haiku-20240307",
    name: "Claude 3 Haiku (Legacy)",
    provider: "anthropic",
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    costPerMInputTokens: 0.25,
    costPerMOutputTokens: 1.25,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // ── OpenAI (from openai.go) ───────────────────────────────────────────

  // GPT-5 Series (Current - February 2026)
  "gpt-5.2": {
    id: "gpt-5.2",
    name: "GPT 5.2",
    provider: "openai",
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    costPerMInputTokens: 1.25,
    costPerMOutputTokens: 10.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gpt-5.1": {
    id: "gpt-5.1",
    name: "GPT 5.1",
    provider: "openai",
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    costPerMInputTokens: 1.25,
    costPerMOutputTokens: 10.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gpt-5": {
    id: "gpt-5",
    name: "GPT 5",
    provider: "openai",
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    costPerMInputTokens: 1.25,
    costPerMOutputTokens: 10.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gpt-5-mini": {
    id: "gpt-5-mini",
    name: "GPT 5 mini",
    provider: "openai",
    contextWindow: 400_000,
    maxOutputTokens: 64_000,
    costPerMInputTokens: 0.25,
    costPerMOutputTokens: 2.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gpt-5-nano": {
    id: "gpt-5-nano",
    name: "GPT 5 nano",
    provider: "openai",
    contextWindow: 400_000,
    maxOutputTokens: 32_000,
    costPerMInputTokens: 0.05,
    costPerMOutputTokens: 0.40,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // Legacy GPT-4 Series (Still available in API, deprecated from ChatGPT)
  "gpt-4.1": {
    id: "gpt-4.1",
    name: "GPT 4.1 (Legacy)",
    provider: "openai",
    contextWindow: 1_047_576,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 2.0,
    costPerMOutputTokens: 8.0,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gpt-4.1-mini": {
    id: "gpt-4.1-mini",
    name: "GPT 4.1 mini (Legacy)",
    provider: "openai",
    contextWindow: 200_000,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 0.40,
    costPerMOutputTokens: 1.60,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gpt-4.1-nano": {
    id: "gpt-4.1-nano",
    name: "GPT 4.1 nano (Legacy)",
    provider: "openai",
    contextWindow: 1_047_576,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 0.10,
    costPerMOutputTokens: 0.40,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gpt-4.5-preview": {
    id: "gpt-4.5-preview",
    name: "GPT 4.5 preview (Legacy)",
    provider: "openai",
    contextWindow: 128_000,
    maxOutputTokens: 15_000,
    costPerMInputTokens: 75.0,
    costPerMOutputTokens: 150.0,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gpt-4o": {
    id: "gpt-4o",
    name: "GPT 4o (Legacy)",
    provider: "openai",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    costPerMInputTokens: 2.50,
    costPerMOutputTokens: 10.0,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    name: "GPT 4o mini (Legacy)",
    provider: "openai",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    costPerMInputTokens: 0.15,
    costPerMOutputTokens: 0.60,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // Legacy Reasoning Models (Still in API, deprecated from ChatGPT)
  "o1": {
    id: "o1",
    name: "O1 (Legacy)",
    provider: "openai",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 15.0,
    costPerMOutputTokens: 60.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "o1-pro": {
    id: "o1-pro",
    name: "o1 pro (Legacy)",
    provider: "openai",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 150.0,
    costPerMOutputTokens: 600.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "o1-mini": {
    id: "o1-mini",
    name: "o1 mini (Legacy)",
    provider: "openai",
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.10,
    costPerMOutputTokens: 4.40,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "o3": {
    id: "o3",
    name: "o3 (Legacy)",
    provider: "openai",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 10.0,
    costPerMOutputTokens: 40.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "o3-mini": {
    id: "o3-mini",
    name: "o3 mini (Legacy)",
    provider: "openai",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.10,
    costPerMOutputTokens: 4.40,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "o4-mini": {
    id: "o4-mini",
    name: "o4 mini (Legacy)",
    provider: "openai",
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.10,
    costPerMOutputTokens: 4.40,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // ── Google Gemini (from gemini.go) ────────────────────────────────────

  // Gemini 3 Series (Current - November/December 2025)
  "gemini-3-pro": {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "google",
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    costPerMInputTokens: 1.50,
    costPerMOutputTokens: 15.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gemini-3-flash": {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "google",
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    costPerMInputTokens: 0.15,
    costPerMOutputTokens: 0.60,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // Gemini 2.5 Series (Legacy)
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro (Legacy)",
    provider: "google",
    contextWindow: 1_000_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.25,
    costPerMOutputTokens: 10.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash (Legacy)",
    provider: "google",
    contextWindow: 1_000_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 0.30,
    costPerMOutputTokens: 2.50,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gemini-2.5-flash-lite": {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
    contextWindow: 1_000_000,
    maxOutputTokens: 8_000,
    costPerMInputTokens: 0.075,
    costPerMOutputTokens: 0.30,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // Gemini 2.0 Series (Legacy - discontinued)
  "gemini-2.0-flash": {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash (Legacy)",
    provider: "google",
    contextWindow: 1_000_000,
    maxOutputTokens: 6_000,
    costPerMInputTokens: 0.10,
    costPerMOutputTokens: 0.40,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gemini-2.0-flash-lite": {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite (Legacy)",
    provider: "google",
    contextWindow: 1_000_000,
    maxOutputTokens: 6_000,
    costPerMInputTokens: 0.05,
    costPerMOutputTokens: 0.30,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // ── Codex (CLI wrapper) ───────────────────────────────────────────────

  "gpt-5.3-codex": {
    id: "gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    provider: "codex",
    contextWindow: 2_097_152,
    maxOutputTokens: 128_000,
    costPerMInputTokens: 2.5,
    costPerMOutputTokens: 10.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "gpt-5.2-codex": {
    id: "gpt-5.2-codex",
    name: "GPT-5.2 Codex",
    provider: "codex",
    contextWindow: 1_048_576,
    maxOutputTokens: 128_000,
    costPerMInputTokens: 2.0,
    costPerMOutputTokens: 8.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  // ── Groq (from groq.go) ──────────────────────────────────────────────

  "qwen-qwq-32b": {
    id: "qwen-qwq-32b",
    name: "Qwen Qwq",
    provider: "groq",
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 0.29,
    costPerMOutputTokens: 0.39,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "meta-llama/llama-4-scout-17b-16e-instruct": {
    id: "meta-llama/llama-4-scout-17b-16e-instruct",
    name: "Llama 4 Scout",
    provider: "groq",
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 0.11,
    costPerMOutputTokens: 0.34,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "meta-llama/llama-4-maverick-17b-128e-instruct": {
    id: "meta-llama/llama-4-maverick-17b-128e-instruct",
    name: "Llama 4 Maverick",
    provider: "groq",
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 0.20,
    costPerMOutputTokens: 0.20,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "llama-3.3-70b-versatile": {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B Versatile",
    provider: "groq",
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 0.59,
    costPerMOutputTokens: 0.79,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "deepseek-r1-distill-llama-70b": {
    id: "deepseek-r1-distill-llama-70b",
    name: "DeepSeek R1 Distill Llama 70B",
    provider: "groq",
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 0.75,
    costPerMOutputTokens: 0.99,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },

  // ── xAI (from xai.go) ────────────────────────────────────────────────

  // Grok 4 Series (Current - July 2025)
  "grok-4-0709": {
    id: "grok-4-0709",
    name: "Grok 4",
    provider: "xai",
    contextWindow: 256_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "grok-4": {
    id: "grok-4",
    name: "Grok 4",
    provider: "xai",
    contextWindow: 256_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "grok-4-1": {
    id: "grok-4-1",
    name: "Grok 4.1",
    provider: "xai",
    contextWindow: 256_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "grok-4-1-fast": {
    id: "grok-4-1-fast",
    name: "Grok 4.1 Fast",
    provider: "xai",
    contextWindow: 2_000_000,
    maxOutputTokens: 30_000,
    costPerMInputTokens: 0.20,
    costPerMOutputTokens: 0.50,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // Legacy Grok 3 Series
  "grok-3-beta": {
    id: "grok-3-beta",
    name: "Grok 3 Beta (Legacy)",
    provider: "xai",
    contextWindow: 131_072,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "grok-3": {
    id: "grok-3",
    name: "Grok 3",
    provider: "xai",
    contextWindow: 131_072,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "grok-3-mini-beta": {
    id: "grok-3-mini-beta",
    name: "Grok 3 Mini Beta (Legacy)",
    provider: "xai",
    contextWindow: 131_072,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 0.30,
    costPerMOutputTokens: 0.50,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },

  // ── OpenRouter (from openrouter.go) ───────────────────────────────────
  // API model IDs use provider-prefixed format (e.g., "openai/gpt-4.1")

  "openrouter.gpt-4.1": {
    id: "openrouter.gpt-4.1",
    apiModelId: "openai/gpt-4.1",
    name: "OpenRouter – GPT 4.1",
    provider: "openrouter",
    contextWindow: 1_047_576,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 2.0,
    costPerMOutputTokens: 8.0,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.gpt-4.1-mini": {
    id: "openrouter.gpt-4.1-mini",
    apiModelId: "openai/gpt-4.1-mini",
    name: "OpenRouter – GPT 4.1 mini",
    provider: "openrouter",
    contextWindow: 200_000,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 0.40,
    costPerMOutputTokens: 1.60,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.gpt-4.1-nano": {
    id: "openrouter.gpt-4.1-nano",
    apiModelId: "openai/gpt-4.1-nano",
    name: "OpenRouter – GPT 4.1 nano",
    provider: "openrouter",
    contextWindow: 1_047_576,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 0.10,
    costPerMOutputTokens: 0.40,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.gpt-4.5-preview": {
    id: "openrouter.gpt-4.5-preview",
    apiModelId: "openai/gpt-4.5-preview",
    name: "OpenRouter – GPT 4.5 preview",
    provider: "openrouter",
    contextWindow: 128_000,
    maxOutputTokens: 15_000,
    costPerMInputTokens: 75.0,
    costPerMOutputTokens: 150.0,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.gpt-4o": {
    id: "openrouter.gpt-4o",
    apiModelId: "openai/gpt-4o",
    name: "OpenRouter – GPT 4o",
    provider: "openrouter",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    costPerMInputTokens: 2.50,
    costPerMOutputTokens: 10.0,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.gpt-4o-mini": {
    id: "openrouter.gpt-4o-mini",
    apiModelId: "openai/gpt-4o-mini",
    name: "OpenRouter – GPT 4o mini",
    provider: "openrouter",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    costPerMInputTokens: 0.15,
    costPerMOutputTokens: 0.60,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.o1": {
    id: "openrouter.o1",
    apiModelId: "openai/o1",
    name: "OpenRouter – O1",
    provider: "openrouter",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 15.0,
    costPerMOutputTokens: 60.0,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.o1-pro": {
    id: "openrouter.o1-pro",
    apiModelId: "openai/o1-pro",
    name: "OpenRouter – o1 pro",
    provider: "openrouter",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 150.0,
    costPerMOutputTokens: 600.0,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.o1-mini": {
    id: "openrouter.o1-mini",
    apiModelId: "openai/o1-mini",
    name: "OpenRouter – o1 mini",
    provider: "openrouter",
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.10,
    costPerMOutputTokens: 4.40,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.o3": {
    id: "openrouter.o3",
    apiModelId: "openai/o3",
    name: "OpenRouter – o3",
    provider: "openrouter",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 10.0,
    costPerMOutputTokens: 40.0,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.o3-mini": {
    id: "openrouter.o3-mini",
    apiModelId: "openai/o3-mini-high",
    name: "OpenRouter – o3 mini",
    provider: "openrouter",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.10,
    costPerMOutputTokens: 4.40,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.o4-mini": {
    id: "openrouter.o4-mini",
    apiModelId: "openai/o4-mini-high",
    name: "OpenRouter – o4 mini",
    provider: "openrouter",
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.10,
    costPerMOutputTokens: 4.40,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.gemini-2.5-flash": {
    id: "openrouter.gemini-2.5-flash",
    apiModelId: "google/gemini-2.5-flash-preview:thinking",
    name: "OpenRouter – Gemini 2.5 Flash",
    provider: "openrouter",
    contextWindow: 1_000_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 0.15,
    costPerMOutputTokens: 0.60,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.gemini-2.5": {
    id: "openrouter.gemini-2.5",
    apiModelId: "google/gemini-2.5-pro-preview-03-25",
    name: "OpenRouter – Gemini 2.5 Pro",
    provider: "openrouter",
    contextWindow: 1_000_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.25,
    costPerMOutputTokens: 10.0,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.claude-3.5-sonnet": {
    id: "openrouter.claude-3.5-sonnet",
    apiModelId: "anthropic/claude-3.5-sonnet",
    name: "OpenRouter – Claude 3.5 Sonnet",
    provider: "openrouter",
    contextWindow: 200_000,
    maxOutputTokens: 5_000,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.claude-3-haiku": {
    id: "openrouter.claude-3-haiku",
    apiModelId: "anthropic/claude-3-haiku",
    name: "OpenRouter – Claude 3 Haiku",
    provider: "openrouter",
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    costPerMInputTokens: 0.25,
    costPerMOutputTokens: 1.25,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.claude-3.7-sonnet": {
    id: "openrouter.claude-3.7-sonnet",
    apiModelId: "anthropic/claude-3.7-sonnet",
    name: "OpenRouter – Claude 3.7 Sonnet",
    provider: "openrouter",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 3.0,
    costPerMOutputTokens: 15.0,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.claude-3.5-haiku": {
    id: "openrouter.claude-3.5-haiku",
    apiModelId: "anthropic/claude-3.5-haiku",
    name: "OpenRouter – Claude 3.5 Haiku",
    provider: "openrouter",
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    costPerMInputTokens: 0.80,
    costPerMOutputTokens: 4.0,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.claude-3-opus": {
    id: "openrouter.claude-3-opus",
    apiModelId: "anthropic/claude-3-opus",
    name: "OpenRouter – Claude 3 Opus",
    provider: "openrouter",
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    costPerMInputTokens: 15.0,
    costPerMOutputTokens: 75.0,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "openrouter.deepseek-r1-free": {
    id: "openrouter.deepseek-r1-free",
    apiModelId: "deepseek/deepseek-r1-0528:free",
    name: "OpenRouter – DeepSeek R1 Free",
    provider: "openrouter",
    contextWindow: 163_840,
    maxOutputTokens: 10_000,
    costPerMInputTokens: 0,
    costPerMOutputTokens: 0,
    canReason: false,
    supportsAttachments: false,
    supportsStreaming: true,
  },

  // ── Azure (from azure.go) — same models as OpenAI, prefixed IDs ──────

  "azure.gpt-4.1": {
    id: "azure.gpt-4.1",
    apiModelId: "gpt-4.1",
    name: "Azure – GPT 4.1",
    provider: "azure",
    contextWindow: 1_047_576,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 2.0,
    costPerMOutputTokens: 8.0,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "azure.gpt-4.1-mini": {
    id: "azure.gpt-4.1-mini",
    apiModelId: "gpt-4.1-mini",
    name: "Azure – GPT 4.1 mini",
    provider: "azure",
    contextWindow: 200_000,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 0.40,
    costPerMOutputTokens: 1.60,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "azure.gpt-4.1-nano": {
    id: "azure.gpt-4.1-nano",
    apiModelId: "gpt-4.1-nano",
    name: "Azure – GPT 4.1 nano",
    provider: "azure",
    contextWindow: 1_047_576,
    maxOutputTokens: 20_000,
    costPerMInputTokens: 0.10,
    costPerMOutputTokens: 0.40,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "azure.gpt-4.5-preview": {
    id: "azure.gpt-4.5-preview",
    apiModelId: "gpt-4.5-preview",
    name: "Azure – GPT 4.5 preview",
    provider: "azure",
    contextWindow: 128_000,
    maxOutputTokens: 15_000,
    costPerMInputTokens: 75.0,
    costPerMOutputTokens: 150.0,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "azure.gpt-4o": {
    id: "azure.gpt-4o",
    apiModelId: "gpt-4o",
    name: "Azure – GPT-4o",
    provider: "azure",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    costPerMInputTokens: 2.50,
    costPerMOutputTokens: 10.0,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "azure.gpt-4o-mini": {
    id: "azure.gpt-4o-mini",
    apiModelId: "gpt-4o-mini",
    name: "Azure – GPT-4o mini",
    provider: "azure",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    costPerMInputTokens: 0.15,
    costPerMOutputTokens: 0.60,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "azure.o1": {
    id: "azure.o1",
    apiModelId: "o1",
    name: "Azure – O1",
    provider: "azure",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 15.0,
    costPerMOutputTokens: 60.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "azure.o1-mini": {
    id: "azure.o1-mini",
    apiModelId: "o1-mini",
    name: "Azure – O1 mini",
    provider: "azure",
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.10,
    costPerMOutputTokens: 4.40,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "azure.o3": {
    id: "azure.o3",
    apiModelId: "o3",
    name: "Azure – O3",
    provider: "azure",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 10.0,
    costPerMOutputTokens: 40.0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "azure.o3-mini": {
    id: "azure.o3-mini",
    apiModelId: "o3-mini",
    name: "Azure – O3 mini",
    provider: "azure",
    contextWindow: 200_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.10,
    costPerMOutputTokens: 4.40,
    canReason: true,
    supportsAttachments: false,
    supportsStreaming: true,
  },
  "azure.o4-mini": {
    id: "azure.o4-mini",
    apiModelId: "o4-mini",
    name: "Azure – O4 mini",
    provider: "azure",
    contextWindow: 128_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.10,
    costPerMOutputTokens: 4.40,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },

  // ── VertexAI (from vertexai.go) — mirrors of Gemini models ───────────

  "vertexai.gemini-2.5-flash": {
    id: "vertexai.gemini-2.5-flash",
    apiModelId: "gemini-2.5-flash-preview-04-17",
    name: "VertexAI – Gemini 2.5 Flash",
    provider: "vertexai",
    contextWindow: 1_000_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 0.15,
    costPerMOutputTokens: 0.60,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  "vertexai.gemini-2.5-pro": {
    id: "vertexai.gemini-2.5-pro",
    apiModelId: "gemini-2.5-pro-preview-03-25",
    name: "VertexAI – Gemini 2.5 Pro",
    provider: "vertexai",
    contextWindow: 1_000_000,
    maxOutputTokens: 50_000,
    costPerMInputTokens: 1.25,
    costPerMOutputTokens: 10.0,
    canReason: false,
    supportsAttachments: true,
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
