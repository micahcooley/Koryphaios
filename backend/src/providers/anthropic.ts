// Anthropic Claude provider — supports Claude 3.5/3.7/4 Sonnet, Opus, Haiku.
// Uses extended thinking for reasoning models. Never restricts output quality.
// Supports both API key and Claude Code OAuth token (Pro/Max subscription).

import Anthropic from "@anthropic-ai/sdk";
import type { ProviderConfig } from "@koryphaios/shared";
import {
  type Provider,
  type ProviderEvent,
  type StreamRequest,
  type ProviderContentBlock,
  getModelsForProvider,
} from "./types";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export function detectClaudeCodeToken(): string | null {
  const configPaths = [
    join(homedir(), ".claude", ".credentials.json"),
  ];

  for (const path of configPaths) {
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      // credentials.json has { "authToken": "..." } or { "oauth_token": "..." }
      if (data?.authToken) return data.authToken;
      if (data?.oauth_token) return data.oauth_token;
    } catch {
      continue;
    }
  }

  // Also check environment
  return process.env.CLAUDE_CODE_OAUTH_TOKEN ?? null;
}

export class AnthropicProvider implements Provider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor(readonly config: ProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      authToken: config.authToken,
      ...(config.baseUrl && { baseURL: config.baseUrl }),
    });
  }

  isAvailable(): boolean {
    return !this.config.disabled && !!(this.config.apiKey || this.config.authToken);
  }

  listModels() {
    return getModelsForProvider("anthropic");
  }

  async *streamResponse(request: StreamRequest): AsyncGenerator<ProviderEvent> {
    const messages = this.convertMessages(request.messages);
    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const params: Anthropic.MessageCreateParamsStreaming = {
      model: request.model,
      max_tokens: request.maxTokens ?? 16_384,
      system: request.systemPrompt,
      messages,
      stream: true,
      ...(tools?.length && { tools }),
    };

    // Enable extended thinking for reasoning models — ensure budget allows for output
    if (request.reasoningLevel) {
      const outputTokens = request.maxTokens ?? 16_384;
      let thinkingBudget = 8192; // Default medium

      if (request.reasoningLevel === "low") thinkingBudget = 4096;
      else if (request.reasoningLevel === "medium") thinkingBudget = 8192;
      else if (request.reasoningLevel === "high") thinkingBudget = 32768;
      else if (request.reasoningLevel === "max" || request.reasoningLevel === "xhigh") thinkingBudget = 65536;
      else if (!isNaN(Number(request.reasoningLevel))) thinkingBudget = Number(request.reasoningLevel);

      if (thinkingBudget > 0) {
        (params as any).thinking = {
          type: "enabled",
          budget_tokens: thinkingBudget,
        };
        // Total max_tokens must include both thinking and output
        params.max_tokens = thinkingBudget + outputTokens;
      }
    }

    try {
      const stream = this.client.messages.stream(params, {
        signal: request.signal,
      });

      let currentToolCallId = "";
      let currentToolName = "";
      let toolInputBuffer = "";

      for await (const event of stream) {
        switch (event.type) {
          case "content_block_start": {
            const block = event.content_block;
            if (block.type === "tool_use") {
              currentToolCallId = block.id;
              currentToolName = block.name;
              toolInputBuffer = "";
              yield {
                type: "tool_use_start",
                toolCallId: block.id,
                toolName: block.name,
              };
            } else if (block.type === "thinking") {
              yield { type: "thinking_delta", thinking: block.thinking };
            }
            break;
          }

          case "content_block_delta": {
            const delta = event.delta;
            if (delta.type === "text_delta") {
              yield { type: "content_delta", content: delta.text };
            } else if (delta.type === "thinking_delta") {
              yield { type: "thinking_delta", thinking: delta.thinking };
            } else if (delta.type === "input_json_delta") {
              toolInputBuffer += delta.partial_json;
              yield {
                type: "tool_use_delta",
                toolCallId: currentToolCallId,
                toolName: currentToolName,
                toolInput: delta.partial_json,
              };
            }
            break;
          }

          case "content_block_stop": {
            if (currentToolCallId) {
              yield {
                type: "tool_use_stop",
                toolCallId: currentToolCallId,
                toolName: currentToolName,
                toolInput: toolInputBuffer,
              };
              currentToolCallId = "";
              currentToolName = "";
              toolInputBuffer = "";
            }
            break;
          }

          case "message_delta": {
            const usage = (event as any).usage;
            yield {
              type: "usage_update",
              tokensOut: usage?.output_tokens,
            };
            yield {
              type: "complete",
              finishReason: event.delta.stop_reason === "tool_use" ? "tool_use" : "end_turn",
            };
            break;
          }

          case "message_start": {
            const usage = event.message.usage;
            yield {
              type: "usage_update",
              tokensIn: usage.input_tokens,
              tokensOut: usage.output_tokens,
            };
            break;
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      yield { type: "error", error: err.message ?? String(err) };
    }
  }

  private convertMessages(messages: StreamRequest["messages"]): Anthropic.MessageParam[] {
    return messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (typeof m.content === "string") {
          return { role: m.role as "user" | "assistant", content: m.content };
        }

        const blocks = m.content as ProviderContentBlock[];
        const anthropicContent: Anthropic.ContentBlockParam[] = blocks.map((b) => {
          if (b.type === "text") {
            return { type: "text", text: b.text ?? "" };
          }
          if (b.type === "tool_use") {
            return {
              type: "tool_use",
              id: b.toolCallId ?? "",
              name: b.toolName ?? "",
              input: b.toolInput ?? {},
            };
          }
          if (b.type === "tool_result") {
            return {
              type: "tool_result",
              tool_use_id: b.toolCallId ?? "",
              content: b.toolOutput ?? "",
              is_error: b.isError ?? false,
            };
          }
          if (b.type === "image") {
            return {
              type: "image",
              source: {
                type: "base64",
                media_type: (b.imageMimeType ?? "image/png") as any,
                data: b.imageData ?? "",
              },
            };
          }
          return { type: "text", text: "" };
        });

        return { role: m.role as "user" | "assistant", content: anthropicContent };
      });
  }
}
