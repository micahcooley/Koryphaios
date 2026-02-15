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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

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
  ui: { model: "gpt-5.3-codex", provider: "codex" },
  backend: { model: "gemini-2.5-pro-preview-04-17", provider: "google" },
  general: { model: "gpt-4.1", provider: "copilot" },
  review: { model: "gpt-4.1", provider: "copilot" },
  test: { model: "gpt-4.1", provider: "copilot" },
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
  model: "gpt-4.1",
  provider: "copilot",
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

const WORKER_SYSTEM_PROMPT = `You are a specialist Worker Agent in the Koryphaios development workspace.
Your role is to EXECUTE the specific task assigned to you by the Manager.

OPERATIONAL GUIDELINES:
1. STAY FOCUSED: Only perform the task described. Do not try to orchestrate or delegate.
2. BE AUTONOMOUS: Use your tools (ls, read_file, edit_file, bash, etc.) to gather context and perform the work without asking for permission for every step.
3. QUALITY FIRST: Write clean, idiomatic code that follows project conventions.
4. VERIFY: Always check your work. If you make a change, use tools to verify it.
5. REPORT: When finished, provide a concise summary of what you accomplished.

You have full filesystem access and a powerful terminal. If you need to understand the project, start by listing files and reading core documentation.`;

// ─── Context Compaction Config ──────────────────────────────────────────────

