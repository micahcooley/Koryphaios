// Kory Manager Agent — the orchestrator brain.
// Classifies intent, routes to specialist workers, verifies output.

import type {
  AgentIdentity,
  AgentStatus,
  WorkerDomain,
  WSMessage,
  ProviderName,
} from "@koryphaios/shared";
import { ProviderRegistry, type StreamRequest, type ProviderEvent } from "../providers";
import { ToolRegistry, type ToolCallInput, type ToolContext } from "../tools";
import { wsBroker } from "../pubsub";
import { nanoid } from "nanoid";

// ─── Domain Classification Keywords ─────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<WorkerDomain, string[]> = {
  ui: [
    "skia", "flutter", "ui", "widget", "button", "layout", "css", "style",
    "animation", "render", "frontend", "component", "svelte", "react", "view",
    "canvas", "draw", "paint", "theme", "color", "font", "icon", "design",
    "responsive", "mobile", "dark mode", "light mode", "sidebar", "modal",
  ],
  backend: [
    "c++", "cpp", "cmake", "makefile", "gtest", "boost", "llvm", "clang",
    "server", "api", "database", "sql", "grpc", "protobuf", "socket",
    "memory", "pointer", "thread", "mutex", "algorithm", "data structure",
    "compiler", "linker", "binary", "build", "performance", "optimization",
    "kernel", "driver", "system", "dsp", "audio", "midi", "signal",
  ],
  general: [
    "refactor", "rename", "move", "organize", "clean", "lint", "format",
    "documentation", "readme", "comment", "explain", "review", "improve",
    "typescript", "javascript", "python", "rust", "go",
  ],
  review: ["review", "audit", "check", "verify", "validate", "test"],
  test: ["test", "spec", "gtest", "jest", "vitest", "mocha", "pytest"],
};

// ─── Default Model Assignments per Domain ───────────────────────────────────

const DOMAIN_MODEL_MAP: Record<WorkerDomain, { model: string; provider: ProviderName }> = {
  ui: { model: "codex-mini-latest", provider: "openai" },
  backend: { model: "gemini-2.5-pro-preview-05-06", provider: "gemini" },
  general: { model: "claude-sonnet-4-20250514", provider: "anthropic" },
  review: { model: "claude-sonnet-4-20250514", provider: "anthropic" },
  test: { model: "o4-mini", provider: "openai" },
};

const DOMAIN_GLOW: Record<WorkerDomain, string> = {
  ui: "rgba(0,255,255,0.5)",       // Cyan
  backend: "rgba(128,0,128,0.5)",  // Deep Purple
  general: "rgba(255,165,0,0.5)",  // Orange (Claude)
  review: "rgba(255,165,0,0.5)",   // Orange
  test: "rgba(0,255,128,0.5)",     // Green
};

// ─── Kory Identity ──────────────────────────────────────────────────────────

const KORY_IDENTITY: AgentIdentity = {
  id: "kory-manager",
  name: "Kory",
  role: "manager",
  model: "claude-sonnet-4-20250514",
  provider: "anthropic",
  domain: "general",
  glowColor: "rgba(255,215,0,0.6)", // Gold
};

// ─── System Prompt ──────────────────────────────────────────────────────────

const KORY_SYSTEM_PROMPT = `You are Kory, the orchestrating manager agent for Koryphaios — an AI-powered development workspace.

Your role is to:
1. ANALYZE the user's request and break it into concrete, actionable tasks
2. CLASSIFY each task by domain (UI, backend, testing, general)
3. DELEGATE tasks to specialist worker agents
4. VERIFY their output by examining diffs and running tests
5. SYNTHESIZE results and report back

You are running on a Linux (Pop!_OS) system with full filesystem access. The project being worked on may be large (e.g., a C++ DAW codebase).

IMPORTANT PRINCIPLES:
- Think deeply about every request. Quality matters more than speed.
- Never truncate your reasoning or skip analysis steps.
- When unsure, use web search to find the latest documentation.
- Always verify changes compile/pass tests before marking a task done.
- Be transparent about what you're doing and why.

When you need to delegate a task, describe it clearly and specify:
- The exact files to modify
- The expected behavior change
- How to verify the change works

You have access to tools for filesystem operations, terminal commands, and web fetching.
Use them liberally — don't guess when you can look.`;

// ─── Kory Manager Class ─────────────────────────────────────────────────────

export interface KoryTask {
  id: string;
  description: string;
  domain: WorkerDomain;
  assignedModel: string;
  assignedProvider: ProviderName;
  status: "pending" | "active" | "done" | "failed";
  result?: string;
  error?: string;
}

