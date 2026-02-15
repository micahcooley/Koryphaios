<!--
  ProviderHub.svelte — Auth status for all connected LLM providers.
  Allows users to input API keys and connect/disconnect providers.
-->
<script lang="ts">
  import { wsStore } from '$lib/stores/websocket.svelte';

  const providerMeta: Record<string, { icon: string; label: string; placeholder: string; needsUrl?: boolean }> = {
    anthropic: { icon: '🟠', label: 'Anthropic', placeholder: 'sk-ant-...' },
    openai: { icon: '🟢', label: 'OpenAI', placeholder: 'sk-...' },
    gemini: { icon: '🔵', label: 'Gemini', placeholder: 'AIza...' },
    copilot: { icon: '⚫', label: 'GitHub Copilot', placeholder: 'gho_...' },
    openrouter: { icon: '🟣', label: 'OpenRouter', placeholder: 'sk-or-...' },
    groq: { icon: '🟤', label: 'Groq', placeholder: 'gsk_...' },
    xai: { icon: '⚪', label: 'xAI / Grok', placeholder: 'xai-...' },
    azure: { icon: '🔷', label: 'Azure OpenAI', placeholder: 'key...', needsUrl: true },
    bedrock: { icon: '🟧', label: 'AWS Bedrock', placeholder: 'AKIA...' },
    vertexai: { icon: '🔶', label: 'Vertex AI', placeholder: '/path/to/credentials.json' },
    local: { icon: '💻', label: 'Local', placeholder: 'http://localhost:1234', needsUrl: true },
  };

  // Track which provider is expanded for key entry
  let expandedProvider = $state<string | null>(null);
  let keyInputs = $state<Record<string, string>>({});
  let urlInputs = $state<Record<string, string>>({});
  let saving = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);

  async function connectProvider(name: string) {
    const apiKey = keyInputs[name]?.trim();
    if (!apiKey) return;

    saving = name;
    errorMsg = null;

    try {
      const body: Record<string, string> = { apiKey };
      if (urlInputs[name]?.trim()) {
        body.baseUrl = urlInputs[name].trim();
      }

      const res = await fetch(`/api/providers/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.ok) {
        errorMsg = data.error ?? 'Connection failed';
      } else {
        // Success — clear input, collapse
        keyInputs[name] = '';
        urlInputs[name] = '';
        expandedProvider = null;
      }
    } catch (err: any) {
      errorMsg = err.message ?? 'Network error';
    } finally {
      saving = null;
    }
  }

  async function disconnectProvider(name: string) {
    try {
      await fetch(`/api/providers/${name}`, { method: 'DELETE' });
    } catch {}
  }

  function toggleExpand(name: string) {
    expandedProvider = expandedProvider === name ? null : name;
    errorMsg = null;
  }

  function handleKeydown(e: KeyboardEvent, name: string) {
    if (e.key === 'Enter') connectProvider(name);
    if (e.key === 'Escape') expandedProvider = null;
  }
</script>

<div>
  <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Auth Hub</h3>

  {#if wsStore.providers.length === 0}
    <p class="text-xs text-text-muted">Waiting for server...</p>
  {:else}
    <div class="space-y-0.5">
      {#each wsStore.providers as provider (provider.name)}
        {@const meta = providerMeta[provider.name] ?? { icon: '•', label: provider.name, placeholder: 'api-key...' }}
        <div class="rounded-lg transition-colors {expandedProvider === provider.name ? 'bg-surface-3' : 'hover:bg-surface-3/50'}">
          <!-- Row -->
          <button
            onclick={() => toggleExpand(provider.name)}
            class="w-full flex items-center justify-between py-2 px-2.5 text-left"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm">{meta.icon}</span>
              <span class="text-xs text-text-primary font-medium">{meta.label}</span>
            </div>
            <div class="flex items-center gap-1.5">
              {#if provider.authenticated}
                <span class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]"></span>
                <span class="text-[10px] text-text-muted">{provider.models.length} models</span>
              {:else if provider.enabled}
                <span class="w-2 h-2 rounded-full bg-yellow-500"></span>
                <span class="text-[10px] text-yellow-400">no key</span>
              {:else}
                <span class="w-2 h-2 rounded-full bg-surface-4"></span>
                <span class="text-[10px] text-text-muted">off</span>
              {/if}
            </div>
          </button>

          <!-- Expanded: Key input -->
          {#if expandedProvider === provider.name}
            <div class="px-2.5 pb-2.5 space-y-2">
              {#if provider.authenticated}
                <div class="flex items-center justify-between">
                  <span class="text-[10px] text-green-400 font-medium">✓ Connected</span>
                  <button
                    onclick={() => disconnectProvider(provider.name)}
                    class="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
                <div class="text-[10px] text-text-muted">
                  Models: {provider.models.slice(0, 4).join(', ')}{provider.models.length > 4 ? ` +${provider.models.length - 4}` : ''}
                </div>
              {:else}
                <input
                  type="password"
                  placeholder={meta.placeholder}
                  bind:value={keyInputs[provider.name]}
                  onkeydown={(e) => handleKeydown(e, provider.name)}
                  class="w-full px-2.5 py-1.5 bg-surface-1 border border-border rounded-md text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 font-mono"
                />

                {#if meta.needsUrl}
                  <input
                    type="text"
                    placeholder="Endpoint URL"
                    bind:value={urlInputs[provider.name]}
                    onkeydown={(e) => handleKeydown(e, provider.name)}
                    class="w-full px-2.5 py-1.5 bg-surface-1 border border-border rounded-md text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 font-mono"
                  />
                {/if}

                {#if errorMsg && saving === null}
                  <p class="text-[10px] text-red-400">{errorMsg}</p>
                {/if}

                <button
                  onclick={() => connectProvider(provider.name)}
                  disabled={!keyInputs[provider.name]?.trim() || saving === provider.name}
                  class="w-full py-1.5 text-xs rounded-md font-medium transition-colors
                    {keyInputs[provider.name]?.trim()
                      ? 'bg-accent/20 text-accent hover:bg-accent/30 cursor-pointer'
                      : 'bg-surface-4 text-text-muted cursor-not-allowed'}"
                >
                  {saving === provider.name ? 'Connecting...' : 'Connect'}
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
