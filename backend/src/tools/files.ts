// File tools — read, write, edit, list, grep, glob.
// Ported from OpenCode's tools/file.go, view.go, write.go, edit.go, grep.go, glob.go, ls.go.

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from "fs";
import { join, relative, dirname } from "path";
import type { Tool, ToolContext, ToolCallInput, ToolCallOutput } from "./registry";

// ─── Read File ──────────────────────────────────────────────────────────────

export class ReadFileTool implements Tool {
  readonly name = "read_file";
  readonly description = `Read the contents of a file. Returns the file content with line numbers. Use this to examine source code, configuration files, or any text file.`;

  readonly inputSchema = {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to the file." },
      startLine: { type: "number", description: "Start line number (1-indexed). Optional." },
      endLine: { type: "number", description: "End line number (1-indexed, inclusive). Optional." },
    },
    required: ["path"],
  };

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolCallOutput> {
    const { path: filePath, startLine, endLine } = call.input as {
      path: string;
      startLine?: number;
      endLine?: number;
    };

    const absPath = filePath.startsWith("/") ? filePath : join(ctx.workingDirectory, filePath);

    if (!existsSync(absPath)) {
      return { callId: call.id, name: this.name, output: `File not found: ${absPath}`, isError: true, durationMs: 0 };
    }

    try {
      const content = readFileSync(absPath, "utf-8");
      let lines = content.split("\n");

      if (startLine !== undefined || endLine !== undefined) {
        const start = (startLine ?? 1) - 1;
        const end = endLine ?? lines.length;
        lines = lines.slice(start, end);
        const numbered = lines.map((l, i) => `${start + i + 1}. ${l}`).join("\n");
        return { callId: call.id, name: this.name, output: numbered, isError: false, durationMs: 0 };
      }

      const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
      return { callId: call.id, name: this.name, output: numbered, isError: false, durationMs: 0 };
    } catch (err: any) {
      return { callId: call.id, name: this.name, output: `Error reading file: ${err.message}`, isError: true, durationMs: 0 };
    }
  }
}

// ─── Write File ─────────────────────────────────────────────────────────────

export class WriteFileTool implements Tool {
  readonly name = "write_file";
  readonly description = `Create a new file or overwrite an existing file with the provided content. Creates parent directories if they don't exist.`;

  readonly inputSchema = {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to write." },
      content: { type: "string", description: "The full content to write to the file." },
    },
    required: ["path", "content"],
  };

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolCallOutput> {
    const { path: filePath, content } = call.input as { path: string; content: string };
    const absPath = filePath.startsWith("/") ? filePath : join(ctx.workingDirectory, filePath);

    try {
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content, "utf-8");
      const lines = content.split("\n").length;
      return {
        callId: call.id,
        name: this.name,
        output: `Wrote ${lines} lines to ${absPath}`,
        isError: false,
        durationMs: 0,
      };
    } catch (err: any) {
      return { callId: call.id, name: this.name, output: `Error writing file: ${err.message}`, isError: true, durationMs: 0 };
    }
  }
}

// ─── Edit File (string replacement) ─────────────────────────────────────────

export class EditFileTool implements Tool {
  readonly name = "edit_file";
  readonly description = `Edit an existing file by replacing a specific string with new content. The old_str must match exactly one location in the file. Include enough context to make the match unique.`;

  readonly inputSchema = {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to edit." },
      old_str: { type: "string", description: "The exact string to find and replace." },
      new_str: { type: "string", description: "The replacement string." },
    },
    required: ["path", "old_str", "new_str"],
  };

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolCallOutput> {
    const { path: filePath, old_str, new_str } = call.input as {
      path: string;
      old_str: string;
      new_str: string;
    };
    const absPath = filePath.startsWith("/") ? filePath : join(ctx.workingDirectory, filePath);

    if (!existsSync(absPath)) {
      return { callId: call.id, name: this.name, output: `File not found: ${absPath}`, isError: true, durationMs: 0 };
    }

    try {
      const content = readFileSync(absPath, "utf-8");
      const occurrences = content.split(old_str).length - 1;

      if (occurrences === 0) {
        return { callId: call.id, name: this.name, output: `old_str not found in ${absPath}`, isError: true, durationMs: 0 };
      }
      if (occurrences > 1) {
        return {
          callId: call.id,
          name: this.name,
          output: `old_str found ${occurrences} times in ${absPath}. Must be unique. Add more context.`,
          isError: true,
          durationMs: 0,
        };
      }

      const newContent = content.replace(old_str, new_str);
      writeFileSync(absPath, newContent, "utf-8");

      return {
        callId: call.id,
        name: this.name,
        output: `Edited ${absPath}: replaced 1 occurrence`,
        isError: false,
        durationMs: 0,
      };
    } catch (err: any) {
      return { callId: call.id, name: this.name, output: `Error editing file: ${err.message}`, isError: true, durationMs: 0 };
    }
  }
}

// ─── Grep (ripgrep wrapper) ─────────────────────────────────────────────────

