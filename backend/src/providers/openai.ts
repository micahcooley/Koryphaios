// OpenAI provider — supports GPT-4.1, O3, O4-mini, Codex.
// Also used as base for Groq, OpenRouter, xAI (OpenAI-compatible endpoints).

import OpenAI from "openai";
import type { ProviderConfig, ProviderName } from "@koryphaios/shared";
import {
  type Provider,
  type ProviderEvent,
  type StreamRequest,
  type ProviderContentBlock,
  getModelsForProvider,
} from "./types";

export class OpenAIProvider implements Provider {
  private client: OpenAI;

  constructor(
    readonly config: ProviderConfig,
    readonly name: ProviderName = "openai",
    baseUrl?: string,
  ) {
    this.client = new OpenAI({
      apiKey: config.apiKey || "sk-placeholder-not-configured",
      baseURL: baseUrl ?? config.baseUrl,
      defaultHeaders: config.headers,
    });
  }

  isAvailable(): boolean {
    return !this.config.disabled && !!this.config.apiKey;
  }

  listModels() {
    return getModelsForProvider(this.name);
  }

  async *streamResponse(request: StreamRequest): AsyncGenerator<ProviderEvent> {
    const messages = this.convertMessages(request);
    const tools = request.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const params: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: request.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(request.maxTokens && { max_completion_tokens: request.maxTokens }),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(tools?.length && { tools }),
      // For reasoning models, set reasoning effort without restricting it
      ...(request.reasoningEffort && { reasoning_effort: request.reasoningEffort }),
    };

    try {
      const stream = await this.client.chat.completions.create(params, {
        signal: request.signal,
      });

      const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (!choice) {
          if (chunk.usage) {
            yield {
              type: "usage_update",
              tokensIn: chunk.usage.prompt_tokens,
              tokensOut: chunk.usage.completion_tokens,
            };
          }
          continue;
        }

        const delta = choice.delta;

        // Content streaming
        if (delta?.content) {
          yield { type: "content_delta", content: delta.content };
        }

        // Reasoning content (O-series models)
        if ((delta as any)?.reasoning_content) {
          yield { type: "thinking_delta", thinking: (delta as any).reasoning_content };
        }

        // Tool call streaming
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallBuffers.has(idx)) {
              toolCallBuffers.set(idx, { id: tc.id ?? "", name: tc.function?.name ?? "", args: "" });
              yield {
                type: "tool_use_start",
                toolCallId: tc.id,
                toolName: tc.function?.name,
              };
            }

            const buf = toolCallBuffers.get(idx)!;
            if (tc.id) buf.id = tc.id;
            if (tc.function?.name) buf.name = tc.function.name;
            if (tc.function?.arguments) {
              buf.args += tc.function.arguments;
              yield {
                type: "tool_use_delta",
                toolCallId: buf.id,
                toolName: buf.name,
                toolInput: tc.function.arguments,
              };
            }
          }
        }

        // Completion
        if (choice.finish_reason) {
          // Emit all tool call completions
          for (const [, buf] of toolCallBuffers) {
            yield {
              type: "tool_use_stop",
              toolCallId: buf.id,
              toolName: buf.name,
              toolInput: buf.args,
            };
          }
          toolCallBuffers.clear();

          yield {
            type: "complete",
            finishReason: choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn",
          };
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      yield { type: "error", error: err.message ?? String(err) };
    }
  }

  private convertMessages(request: StreamRequest): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      result.push({ role: "system", content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      if (msg.role === "system") continue;

      if (typeof msg.content === "string") {
        result.push({ role: msg.role as any, content: msg.content });
        continue;
      }

      const blocks = msg.content as ProviderContentBlock[];
      if (msg.role === "assistant") {
        const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
        const toolCalls = blocks
          .filter((b) => b.type === "tool_use")
          .map((b) => ({
            id: b.toolCallId ?? "",
            type: "function" as const,
            function: { name: b.toolName ?? "", arguments: JSON.stringify(b.toolInput ?? {}) },
          }));

        result.push({
          role: "assistant",
          content: text || null,
          ...(toolCalls.length && { tool_calls: toolCalls }),
        });
      } else if (msg.role === "user") {
        // Check for tool results
        const toolResults = blocks.filter((b) => b.type === "tool_result");
        if (toolResults.length) {
          for (const tr of toolResults) {
            result.push({
              role: "tool",
              tool_call_id: tr.toolCallId ?? "",
              content: tr.toolOutput ?? "",
            });
          }
        } else {
          const content: OpenAI.ChatCompletionContentPart[] = blocks.map((b) => {
            if (b.type === "image") {
              return {
                type: "image_url",
                image_url: { url: `data:${b.imageMimeType};base64,${b.imageData}` },
              };
            }
            return { type: "text", text: b.text ?? "" };
          });
          result.push({ role: "user", content });
        }
      }
    }

    return result;
  }
}

// ─── OpenAI-Compatible Provider Factories ───────────────────────────────────

export class GroqProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super(config, "groq", "https://api.groq.com/openai/v1");
  }
}

export class OpenRouterProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super(config, "openrouter", "https://openrouter.ai/api/v1");
  }
}

export class XAIProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super(config, "xai", "https://api.x.ai/v1");
  }
}

export class AzureProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    super(config, "azure", config.baseUrl);
  }
}
