import { providerLog } from "../logger";
// Provider Registry — the universal auth hub.
// Auto-detects API keys from environment variables, config files, and CLI auth tokens.
// Mirrors OpenCode's provider initialization order and env var conventions.

import type { ProviderConfig, ProviderName, KoryphaiosConfig } from "@koryphaios/shared";
import type { Provider } from "./types";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider, GroqProvider, OpenRouterProvider, XAIProvider, AzureProvider } from "./openai";
import { GeminiProvider, GeminiCLIProvider } from "./gemini";
import { CopilotProvider } from "./copilot";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ─── Environment Variable Mapping (from OpenCode's config.go) ───────────────

const ENV_KEY_MAP: Record<ProviderName, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  copilot: ["GITHUB_COPILOT_TOKEN", "GITHUB_TOKEN"],
  openrouter: ["OPENROUTER_API_KEY"],
  groq: ["GROQ_API_KEY"],
  xai: ["XAI_API_KEY"],
  azure: ["AZURE_OPENAI_API_KEY"],
  bedrock: ["AWS_ACCESS_KEY_ID"],
  vertexai: ["GOOGLE_APPLICATION_CREDENTIALS"],
  local: ["LOCAL_ENDPOINT"],
};

const ENV_URL_MAP: Partial<Record<ProviderName, string>> = {
  azure: "AZURE_OPENAI_ENDPOINT",
  local: "LOCAL_ENDPOINT",
};

export class ProviderRegistry {
  private providers = new Map<ProviderName, Provider>();
  private providerConfigs = new Map<ProviderName, ProviderConfig>();

  constructor(private config?: KoryphaiosConfig) {
    this.initializeAll();
  }

  /** Get a specific provider by name. */
  get(name: ProviderName): Provider | undefined {
    return this.providers.get(name);
  }

  /** Get all available (authenticated) providers. */
  getAvailable(): Provider[] {
    return [...this.providers.values()].filter((p) => p.isAvailable());
  }

  /** Get provider status for all configured providers. */
  getStatus(): Array<{
    name: ProviderName;
    enabled: boolean;
    authenticated: boolean;
    models: string[];
    error?: string;
  }> {
    const allNames = Object.values(ENV_KEY_MAP);
    return Object.keys(ENV_KEY_MAP).map((name) => {
      const pn = name as ProviderName;
      const provider = this.providers.get(pn);
      const config = this.providerConfigs.get(pn);
      return {
        name: pn,
        enabled: config ? !config.disabled : false,
        authenticated: provider?.isAvailable() ?? false,
        models: provider?.listModels().map((m) => m.id) ?? [],
      };
    });
  }

  /** Find the best available provider for a given model ID. */
  findProviderForModel(modelId: string): Provider | undefined {
    for (const provider of this.getAvailable()) {
      if (provider.listModels().some((m) => m.id === modelId)) {
        return provider;
      }
    }
    return undefined;
  }

  /** Resolve the provider that should handle a model, with fallback chain. */
  resolveProvider(modelId: string, preferredProvider?: ProviderName): Provider | undefined {
    if (preferredProvider) {
      const preferred = this.providers.get(preferredProvider);
      if (preferred?.isAvailable()) return preferred;
    }
    return this.findProviderForModel(modelId);
  }

  /** Set/update an API key at runtime — re-initializes the provider. */
  setApiKey(name: ProviderName, apiKey: string, baseUrl?: string): { success: boolean; error?: string } {
    try {
      const existing = this.providerConfigs.get(name);
      const providerConfig: ProviderConfig = {
        name,
        apiKey,
        baseUrl: baseUrl ?? existing?.baseUrl,
        disabled: false,
        headers: existing?.headers,
      };

      this.providerConfigs.set(name, providerConfig);

      // Re-create the provider instance
      const provider = this.createProvider(name, providerConfig);
      if (provider) {
        this.providers.set(name, provider);
        providerLog.info({ provider: name }, "Configured with new API key");
        return { success: true };
      }
      return { success: false, error: "Failed to initialize provider" };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** Remove a provider's API key. */
  removeApiKey(name: ProviderName): void {
    const config = this.providerConfigs.get(name);
    if (config) {
      config.apiKey = undefined;
      config.disabled = true;
      this.providerConfigs.set(name, config);
    }
    this.providers.delete(name);
    providerLog.info({ provider: name }, "Disconnected");
  }

  /** Get the env var name expected for a provider. */
  getExpectedEnvVar(name: ProviderName): string {
    return ENV_KEY_MAP[name]?.[0] ?? `${name.toUpperCase()}_API_KEY`;
  }

  // ─── Private: Initialize all providers ──────────────────────────────────

  private initializeAll() {
    const configProviders = this.config?.providers ?? {};

    for (const name of Object.keys(ENV_KEY_MAP) as ProviderName[]) {
      const userConfig = configProviders[name];
      const envKey = this.detectEnvKey(name);
      const envUrl = this.detectEnvUrl(name);

      const providerConfig: ProviderConfig = {
        name,
        apiKey: userConfig?.apiKey ?? envKey ?? undefined,
        baseUrl: userConfig?.baseUrl ?? envUrl ?? undefined,
        disabled: userConfig?.disabled ?? false,
        headers: userConfig?.headers,
      };

      // Auto-disable if no auth available
      if (!providerConfig.apiKey && !envUrl && name !== "copilot" && name !== "local") {
        providerConfig.disabled = true;
      }

      this.providerConfigs.set(name, providerConfig);

      try {
        const provider = this.createProvider(name, providerConfig);
        if (provider) {
          this.providers.set(name, provider);
        }
      } catch (err) {
        providerLog.warn({ provider: name, err }, "Failed to initialize");
      }
    }

    this.logProviderStatus();
  }

  private createProvider(name: ProviderName, config: ProviderConfig): Provider | null {
    switch (name) {
      case "anthropic":
        return new AnthropicProvider(config);
      case "openai":
        return new OpenAIProvider(config);
      case "gemini":
        // Use CLI wrapper if no API key but gemini CLI is available
        if (!config.apiKey) {
          return new GeminiCLIProvider(config);
        }
        return new GeminiProvider(config);
      case "copilot":
        return new CopilotProvider(config);
      case "openrouter":
        return new OpenRouterProvider(config);
      case "groq":
        return new GroqProvider(config);
      case "xai":
        return new XAIProvider(config);
      case "azure":
        return new AzureProvider(config);
      case "bedrock":
        // Bedrock uses AWS SDK default credentials, not API key
        return new OpenAIProvider(config, "bedrock", config.baseUrl);
      case "vertexai":
        return new GeminiProvider({ ...config, name: "vertexai" });
      case "local":
        if (config.baseUrl) {
          return new OpenAIProvider(config, "local", config.baseUrl);
        }
        return null;
      default:
        return null;
    }
  }

  private detectEnvKey(name: ProviderName): string | null {
    const envVars = ENV_KEY_MAP[name] ?? [];
    for (const envVar of envVars) {
      const val = process.env[envVar];
      if (val) return val;
    }
    return null;
  }

  private detectEnvUrl(name: ProviderName): string | null {
    const envVar = ENV_URL_MAP[name];
    if (envVar) return process.env[envVar] ?? null;
    return null;
  }

  private logProviderStatus() {
    const available = this.getAvailable();
    const names = available.map((p) => p.name);
    providerLog.info({ providers: names }, "Providers ready");

    if (names.length === 0) {
      providerLog.warn("No providers configured");
    }
  }
}
