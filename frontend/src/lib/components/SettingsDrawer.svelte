<script lang="ts">
  import { wsStore } from '$lib/stores/websocket.svelte';
  import { theme } from '$lib/stores/theme.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import Drawer from './Drawer.svelte';
  import {
    Key,
    Palette,
    Keyboard,
    Check,
    Copy,
    Zap,
    Server,
    Globe,
    Cpu,
  } from 'lucide-svelte';
  import ProviderIcon from './icons/ProviderIcon.svelte';

  interface Props {
    open?: boolean;
    onClose?: () => void;
  }

  let { open = false, onClose }: Props = $props();
  let activeTab = $state<'providers' | 'appearance' | 'shortcuts'>('providers');

  // ─── Provider Management ──────────────────────────────────────────────
  const providerCategories = [
    {
      label: 'Frontier',
      icon: Zap,
      providers: [
        { key: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
        { key: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
        { key: 'gemini', label: 'Google Gemini', placeholder: 'AIza...' },
        { key: 'xai', label: 'xAI / Grok', placeholder: 'xai-...' },
      ],
    },
    {
      label: 'Aggregators',
      icon: Globe,
      providers: [
        { key: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...' },
        { key: 'copilot', label: 'GitHub Copilot', placeholder: 'gho_...' },
        { key: 'groq', label: 'Groq', placeholder: 'gsk_...' },
      ],
    },
    {
      label: 'Enterprise',
      icon: Server,
      providers: [
        { key: 'azure', label: 'Azure OpenAI', placeholder: 'key...', needsUrl: true },
        { key: 'bedrock', label: 'AWS Bedrock', placeholder: 'AKIA...' },
        { key: 'vertexai', label: 'Vertex AI', placeholder: '/path/to/creds.json' },
      ],
    },
    {
      label: 'Local',
      icon: Cpu,
      providers: [
        { key: 'local', label: 'Local/Ollama', placeholder: 'http://localhost:1234', needsUrl: true },
      ],
    },
  ];

  let expandedProvider = $state<string | null>(null);
  let keyInputs = $state<Record<string, string>>({});
  let urlInputs = $state<Record<string, string>>({});
  let saving = $state<string | null>(null);
  let copiedEndpoint = $state(false);

  function getProviderStatus(name: string) {
    return wsStore.providers.find(p => p.name === name);
  }

  async function connectProvider(name: string) {
    const apiKey = keyInputs[name]?.trim();
    if (!apiKey) return;
    saving = name;
    try {
      const body: Record<string, string> = { apiKey };
      if (urlInputs[name]?.trim()) body.baseUrl = urlInputs[name].trim();
      const res = await fetch(`/api/providers/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        keyInputs[name] = '';
        urlInputs[name] = '';
        expandedProvider = null;
        toastStore.success(`${name} connected`);
      } else {
        toastStore.error(data.error ?? 'Connection failed');
      }
    } catch (err: any) {
      toastStore.error(err.message ?? 'Network error');
    } finally {
      saving = null;
    }
  }

  async function disconnectProvider(name: string) {
    try {
      await fetch(`/api/providers/${name}`, { method: 'DELETE' });
      toastStore.info(`${name} disconnected`);
    } catch {}
  }

  function copyEndpoint() {
    navigator.clipboard.writeText(`${window.location.protocol}//${window.location.host}`);
    copiedEndpoint = true;
    setTimeout(() => copiedEndpoint = false, 2000);
  }

  const shortcuts = [
    { keys: ['Ctrl', 'Enter'], action: 'Send message' },
    { keys: ['Ctrl', ','], action: 'Open settings' },
    { keys: ['Ctrl', 'N'], action: 'New session' },
    { keys: ['Ctrl', 'K'], action: 'Focus input' },
    { keys: ['Esc'], action: 'Close dialogs' },
  ];
</script>

<Drawer {open} title="Settings" {onClose}>
  <!-- Tab bar -->
  <div class="flex gap-1 mb-4 p-1 rounded-lg" style="background: var(--color-surface-0);">
    <button
      class="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-colors
             {activeTab === 'providers' ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
      onclick={() => activeTab = 'providers'}
    >
      <Key size={13} /> Auth
    </button>
    <button
      class="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-colors
             {activeTab === 'appearance' ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
      onclick={() => activeTab = 'appearance'}
    >
      <Palette size={13} /> Theme
    </button>
    <button
      class="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-colors
             {activeTab === 'shortcuts' ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
      onclick={() => activeTab = 'shortcuts'}
    >
      <Keyboard size={13} /> Keys
    </button>
  </div>

  {#if activeTab === 'providers'}
    {#each providerCategories as category}
      {@const CategoryIcon = category.icon}
      <div class="mb-4">
        <div class="flex items-center gap-1.5 mb-2 px-1">
          <CategoryIcon size={12} style="color: var(--color-text-muted);" />
          <span class="text-[10px] font-medium uppercase tracking-wider" style="color: var(--color-text-muted);">
            {category.label}
          </span>
        </div>
        <div class="space-y-0.5">
          {#each category.providers as prov}
            {@const status = getProviderStatus(prov.key)}
            <div class="rounded-lg transition-colors {expandedProvider === prov.key ? 'bg-[var(--color-surface-3)]' : 'hover:bg-[var(--color-surface-2)]'}">
              <button
                onclick={() => { expandedProvider = expandedProvider === prov.key ? null : prov.key; }}
                class="w-full flex items-center justify-between py-2 px-2.5 text-left"
              >
                <div class="flex items-center gap-2">
                  <ProviderIcon provider={prov.key} size={16} />
                  <span class="text-xs font-medium" style="color: var(--color-text-primary);">{prov.label}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  {#if status?.authenticated}
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span class="text-[10px]" style="color: var(--color-text-muted);">{status.models.length} models</span>
                  {:else if status?.enabled}
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span class="text-[10px] text-amber-400">needs key</span>
                  {:else}
                    <span class="w-1.5 h-1.5 rounded-full" style="background: var(--color-surface-4);"></span>
                  {/if}
                </div>
              </button>

              {#if expandedProvider === prov.key}
                <div class="px-2.5 pb-2.5 space-y-2">
                  {#if status?.authenticated}
                    <div class="flex items-center justify-between">
                      <span class="text-[10px] text-emerald-400 font-medium flex items-center gap-1"><Check size={10} /> Connected</span>
                      <button
                        onclick={() => disconnectProvider(prov.key)}
                        class="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                    <div class="text-[10px]" style="color: var(--color-text-muted);">
                      {status.models.join(', ')}
                    </div>
                  {:else}
                    <input
                      type="password"
                      placeholder={prov.placeholder}
                      bind:value={keyInputs[prov.key]}
                      onkeydown={(e) => { if (e.key === 'Enter') connectProvider(prov.key); }}
                      class="input"
                      style="font-size: 12px;"
                    />
                    {#if prov.needsUrl}
                      <input
                        type="text"
                        placeholder="Endpoint URL"
                        bind:value={urlInputs[prov.key]}
                        class="input"
                        style="font-size: 12px;"
                      />
                    {/if}
                    <button
                      onclick={() => connectProvider(prov.key)}
                      disabled={!keyInputs[prov.key]?.trim() || saving === prov.key}
                      class="btn btn-primary w-full"
                    >
                      {saving === prov.key ? 'Connecting...' : 'Connect'}
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}

    <div class="pt-3 mt-3" style="border-top: 1px solid var(--color-border);">
      <p class="text-[10px] uppercase tracking-wider mb-2" style="color: var(--color-text-muted);">Server</p>
      <div class="flex items-center gap-2">
        <code class="flex-1 px-2 py-1.5 text-[11px] rounded-md" style="background: var(--color-surface-3);">
          {typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : ''}
        </code>
        <button class="btn btn-secondary p-1.5" onclick={copyEndpoint}>
          {#if copiedEndpoint}<Check size={13} />{:else}<Copy size={13} />{/if}
        </button>
      </div>
    </div>

  {:else if activeTab === 'appearance'}
    <div class="space-y-5">
      <div>
        <div class="text-xs font-medium mb-2 block" style="color: var(--color-text-secondary);">Theme Preset</div>
        <div class="grid grid-cols-2 gap-1.5">
          {#each theme.presets as preset}
            <button
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all border
                     {theme.preset === preset.id
                       ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text-primary)]'
                       : 'border-transparent bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)]'}"
              onclick={() => theme.setPreset(preset.id)}
            >
              {#if theme.preset === preset.id}
                <Check size={12} style="color: var(--color-accent);" />
              {/if}
              {preset.label}
            </button>
          {/each}
        </div>
      </div>

      <div>
        <div class="text-xs font-medium mb-2 block" style="color: var(--color-text-secondary);">Accent Color</div>
        <div class="flex gap-2">
          {#each theme.accents as accent}
            <button
              class="w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center
                     {theme.accent === accent.id ? 'border-[var(--color-text-primary)] scale-110' : 'border-transparent hover:scale-105'}"
              style="background: {accent.color};"
              onclick={() => theme.setAccent(accent.id)}
              title={accent.label}
            >
              {#if theme.accent === accent.id}
                <Check size={14} style="color: var(--color-text-primary); filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));" />
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <div>
        <div class="text-xs font-medium mb-2 block" style="color: var(--color-text-secondary);">Font</div>
        <div class="space-y-1">
          {#each theme.fonts as font}
            <button
              class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors border
                     {theme.font === font.id
                       ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                       : 'border-transparent bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]'}"
              onclick={() => theme.setFont(font.id)}
            >
              <span style="color: var(--color-text-primary);">{font.label}</span>
              {#if theme.font === font.id}
                <Check size={12} style="color: var(--color-accent);" />
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>

  {:else if activeTab === 'shortcuts'}
    <div class="space-y-1.5">
      {#each shortcuts as shortcut}
        <div class="flex items-center justify-between py-2 px-3 rounded-lg" style="background: var(--color-surface-2);">
          <span class="text-xs" style="color: var(--color-text-secondary);">{shortcut.action}</span>
          <div class="flex gap-1">
            {#each shortcut.keys as key}
              <span class="kbd">{key}</span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</Drawer>
