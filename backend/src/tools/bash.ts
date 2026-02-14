// Bash tool — execute shell commands with streaming output.
// Ported from OpenCode's tools/bash.go. Uses Bun's spawn for process execution.

import type { Tool, ToolContext, ToolCallInput, ToolCallOutput } from "./registry";

const MAX_OUTPUT_BYTES = 512_000; // 512KB output limit per command

export class BashTool implements Tool {
  readonly name = "bash";
  readonly description = `Execute a shell command on the system. Use this to run terminal commands, build projects, run tests, install packages, or interact with the filesystem via CLI tools.

Guidelines:
- Always specify the working directory if the command depends on it.
- Use non-interactive flags where available.
- Prefer commands that produce structured output (JSON, etc.) when possible.
- For long-running commands, the output will be truncated at ${MAX_OUTPUT_BYTES} bytes.
- Commands run with the user's full shell environment and PATH.`;

  readonly inputSchema = {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute.",
      },
      workingDirectory: {
        type: "string",
        description: "Working directory for the command. Defaults to the session working directory.",
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds. Defaults to 120.",
      },
    },
    required: ["command"],
  };

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolCallOutput> {
    const { command, workingDirectory, timeout } = call.input as {
      command: string;
      workingDirectory?: string;
      timeout?: number;
    };

    const cwd = workingDirectory ?? ctx.workingDirectory;
    const timeoutMs = (timeout ?? 120) * 1000;

    try {
      const proc = Bun.spawn(["bash", "-c", command], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          proc.kill();
          reject(new Error(`Command timed out after ${timeout ?? 120}s`));
        }, timeoutMs),
      );

      const outputPromise = (async () => {
        const stdoutChunks: Uint8Array[] = [];
        const stderrChunks: Uint8Array[] = [];
        let totalBytes = 0;

        const stdoutReader = proc.stdout.getReader();
        const stderrReader = proc.stderr.getReader();

        // Read stdout
        const readStream = async (reader: ReadableStreamDefaultReader<Uint8Array>, chunks: Uint8Array[]) => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (totalBytes < MAX_OUTPUT_BYTES) {
              chunks.push(value);
              totalBytes += value.length;
            }
          }
        };

        await Promise.all([
          readStream(stdoutReader, stdoutChunks),
          readStream(stderrReader, stderrChunks),
        ]);

        const exitCode = await proc.exited;
        const decoder = new TextDecoder();
        const stdout = decoder.decode(Buffer.concat(stdoutChunks));
        const stderr = decoder.decode(Buffer.concat(stderrChunks));

        let output = "";
        if (stdout) output += stdout;
        if (stderr) output += (output ? "\n--- stderr ---\n" : "") + stderr;
        if (!output) output = `(no output, exit code: ${exitCode})`;

        if (totalBytes >= MAX_OUTPUT_BYTES) {
          output += `\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]`;
        }

        return {
          callId: call.id,
          name: this.name,
          output: `Exit code: ${exitCode}\n${output}`,
          isError: exitCode !== 0,
          durationMs: 0,
        };
      })();

      return await Promise.race([outputPromise, timeoutPromise]);
    } catch (err: any) {
      return {
        callId: call.id,
        name: this.name,
        output: `Execution error: ${err.message}`,
        isError: true,
        durationMs: 0,
      };
    }
  }
}
