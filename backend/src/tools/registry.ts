// Tool system — abstract base and registry.
// Ported from OpenCode's tools/tools.go pattern.

export interface ToolContext {
  sessionId: string;
  workingDirectory: string;
  signal?: AbortSignal;
  /** Optional callback for streaming file edit deltas to the UI */
  emitFileEdit?: (event: { path: string; delta: string; totalLength: number; operation: "create" | "edit" }) => void;
  emitFileComplete?: (event: { path: string; totalLines: number; operation: "create" | "edit" }) => void;
}

export interface ToolCallInput {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolCallOutput {
  callId: string;
  name: string;
  output: string;
  isError: boolean;
  durationMs: number;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;

  /** Execute the tool with the given input. */
  run(ctx: ToolContext, call: ToolCallInput): Promise<ToolCallOutput>;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return [...this.tools.values()];
  }

  /** Get tool definitions formatted for LLM provider calls. */
  getToolDefs() {
    return this.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async execute(ctx: ToolContext, call: ToolCallInput): Promise<ToolCallOutput> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return {
        callId: call.id,
        name: call.name,
        output: `Unknown tool: ${call.name}`,
        isError: true,
        durationMs: 0,
      };
    }

    const start = performance.now();
    try {
      const result = await tool.run(ctx, call);
      result.durationMs = performance.now() - start;
      return result;
    } catch (err: any) {
      return {
        callId: call.id,
        name: call.name,
        output: `Tool error: ${err.message ?? String(err)}`,
        isError: true,
        durationMs: performance.now() - start,
      };
    }
  }
}
