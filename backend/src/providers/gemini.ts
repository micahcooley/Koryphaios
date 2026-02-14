// Gemini provider — supports both API calls and gemini-cli child process wrapper.
// Uses Google's GenAI SDK for direct API access.

import type { ProviderConfig } from "@koryphaios/shared";
import {
  type Provider,
  type ProviderEvent,
  type StreamRequest,
  getModelsForProvider,
} from "./types";

export class GeminiProvider implements Provider {
  readonly name = "gemini" as const;

  constructor(readonly config: ProviderConfig) {}

  isAvailable(): boolean {
    return !this.config.disabled && !!this.config.apiKey;
  }

  listModels() {
    return getModelsForProvider("gemini");
  }

  async *streamResponse(request: StreamRequest): AsyncGenerator<ProviderEvent> {
    // Dynamic import to avoid loading @google/genai if not needed
    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey: this.config.apiKey! });

    const tools = request.tools?.map((t) => ({
      functionDeclarations: [{
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      }],
    }));

    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: typeof m.content === "string"
          ? [{ text: m.content }]
          : (m.content as any[]).map((b: any) => {
              if (b.type === "text") return { text: b.text ?? "" };
              if (b.type === "tool_result") return { text: b.toolOutput ?? "" };
              return { text: "" };
            }),
      }));

    try {
      const response = await client.models.generateContentStream({
        model: request.model,
        contents,
        config: {
          systemInstruction: request.systemPrompt,
          maxOutputTokens: request.maxTokens ?? 65_536,
          temperature: request.temperature,
          tools: tools as any,
        },
      });

      for await (const chunk of response) {
        const candidate = chunk.candidates?.[0];
        if (!candidate?.content?.parts) continue;

        for (const part of candidate.content.parts) {
          if (part.text) {
            yield { type: "content_delta", content: part.text };
          }
          if ((part as any).thought) {
            yield { type: "thinking_delta", thinking: (part as any).thought };
          }
          if ((part as any).functionCall) {
            const fc = (part as any).functionCall;
            yield { type: "tool_use_start", toolCallId: fc.name, toolName: fc.name };
            yield {
              type: "tool_use_stop",
              toolCallId: fc.name,
              toolName: fc.name,
              toolInput: JSON.stringify(fc.args ?? {}),
            };
          }
        }

        if (candidate.finishReason) {
          yield {
            type: "complete",
            finishReason: String(candidate.finishReason).includes("TOOL") ? "tool_use" : "end_turn",
          };
        }

        if (chunk.usageMetadata) {
          yield {
            type: "usage_update",
            tokensIn: chunk.usageMetadata.promptTokenCount,
            tokensOut: chunk.usageMetadata.candidatesTokenCount,
          };
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      yield { type: "error", error: err.message ?? String(err) };
    }
  }
}

// ─── Gemini CLI Wrapper ─────────────────────────────────────────────────────
// Wraps the `gemini` CLI as a child process, intercepting stdout.
// Used for authenticated Gemini access via Google Cloud CLI auth.

export class GeminiCLIProvider implements Provider {
  readonly name = "gemini" as const;

  constructor(readonly config: ProviderConfig) {}

  isAvailable(): boolean {
    return !this.config.disabled;
  }

  listModels() {
    return getModelsForProvider("gemini");
  }

  async *streamResponse(request: StreamRequest): AsyncGenerator<ProviderEvent> {
    const prompt = request.messages
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");

    const proc = Bun.spawn(["gemini", "--model", request.model, "--prompt", prompt], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...this.config.headers },
    });

    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (text) {
          yield { type: "content_delta", content: text };
        }
      }

      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderrReader = proc.stderr.getReader();
        const { value } = await stderrReader.read();
        const errText = value ? decoder.decode(value) : `Process exited with code ${exitCode}`;
        yield { type: "error", error: errText };
      } else {
        yield { type: "complete", finishReason: "end_turn" };
      }
    } catch (err: any) {
      yield { type: "error", error: err.message ?? String(err) };
    }
  }
}