export class KoryManager {
  private activeWorkers = new Map<string, { agent: AgentIdentity; status: AgentStatus; task: KoryTask; abort: AbortController }>();
  private tasks: KoryTask[] = [];

  constructor(
    private providers: ProviderRegistry,
    private tools: ToolRegistry,
    private workingDirectory: string,
  ) {}

  /** Process a user's request — the main entry point. */
  async processTask(sessionId: string, userMessage: string): Promise<void> {
    this.emitThought(sessionId, "analyzing", `Analyzing request: "${userMessage.slice(0, 100)}..."`);

    // Step 1: Classify the domain — try LLM first, fall back to keywords
    let domain: WorkerDomain;
    try {
      domain = await this.classifyDomainLLM(userMessage);
    } catch {
      domain = this.classifyDomainKeywords(userMessage);
    }
    this.emitRouting(sessionId, domain);

    // Step 2: Route to appropriate model
    this.emitThought(sessionId, "routing", `Domain: ${domain}. Selecting specialist...`);

    const routing = DOMAIN_MODEL_MAP[domain];
    const provider = this.providers.resolveProvider(routing.model, routing.provider);

    if (!provider) {
      // Fallback: try any available provider
      const fallback = this.providers.getAvailable()[0];
      if (!fallback) {
        this.emitError(sessionId, "No providers available. Add API keys in the Auth Hub.");
        return;
      }
      this.emitThought(sessionId, "routing", `Primary provider unavailable. Falling back to ${fallback.name}`);
      await this.executeWithProvider(sessionId, fallback, userMessage, domain);
      return;
    }

    await this.executeWithProvider(sessionId, provider, userMessage, domain);
  }

  /** LLM-based domain classification — more accurate than keywords. */
  private async classifyDomainLLM(message: string): Promise<WorkerDomain> {
    const classifier = this.providers.getAvailable()[0];
    if (!classifier) throw new Error("No provider for classification");

    const classifyPrompt = `Classify this task into exactly ONE domain. Reply with only the domain name, nothing else.

Domains:
- ui: Frontend, UI components, CSS, Svelte, React, design, styling, animations, layouts
- backend: C++, systems programming, servers, APIs, databases, performance, audio/DSP, compilation
- test: Writing tests, running tests, test frameworks, coverage, assertions
- review: Code review, auditing, checking for bugs, security analysis
- general: Refactoring, documentation, config, general programming, anything else

Task: "${message.slice(0, 500)}"

Domain:`;

    let result = "";
    for await (const event of classifier.streamResponse({
      model: classifier.listModels()[0]?.id ?? "",
      systemPrompt: "You are a task classifier. Reply with exactly one word: ui, backend, test, review, or general.",
      messages: [{ role: "user", content: classifyPrompt }],
      maxTokens: 10,
    })) {
      if (event.type === "content_delta") result += event.content ?? "";
    }

    const domain = result.trim().toLowerCase() as WorkerDomain;
    if (["ui", "backend", "test", "review", "general"].includes(domain)) {
      return domain;
    }
    return "general";
  }

