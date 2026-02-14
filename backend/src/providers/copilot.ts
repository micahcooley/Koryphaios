// Copilot provider — uses GitHub Copilot's chat completions API.
// Auth via ~/.config/github-copilot/hosts.json or apps.json token.

import type { ProviderConfig, ModelDef } from "@koryphaios/shared";
import type { Provider, ProviderEvent, StreamRequest } from "./types";
import { OpenAIProvider } from "./openai";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const COPILOT_CHAT_URL = "https://api.githubcopilot.com";

// Copilot exposes many models via its proxy
const COPILOT_MODELS: ModelDef[] = [
  {
    id: "gpt-4.1",
    name: "GPT-4.1 (Copilot)",
    provider: "copilot",
    contextWindow: 1_047_576,
    maxOutputTokens: 32_768,
    costPerMInputTokens: 0,
    costPerMOutputTokens: 0,
    canReason: false,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4 (Copilot)",
    provider: "copilot",
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
    costPerMInputTokens: 0,
    costPerMOutputTokens: 0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  {
    id: "o4-mini",
    name: "O4 Mini (Copilot)",
    provider: "copilot",
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    costPerMInputTokens: 0,
    costPerMOutputTokens: 0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro (Copilot)",
    provider: "copilot",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    costPerMInputTokens: 0,
    costPerMOutputTokens: 0,
    canReason: true,
    supportsAttachments: true,
    supportsStreaming: true,
  },
];

export class CopilotProvider extends OpenAIProvider {
  constructor(config: ProviderConfig) {
    const token = config.apiKey ?? detectCopilotToken();
    super(
      { ...config, apiKey: token ?? undefined },
      "copilot",
      COPILOT_CHAT_URL,
    );
  }

  override listModels(): ModelDef[] {
    return COPILOT_MODELS;
  }

  override isAvailable(): boolean {
    return !this.config.disabled && !!(this.config.apiKey || detectCopilotToken());
  }
}

// Detect Copilot OAuth token from local config files
function detectCopilotToken(): string | null {
  const configPaths = [
    join(homedir(), ".config", "github-copilot", "hosts.json"),
    join(homedir(), ".config", "github-copilot", "apps.json"),
  ];

  for (const path of configPaths) {
    if (!existsSync(path)) continue;
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      // hosts.json has { "github.com": { "oauth_token": "..." } }
      for (const key of Object.keys(data)) {
        if (data[key]?.oauth_token) return data[key].oauth_token;
      }
    } catch {
      continue;
    }
  }

  // Also check environment
  return process.env.GITHUB_COPILOT_TOKEN ?? process.env.GITHUB_TOKEN ?? null;
}
