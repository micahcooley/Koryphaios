<!--
  ProviderHub.svelte — Auth status for all connected LLM providers.
-->
<script lang="ts">
  import { wsStore } from '$lib/stores/websocket.svelte';

  const providerIcons: Record<string, string> = {
    anthropic: '🟠',
    openai: '🟢',
    gemini: '🔵',
    copilot: '⚫',
    openrouter: '🟣',
    groq: '🟤',
    xai: '⚪',
    azure: '🔷',
    bedrock: '🟧',
    vertexai: '🔶',
    local: '💻',
  };
</script>

<div>
  <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Auth Hub</h3>

  {#if wsStore.providers.length === 0}
    <p class="text-xs text-text-muted">Connecting...</p>
  {:else}
    <div class="space-y-1">
      {#each wsStore.providers as provider}
        <div class="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-surface-3 transition-colors">
          <div class="flex items-center gap-2">
            <span class="text-sm">{providerIcons[provider.name] ?? '•'}</span>
            <span class="text-xs text-text-primary capitalize">{provider.name}</span>
          </div>
          <div class="flex items-center gap-1.5">
            {#if provider.authenticated}
              <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span class="text-xs text-text-muted">{provider.models.length}</span>
            {:else if provider.enabled}
              <span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
            {:else}
              <span class="w-1.5 h-1.5 rounded-full bg-surface-4"></span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