  private async executeWithProvider(
    sessionId: string,
    provider: ReturnType<ProviderRegistry["get"]>,
    userMessage: string,
    domain: WorkerDomain,
  ) {
    if (!provider) return;

    const workerId = `worker-${nanoid(8)}`;
    const workerAbort = new AbortController();
    const workerIdentity: AgentIdentity = {
      id: workerId,
      name: `${domain.charAt(0).toUpperCase() + domain.slice(1)} Worker`,
      role: "coder",
      model: provider.listModels()[0]?.id ?? "unknown",
      provider: provider.name,
      domain,
      glowColor: DOMAIN_GLOW[domain],
    };

    this.emitWSMessage(sessionId, "agent.spawned", {
      agent: workerIdentity,
      task: userMessage,
    });

    this.activeWorkers.set(workerId, {
      agent: workerIdentity,
      status: "thinking",
      task: {
        id: workerId,
        description: userMessage,
        domain,
        assignedModel: workerIdentity.model,
        assignedProvider: provider.name,
        status: "active",
      },
      abort: workerAbort,
    });

    this.emitWSMessage(sessionId, "agent.status", {
      agentId: workerId,
      status: "thinking",
    });

    // Load context files (.cursorrules, CLAUDE.md, AGENTS.md etc.)
    const contextPreamble = await this.loadContextFiles();

    const toolDefs = this.tools.getToolDefs();
    const ctx: ToolContext = {
      sessionId,
      workingDirectory: this.workingDirectory,
      signal: workerAbort.signal,
      emitFileEdit: (event) => {
        this.emitWSMessage(sessionId, "stream.file_delta", {
          agentId: workerId,
          path: event.path,
          delta: event.delta,
          totalLength: event.totalLength,
          operation: event.operation,
        });
      },
      emitFileComplete: (event) => {
        this.emitWSMessage(sessionId, "stream.file_complete", {
          agentId: workerId,
          path: event.path,
          totalLines: event.totalLines,
          operation: event.operation,
        });
      },
    };

    // Build conversation history for multi-turn
    const messages: Array<{ role: "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[] }> = [
      { role: "user", content: userMessage },
    ];

    const systemPrompt = contextPreamble
      ? `${KORY_SYSTEM_PROMPT}\n\n--- Project Context ---\n${contextPreamble}`
      : KORY_SYSTEM_PROMPT;

    const MAX_TURNS = 25; // Safety limit to prevent infinite loops
    let turnCount = 0;

    try {
      while (turnCount < MAX_TURNS) {
        turnCount++;

        const request: StreamRequest = {
          model: workerIdentity.model,
          systemPrompt,
          messages: messages.map((m) => ({
            role: m.role === "tool" ? "user" as const : m.role,
            content: m.content,
          })),
          tools: toolDefs,
          maxTokens: 16_384,
          signal: workerAbort.signal,
        };

        let pendingToolCalls = new Map<string, { name: string; input: string }>();
        let assistantContent = "";
        let finishReason: string | undefined;
        let hasToolCalls = false;
        const completedToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        for await (const event of provider.streamResponse(request)) {
          switch (event.type) {
            case "content_delta":
              assistantContent += event.content ?? "";
              this.emitWSMessage(sessionId, "stream.delta", {
                agentId: workerId,
                content: event.content,
                model: workerIdentity.model,
              });
              break;

            case "thinking_delta":
              this.emitWSMessage(sessionId, "stream.thinking", {
                agentId: workerId,
                thinking: event.thinking,
              });
              break;

            case "tool_use_start":
              hasToolCalls = true;
              this.emitWSMessage(sessionId, "agent.status", {
                agentId: workerId,
                status: "tool_calling",
                detail: event.toolName,
              });
              pendingToolCalls.set(event.toolCallId!, { name: event.toolName!, input: "" });
              this.emitWSMessage(sessionId, "stream.tool_call", {
                agentId: workerId,
                toolCall: { id: event.toolCallId, name: event.toolName, input: {} },
              });
              break;

            case "tool_use_delta":
              const tc = pendingToolCalls.get(event.toolCallId!);
              if (tc) tc.input += event.toolInput ?? "";
              break;

            case "tool_use_stop": {
              const call = pendingToolCalls.get(event.toolCallId!);
              if (call) {
                let parsedInput: Record<string, unknown> = {};
                try {
                  parsedInput = JSON.parse(call.input || event.toolInput || "{}");
                } catch {}

                completedToolCalls.push({
                  id: event.toolCallId!,
                  name: call.name,
                  input: parsedInput,
                });

                pendingToolCalls.delete(event.toolCallId!);
              }
              break;
            }

            case "usage_update":
              if (event.tokensIn || event.tokensOut) {
                this.emitWSMessage(sessionId, "stream.usage", {
                  agentId: workerId,
                  usage: { tokensIn: event.tokensIn ?? 0, tokensOut: event.tokensOut ?? 0 },
                });
              }
              break;

            case "complete":
              finishReason = event.finishReason;
              break;

            case "error":
              this.emitWSMessage(sessionId, "agent.error", {
                agentId: workerId,
                error: event.error,
              });
              break;
          }
        }

        // Add assistant message to history
        messages.push({
          role: "assistant",
          content: assistantContent,
          tool_calls: completedToolCalls.length > 0
            ? completedToolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: { name: tc.name, arguments: JSON.stringify(tc.input) },
              }))
            : undefined,
        });