export class GrepTool implements Tool {
  readonly name = "grep";
  readonly description = `Search for a pattern in file contents using ripgrep (rg). Returns matching file paths and lines. Fast parallel search across large codebases.`;

  readonly inputSchema = {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for." },
      path: { type: "string", description: "Directory or file to search in. Defaults to working directory." },
      glob: { type: "string", description: "File glob to filter (e.g., '*.ts', '*.cpp')." },
      contextLines: { type: "number", description: "Lines of context around matches." },
      caseSensitive: { type: "boolean", description: "Case-sensitive search. Default: true." },
      maxResults: { type: "number", description: "Maximum number of results. Default: 50." },
    },
    required: ["pattern"],
  };

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolCallOutput> {
    const { pattern, path, glob, contextLines, caseSensitive, maxResults } = call.input as {
      pattern: string;
      path?: string;
      glob?: string;
      contextLines?: number;
      caseSensitive?: boolean;
      maxResults?: number;
    };

    const searchPath = path ?? ctx.workingDirectory;
    const args = ["rg", "--no-heading", "--line-number", "--color", "never"];
    if (caseSensitive === false) args.push("-i");
    if (contextLines) args.push(`-C`, String(contextLines));
    if (glob) args.push(`-g`, glob);
    args.push(`-m`, String(maxResults ?? 50));
    args.push(pattern, searchPath);

    try {
      const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode === 1 && !stdout) {
        return { callId: call.id, name: this.name, output: "No matches found.", isError: false, durationMs: 0 };
      }
      if (exitCode > 1) {
        return { callId: call.id, name: this.name, output: `rg error: ${stderr}`, isError: true, durationMs: 0 };
      }

      return { callId: call.id, name: this.name, output: stdout.trim(), isError: false, durationMs: 0 };
    } catch {
      return { callId: call.id, name: this.name, output: "ripgrep (rg) not found. Install with: apt install ripgrep", isError: true, durationMs: 0 };
    }
  }
}

// ─── Glob ───────────────────────────────────────────────────────────────────

export class GlobTool implements Tool {
  readonly name = "glob";
  readonly description = `Find files matching a glob pattern. Returns file paths relative to the working directory.`;

  readonly inputSchema = {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern (e.g., '**/*.ts', 'src/**/*.svelte')." },
      path: { type: "string", description: "Base directory. Defaults to working directory." },
    },
    required: ["pattern"],
  };

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolCallOutput> {
    const { pattern, path: basePath } = call.input as { pattern: string; path?: string };
    const cwd = basePath ?? ctx.workingDirectory;

    try {
      const glob = new Bun.Glob(pattern);
      const matches: string[] = [];
      for await (const match of glob.scan({ cwd, onlyFiles: true })) {
        matches.push(match);
        if (matches.length >= 500) break;
      }

      if (matches.length === 0) {
        return { callId: call.id, name: this.name, output: "No files matched.", isError: false, durationMs: 0 };
      }

      return {
        callId: call.id,
        name: this.name,
        output: matches.join("\n") + (matches.length >= 500 ? "\n[truncated at 500 results]" : ""),
        isError: false,
        durationMs: 0,
      };
    } catch (err: any) {
      return { callId: call.id, name: this.name, output: `Glob error: ${err.message}`, isError: true, durationMs: 0 };
    }
  }
}

// ─── Directory Listing ──────────────────────────────────────────────────────

export class LsTool implements Tool {
  readonly name = "ls";
  readonly description = `List files and directories at a given path. Returns names with type indicators (/ for directories).`;

  readonly inputSchema = {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path to list. Defaults to working directory." },
      depth: { type: "number", description: "Recursion depth. Default: 1 (immediate children only)." },
    },
    required: [],
  };

  async run(ctx: ToolContext, call: ToolCallInput): Promise<ToolCallOutput> {
    const { path: dirPath, depth } = call.input as { path?: string; depth?: number };
    const absPath = dirPath
      ? dirPath.startsWith("/") ? dirPath : join(ctx.workingDirectory, dirPath)
      : ctx.workingDirectory;

    if (!existsSync(absPath)) {
      return { callId: call.id, name: this.name, output: `Path not found: ${absPath}`, isError: true, durationMs: 0 };
    }

    try {
      const entries = this.listDir(absPath, depth ?? 1, 0);
      return { callId: call.id, name: this.name, output: entries.join("\n"), isError: false, durationMs: 0 };
    } catch (err: any) {
      return { callId: call.id, name: this.name, output: `Error listing: ${err.message}`, isError: true, durationMs: 0 };
    }
  }

  private listDir(dirPath: string, maxDepth: number, currentDepth: number): string[] {
    if (currentDepth >= maxDepth) return [];

    const entries = readdirSync(dirPath, { withFileTypes: true });
    const result: string[] = [];
    const indent = "  ".repeat(currentDepth);

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules" || entry.name === ".git") continue;

      if (entry.isDirectory()) {
        result.push(`${indent}${entry.name}/`);
        result.push(...this.listDir(join(dirPath, entry.name), maxDepth, currentDepth + 1));
      } else {
        result.push(`${indent}${entry.name}`);
      }
    }

    return result;
  }
}