const COMPACT_THRESHOLD_RATIO = 0.75; // Compact when context is 75% full
const MANAGER_MEMORY_DIR = ".koryphaios/memory";

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
  private memoryDir: string;
  private isProcessing = false;

  constructor(
    private providers: ProviderRegistry,
    private tools: ToolRegistry,
    private workingDirectory: string,
    private sessions?: any,
    private messages?: any,
  ) {
    this.memoryDir = join(workingDirectory, MANAGER_MEMORY_DIR);
    mkdirSync(this.memoryDir, { recursive: true });
  }

  /** Process a user's request — the main entry point. */
  async processTask(sessionId: string, userMessage: string, preferredModel?: string, reasoningLevel?: string): Promise<void> {
    this.isProcessing = true;
    const isAutoMode = !preferredModel || preferredModel === "auto";

    try {
      this.emitThought(sessionId, "analyzing", `Analyzing request: "${userMessage.slice(0, 100)}..."`);

      // Always route to worker for now (classifier has auth issues)
      await this.routeToWorker(sessionId, userMessage, preferredModel, reasoningLevel);
    } catch (err) {
      this.emitError(sessionId, `Error: ${String(err)}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /** Route task to an appropriate worker, with retry/reroute logic for Auto mode. */
  private async routeToWorker(sessionId: string, userMessage: string, preferredModel?: string, reasoningLevel?: string): Promise<void> {
    const isAutoMode = !preferredModel || preferredModel === "auto";
    
    // Step 2: Classify the domain
    let domain: WorkerDomain;
    try {
      domain = await this.classifyDomainLLM(userMessage);
    } catch (err) {
      domain = this.classifyDomainKeywords(userMessage);
    }
    
    // Generate specific instruction for the worker
    const workerTask = await this.generateWorkerTask(sessionId, userMessage, domain);
    this.emitThought(sessionId, "delegating", `Delegating to specialist: ${workerTask.slice(0, 100)}...`);

    if (isAutoMode) {
      // In Auto mode, try available providers in order of preference
      const availableProviders = this.providers.getAvailable();
      const primaryRouting = DOMAIN_MODEL_MAP[domain];
      
      // Sort providers to put the primary one first
      const sortedProviders = [...availableProviders].sort((a, b) => {
        if (a.name === primaryRouting.provider) return -1;
        if (b.name === primaryRouting.provider) return 1;
        return 0;
      });

      for (const provider of sortedProviders) {
        this.emitRouting(sessionId, domain, provider.listModels()[0]?.id, provider.name);
        const result = await this.executeWithProvider(sessionId, provider, workerTask, domain, reasoningLevel);
        
        if (result.success) return;
        
        if (this.providers.isQuotaError(result.error)) {
          this.emitThought(sessionId, "routing", `${provider.name} quota exceeded. Rerouting...`);
          continue; // Try next provider
        } else {
          // Other error, report and stop
          this.emitError(sessionId, `Worker Error (${provider.name}): ${result.error}`);
          return;
        }
      }
      
      this.emitError(sessionId, "All available providers failed or hit quota limits.");
    } else {
      // Specific model selected - no rerouting
      const [providerName, modelId] = preferredModel!.split(":");
      const provider = this.providers.resolveProvider(modelId, providerName as ProviderName);

      if (!provider) {
        this.emitError(sessionId, `Requested provider/model not available: ${preferredModel}`);
        return;
      }

      this.emitRouting(sessionId, domain, modelId, provider.name);
      const result = await this.executeWithProvider(sessionId, provider, workerTask, domain, reasoningLevel);
      if (!result.success) {
        this.emitError(sessionId, `Worker Error (${provider.name}): ${result.error}`);
      }
    }
  }

  /** Decide if a task requires a specialist worker. */
  private async decideIfNeedsWorker(sessionId: string, message: string): Promise<boolean> {
    // Try to use classifier, but if it's not properly authenticated, default to worker routing
    // This avoids deadlocks with partially configured providers
    try {
      const available = this.providers.getAvailable();
      if (available.length === 0) return true;
      
      // Skip Google/Gemini for now due to auth issues, prefer Codex  or Copilot
      const classifier = available.find(p => p.name === "codex" || p.name === "copilot") || available[0];
      
      const history = this.loadHistory(sessionId);
      const historyText = history.map(m => `[${m.role}]: ${m.content}`).join("\n");

      const prompt = `Decide if this user request requires a specialist "Worker" agent or if it can be handled by a "Manager" directly.
    
Workers are for: Writing code, implementing features, fixing bugs, running tests, complex refactoring.
Manager is for: High-level analysis, answering questions ("what do you think"), explaining code, planning, reading files for context, status updates.

History:
${historyText}

Request: "${message.slice(0, 500)}"

Decision:`;

      let result = "";
      // Add timeout to prevent hanging streams
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("Classifier timeout")), 5000)
      );
      
      const streamPromise = (async () => {
        let acc = "";
        for await (const event of classifier.streamResponse({
          model: classifier.listModels()[0]?.id ?? "",
          systemPrompt: "You are a task orchestrator. Decide if a sub-agent is needed. Prefer MANAGER for analysis/questions. Reply ONLY with WORKER or MANAGER.",
          messages: [{ role: "user", content: prompt }],
          maxTokens: 5,
        })) {
          if (event.type === "content_delta") acc += event.content ?? "";
        }
        return acc;
      })();

      result = await Promise.race([streamPromise, timeoutPromise]);
      return result.trim().toUpperCase() === "WORKER";
    } catch (err) {
      // On any error, default to worker routing to unblock Kory
      console.log("[KORY] Classifier failed, defaulting to worker:", String(err));
      return true;
    }
  }

  /** Handle simple tasks directly within the manager context. */
  private async handleDirectly(sessionId: string, userMessage: string, reasoningLevel?: string): Promise<{ success: boolean; error?: string }> {
    let provider = this.providers.resolveProvider(KORY_IDENTITY.model, KORY_IDENTITY.provider);
    
    // Fallback to first available provider if Kory's preferred is unavailable
    if (!provider) {
      const available = this.providers.getAvailable();
      if (available.length === 0) {
        return { success: false, error: "No authenticated providers available" };
      }
      provider = available[0];
    }

    // Manager status updates
    this.emitWSMessage(sessionId, "agent.status", {
      agentId: KORY_IDENTITY.id,
      status: "thinking",
    });

    const contextPreamble = await this.loadContextFiles();
    const toolDefs = this.tools.getToolDefs();
    const ctx: ToolContext = {
      sessionId,
      workingDirectory: this.workingDirectory,
      emitFileEdit: (event) => {
        this.emitWSMessage(sessionId, "stream.file_delta", {
          agentId: KORY_IDENTITY.id,
          path: event.path,
          delta: event.delta,
          totalLength: event.totalLength,
          operation: event.operation,
        });
      },
      emitFileComplete: (event) => {
        this.emitWSMessage(sessionId, "stream.file_complete", {
          agentId: KORY_IDENTITY.id,
          path: event.path,
          totalLines: event.totalLines,
          operation: event.operation,
        });
      },
    };

    const history = this.loadHistory(sessionId);
    const messages: Array<{ role: "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[] }> = [
      ...history,
      { role: "user", content: userMessage },
    ];

    const systemPrompt = contextPreamble 
      ? `${KORY_SYSTEM_PROMPT}\n\n--- Project Context ---\n${contextPreamble}`
      : KORY_SYSTEM_PROMPT;

    const MAX_TURNS = 5; // Direct tasks should be quick
    let turnCount = 0;

    try {
      while (turnCount < MAX_TURNS) {
        turnCount++;

        const request: StreamRequest = {
          model: KORY_IDENTITY.model,
          systemPrompt,
          messages: messages.map((m) => ({
            role: m.role === "tool" ? "user" as const : m.role,
            content: m.content,
          })),
          tools: toolDefs,
          maxTokens: 4096,
          reasoningLevel,
        };

        let assistantContent = "";
        let pendingToolCalls = new Map<string, { name: string; input: string }>();
        const completedToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
        let hasToolCalls = false;

        for await (const event of provider.streamResponse(request)) {
          switch (event.type) {
            case "content_delta":
              assistantContent += event.content ?? "";
              this.emitWSMessage(sessionId, "stream.delta", {
                agentId: KORY_IDENTITY.id,
                content: event.content,
                model: KORY_IDENTITY.model,
              });
              break;

            case "thinking_delta":
              this.emitWSMessage(sessionId, "stream.thinking", {
                agentId: KORY_IDENTITY.id,
                thinking: event.thinking,
              });
              break;

            case "tool_use_start":
              hasToolCalls = true;
              this.emitWSMessage(sessionId, "agent.status", {
                agentId: KORY_IDENTITY.id,
                status: "tool_calling",
                detail: event.toolName,
              });
              pendingToolCalls.set(event.toolCallId!, { name: event.toolName!, input: "" });
              this.emitWSMessage(sessionId, "stream.tool_call", {
                agentId: KORY_IDENTITY.id,
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
                } catch { }

                completedToolCalls.push({
                  id: event.toolCallId!,
                  name: call.name,
                  input: parsedInput,
                });
                pendingToolCalls.delete(event.toolCallId!);
              }
              break;
            }
            case "error":
              throw new Error(event.error);
          }
        }

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

        if (hasToolCalls && completedToolCalls.length > 0) {
          const toolPromises = completedToolCalls.map(async (toolCall) => {
            const result = await this.tools.execute(ctx, {
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.input,
            });

            this.emitWSMessage(sessionId, "stream.tool_result", {
              agentId: KORY_IDENTITY.id,
              toolResult: result,
            });

            return {
              role: "tool",
              content: JSON.stringify({
                tool_call_id: toolCall.id,
                name: toolCall.name,
                output: result.output,
                isError: result.isError,
              }),
              tool_call_id: toolCall.id,
            };
          });

          const toolResults = await Promise.all(toolPromises);
          messages.push(...(toolResults as any));
          continue; // Next turn for manager
        }

        // Finalize
        if (this.messages) {
          this.messages.add(sessionId, {
            id: nanoid(12),
            sessionId,
            role: "assistant",
            content: assistantContent,
            model: KORY_IDENTITY.model,
            provider: provider.name,
            createdAt: Date.now(),
          });
        }

        this.emitWSMessage(sessionId, "agent.status", {
          agentId: KORY_IDENTITY.id,
          status: "done",
        });
        break;
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message ?? String(err) };
    }
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
    
    // Wrap with timeout to avoid hanging
    try {
      const streamPromise = (async () => {
        for await (const event of classifier.streamResponse({
          model: classifier.listModels()[0]?.id ?? "",
          systemPrompt: "You are a task classifier. Reply with exactly one word: ui, backend, test, review, or general.",
          messages: [{ role: "user", content: classifyPrompt }],
          maxTokens: 10,
        })) {
          if (event.type === "content_delta") result += event.content ?? "";
        }
      })();
      
      const timeoutPromise = new Promise<void>((_, rej) => {
        setTimeout(() => rej(new Error("Classification timeout")), 5000);
      });
      
      await Promise.race([streamPromise, timeoutPromise]);
    } catch (err) {
      throw err;
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
    reasoningLevel?: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!provider) return { success: false, error: "No provider" };

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
    const history = this.loadHistory(sessionId);
    const messages: Array<{ role: "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[] }> = [
      ...history,
      { role: "user", content: userMessage },
    ];

    const systemPrompt = (() => {
      let prompt = WORKER_SYSTEM_PROMPT;
      if (contextPreamble) prompt += `\n\n--- Project Context ---\n${contextPreamble}`;
      // Inject manager memory if available
      const memory = this.loadMemory(sessionId);
      if (memory) prompt += `\n\n--- Manager Memory (from previous compactions) ---\n${memory.slice(-8000)}\n--- End Memory ---`;
      return prompt;
    })();

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
          reasoningLevel,
          signal: workerAbort.signal,
        };

        let pendingToolCalls = new Map<string, { name: string; input: string }>();
        let assistantContent = "";
        let finishReason: string | undefined;
        let hasToolCalls = false;
        const completedToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        // Wrap with timeout to prevent deadlock
        let streamIterator: AsyncIterable<ProviderEvent>;
        try {
          const streamPromise = Promise.resolve(provider.streamResponse(request));
          const timeoutPromise = new Promise<never>((_, rej) => {
            setTimeout(() => rej(new Error("Stream timeout after 30 seconds")), 30000);
          });
          streamIterator = await Promise.race([streamPromise, timeoutPromise]) as AsyncIterable<ProviderEvent>;
        } catch (err) {
          console.log(`[KORY] Stream setup failed for provider ${provider.name}: ${String(err)}`);
          this.emitError(sessionId, `Provider stream failed: ${String(err)}`);
          return { success: false, error: String(err) };
        }

        for await (const event of streamIterator) {
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
              const toolName = event.toolName!;
              let toolStatus: AgentStatus = "tool_calling";
              if (toolName === "read_file") {
                toolStatus = "reading";
              } else if (toolName === "write_file" || toolName === "edit_file") {
                toolStatus = "writing";
              }
              this.emitWSMessage(sessionId, "agent.status", {
                agentId: workerId,
                status: toolStatus,
                detail: toolName,
              });
              pendingToolCalls.set(event.toolCallId!, { name: toolName, input: "" });
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
                } catch { }

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
              throw new Error(event.error);
          }
        }

        // Add assistant message to history
        const assistantMsgId = nanoid(12);
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

        // Persist to store if available
        if (this.messages) {
          this.messages.add(sessionId, {
            id: assistantMsgId,
            sessionId,
            role: "assistant",
            content: assistantContent,
            model: workerIdentity.model,
            provider: provider.name,
            createdAt: Date.now(),
          });
        }

        // If we have tool calls, execute them and feed results back
        if (hasToolCalls && completedToolCalls.length > 0) {
          const firstTool = completedToolCalls[0].name;
          let execStatus: AgentStatus = "tool_calling";
          if (firstTool === "read_file") {
            execStatus = "reading";
          } else if (firstTool === "write_file" || firstTool === "edit_file") {
            execStatus = "writing";
          }
          this.emitWSMessage(sessionId, "agent.status", {
            agentId: workerId,
            status: execStatus,
            detail: `Executing ${completedToolCalls.length} tool(s)...`,
          });

          // Execute tools in parallel for maximum efficiency
          const toolPromises = completedToolCalls.map(async (toolCall) => {
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

            return {
              role: "tool",
              content: JSON.stringify({
                tool_call_id: toolCall.id,
                name: toolCall.name,
                output: result.output,
                isError: result.isError,
              }),
              tool_call_id: toolCall.id,
            };
          });

          const toolResults = await Promise.all(toolPromises);
          messages.push(...(toolResults as any));

          // Auto-compact if context is getting large
          const compacted = await this.autoCompact(
            sessionId,
            workerId,
            messages,
            128_000,
            false,
          );
          messages.length = 0;
          messages.push(...(compacted as typeof messages));

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
      
      this.activeWorkers.delete(workerId);
      return { success: true };
    } catch (err: any) {
      this.activeWorkers.delete(workerId);
      return { success: false, error: err.message ?? String(err) };
    }
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
      } catch { }
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

  /** Get status of all active agents (manager + workers). */
  getStatus(): Array<{ agent: AgentIdentity; status: AgentStatus; task: string }> {
    const list = [...this.activeWorkers.values()].map((w) => ({
      agent: w.agent,
      status: w.status,
      task: w.task.description,
    }));

    // Add manager if active
    list.push({
      agent: KORY_IDENTITY,
      status: this.getManagerInternalStatus(),
      task: "Orchestrating...",
    });

    return list;
  }

  private getManagerInternalStatus(): AgentStatus {
    return this.isProcessing ? "thinking" : "idle"; 
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

  private emitRouting(sessionId: string, domain: WorkerDomain, modelId?: string, providerName?: string) {
    const routing = DOMAIN_MODEL_MAP[domain];
    const m = modelId || routing.model;
    const p = providerName || routing.provider;
    
    this.emitWSMessage(sessionId, "kory.routing", {
      domain,
      selectedModel: m,
      selectedProvider: p,
      reasoning: `Routing to ${m} via ${p}.`,
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

  // ─── Auto-Compaction ──────────────────────────────────────────────────────

  /**
   * Check if conversation needs compaction and compact if so.
   * Returns the (possibly compacted) messages array.
   */
  private async autoCompact(
    sessionId: string,
    agentId: string,
    messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: any[] }>,
    contextWindow: number,
    isManager: boolean,
  ): Promise<typeof messages> {
    // Estimate token count (rough: 4 chars per token)
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    const estimatedTokens = totalChars / 4;
    const threshold = contextWindow * COMPACT_THRESHOLD_RATIO;

    if (estimatedTokens < threshold) return messages;

    // Emit compacting status
    this.emitWSMessage(sessionId, "agent.status", {
      agentId,
      status: "compacting",
      detail: `Context at ~${Math.round((estimatedTokens / contextWindow) * 100)}%, compacting...`,
    });

    // Get a compaction provider
    const compactor = this.providers.getAvailable()[0];
    if (!compactor) return messages; // Can't compact without a provider

    // Separate: keep first message (user request) and last 4 messages
    const keepFirst = messages.slice(0, 1);
    const keepLast = messages.slice(-4);
    const toCompact = messages.slice(1, -4);

    if (toCompact.length < 3) return messages; // Not enough to compact

    // Build summary request
    const compactContent = toCompact
      .map((m) => `[${m.role}]: ${m.content.slice(0, 2000)}`)
      .join("\n\n---\n\n");

    let summary = "";
    try {
      for await (const event of compactor.streamResponse({
        model: compactor.listModels()[0]?.id ?? "",
        systemPrompt: "Summarize this conversation history concisely. Preserve: file paths changed, tool results, key decisions, errors encountered, and current task status. Be thorough but brief.",
        messages: [{ role: "user", content: `Summarize this agent conversation for context preservation:\n\n${compactContent}` }],
        maxTokens: 2048,
      })) {
        if (event.type === "content_delta") summary += event.content ?? "";
      }
    } catch {
      return messages; // Failed to compact, keep original
    }

    // For manager: also save to memory file
    if (isManager) {
      await this.saveToMemory(sessionId, summary, keepFirst[0]?.content ?? "");
    }

    // Rebuild messages with compacted summary
    const compacted = [
      ...keepFirst,
      { role: "assistant" as const, content: `[COMPACTED CONTEXT]\n${summary}\n[END COMPACTED CONTEXT]` },
      ...keepLast,
    ];

    this.emitWSMessage(sessionId, "agent.status", {
      agentId,
      status: "thinking",
      detail: `Context compacted: ${messages.length} → ${compacted.length} messages`,
    });

    return compacted;
  }

  // ─── Manager Memory Files ────────────────────────────────────────────────

  /** Save important context to a memory file for the manager to recover from */
  private async saveToMemory(sessionId: string, summary: string, originalTask: string): Promise<void> {
    const memFile = join(this.memoryDir, `${sessionId}.md`);
    const timestamp = new Date().toISOString();

    let existing = "";
    if (existsSync(memFile)) {
      existing = readFileSync(memFile, "utf-8");
    }

    const entry = `\n## Memory Update — ${timestamp}\n\n**Original Task:** ${originalTask.slice(0, 200)}\n\n**Context Summary:**\n${summary}\n\n---\n`;

    writeFileSync(memFile, existing + entry, "utf-8");
  }

  /** Generate a specific task instruction for a worker based on user request and history. */
  private async generateWorkerTask(sessionId: string, message: string, domain: WorkerDomain): Promise<string> {
    const classifier = this.providers.getAvailable()[0];
    if (!classifier) return message;

    const history = this.loadHistory(sessionId);
    const historyText = history.map(m => `[${m.role}]: ${m.content}`).join("\n");

    const prompt = `You are the Manager. Transform this user request into a specific, high-quality instruction for a ${domain} worker agent.
    
The worker has access to filesystem tools and a terminal. Be concrete about what they should look at or do.

History:
${historyText}

User Request: "${message}"

Worker Instruction:`;

    let result = "";
    for await (const event of classifier.streamResponse({
      model: classifier.listModels()[0]?.id ?? "",
      systemPrompt: "You are an AI Manager. Be brief and actionable.",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 200,
    })) {
      if (event.type === "content_delta") result += event.content ?? "";
    }

    return result.trim() || message;
  }

  /** Load manager memory for a session if it exists */
  private loadMemory(sessionId: string): string {
    const memFile = join(this.memoryDir, `${sessionId}.md`);
    if (existsSync(memFile)) {
      try {
        return readFileSync(memFile, "utf-8");
      } catch {
        return "";
      }
    }
    return "";
  }

  /** Load recent message history for context. */
  private loadHistory(sessionId: string): Array<{ role: "user" | "assistant"; content: string }> {
    if (!this.messages) return [];
    
    // Get last 10 messages for immediate context
    const recent = this.messages.getRecent(sessionId, 10);
    return recent.map((m: any) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));
  }
}