        // If we have tool calls, execute them and feed results back
        if (hasToolCalls && completedToolCalls.length > 0) {
          this.emitWSMessage(sessionId, "agent.status", {
            agentId: workerId,
            status: "tool_calling",
            detail: `Executing ${completedToolCalls.length} tool(s)...`,
          });

          for (const toolCall of completedToolCalls) {
            const toolInput: ToolCallInput = {
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.input,
            };

            const result = await this.tools.execute(ctx, toolInput);

            this.emitWSMessage(sessionId, "stream.tool_result", {
              agentId: workerId,
              toolResult: result,
            });

            // Add tool result to conversation for next turn
            messages.push({
              role: "tool",
              content: JSON.stringify({
                tool_call_id: toolCall.id,
                name: toolCall.name,
                output: result.output,
                isError: result.isError,
              }),
              tool_call_id: toolCall.id,
            });
          }

          // Update status and continue the loop
          this.emitWSMessage(sessionId, "agent.status", {
            agentId: workerId,
            status: "thinking",
            detail: `Turn ${turnCount}: Processing tool results...`,
          });

          continue; // Go to next turn
        }

        // No tool calls — we're done
        this.emitWSMessage(sessionId, "agent.status", {
          agentId: workerId,
          status: "done",
        });
        this.emitWSMessage(sessionId, "stream.complete", {
          agentId: workerId,
          finishReason: finishReason ?? "end_turn",
          totalTurns: turnCount,
        });
        break;
      }

      if (turnCount >= MAX_TURNS) {
        this.emitWSMessage(sessionId, "agent.status", {
          agentId: workerId,
          status: "done",
          detail: "Reached maximum turn limit",
        });
        this.emitWSMessage(sessionId, "stream.complete", {
          agentId: workerId,
          finishReason: "max_turns",
          totalTurns: turnCount,
        });
      }
    } catch (err: any) {
      this.emitWSMessage(sessionId, "agent.error", {
        agentId: workerId,
        error: err.message ?? String(err),
      });
    }

    this.activeWorkers.delete(workerId);
  }

  /** Load context files from the working directory (.cursorrules, CLAUDE.md, etc.) */
  private async loadContextFiles(): Promise<string> {
    const CONTEXT_FILES = [
      ".cursorrules",
      "CLAUDE.md",
      "AGENTS.md",
      "CONVENTIONS.md",
      ".opencode.json",
      ".github/copilot-instructions.md",
    ];

    const parts: string[] = [];
    for (const filename of CONTEXT_FILES) {
      try {
        const filepath = `${this.workingDirectory}/${filename}`;
        const file = Bun.file(filepath);
        if (await file.exists()) {
          const content = await file.text();
          if (content.trim()) {
            parts.push(`## ${filename}\n${content.trim()}`);
          }
        }
      } catch {}
    }
    return parts.join("\n\n");
  }

  /** Classify the domain of a user request based on keyword analysis. */
  classifyDomainKeywords(message: string): WorkerDomain {
    const lower = message.toLowerCase();
    const scores: Record<WorkerDomain, number> = { ui: 0, backend: 0, general: 0, review: 0, test: 0 };

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          scores[domain as WorkerDomain]++;
        }
      }
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return sorted[0][1] > 0 ? (sorted[0][0] as WorkerDomain) : "general";
  }

  /** Get status of all active workers. */
  getStatus(): Array<{ agent: AgentIdentity; status: AgentStatus; task: string }> {
    return [...this.activeWorkers.values()].map((w) => ({
      agent: w.agent,
      status: w.status,
      task: w.task.description,
    }));
  }

  /** Cancel all active work. */
  cancel() {
    for (const [id, worker] of this.activeWorkers) {
      worker.abort.abort();
    }
    this.activeWorkers.clear();
  }

  /** Cancel a specific worker. */
  cancelWorker(workerId: string) {
    const worker = this.activeWorkers.get(workerId);
    if (worker) {
      worker.abort.abort();
      this.activeWorkers.delete(workerId);
    }
  }

  // ─── Event Emission Helpers ─────────────────────────────────────────────

  private emitThought(sessionId: string, phase: string, thought: string) {
    this.emitWSMessage(sessionId, "kory.thought", { thought, phase });
  }

  private emitRouting(sessionId: string, domain: WorkerDomain) {
    const routing = DOMAIN_MODEL_MAP[domain];
    this.emitWSMessage(sessionId, "kory.routing", {
      domain,
      selectedModel: routing.model,
      selectedProvider: routing.provider,
      reasoning: `Classified as ${domain} task. Routing to ${routing.model} via ${routing.provider}.`,
    });
  }

  private emitError(sessionId: string, error: string) {
    this.emitWSMessage(sessionId, "system.error", { error });
  }

  private emitWSMessage(sessionId: string, type: string, payload: unknown) {
    wsBroker.publish("custom", {
      type: type as any,
      payload,
      timestamp: Date.now(),
      sessionId,
      agentId: KORY_IDENTITY.id,
    });
  }
}
