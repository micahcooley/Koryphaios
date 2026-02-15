<script lang="ts">
  import { onDestroy } from 'svelte';
  import { wsStore } from '$lib/stores/websocket.svelte';
  import { theme } from '$lib/stores/theme.svelte';
  import { toastStore } from '$lib/stores/toast.svelte';
  import { shortcutStore } from '$lib/stores/shortcuts.svelte';
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
    X,
  } from 'lucide-svelte';
  import ProviderIcon from './icons/ProviderIcon.svelte';
  import ModelSelectionDialog from './ModelSelectionDialog.svelte';

  interface Props {
    open?: boolean;
    onClose?: () => void;
  }

  let { open = false, onClose }: Props = $props();
  let activeTab = $state<'providers' | 'assignments' | 'appearance' | 'shortcuts'>('providers');

  let showModelSelector = $state(false);
  let selectorTarget = $state<any>(null);

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open && onClose) onClose();
  }

  // ─── Provider Management ──────────────────────────────────────────────
  type ProviderCard = {
    key: string;
    label: string;
    placeholder: string;
    isAuthOnly?: boolean;
    needsUrl?: boolean;
  };

  const providerCategories: Array<{ label: string; icon: any; providers: ProviderCard[] }> = [
    {
      label: 'Frontier',
      icon: Zap,
      providers: [
        { key: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
        { key: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
        { key: 'google', label: 'Google', placeholder: 'AIza...' },
        { key: 'xai', label: 'xAI', placeholder: 'xai-...' },
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
  let tokenInputs = $state<Record<string, string>>({});
  let urlInputs = $state<Record<string, string>>({});
  let saving = $state<string | null>(null);
  let copiedEndpoint = $state(false);
  const authPortalUrls: Record<string, string> = {
    anthropic: 'https://claude.ai/code',
    bedrock: 'https://signin.aws.amazon.com/',
    vertexai: 'https://console.cloud.google.com/',
  };
  let copilotDeviceAuth = $state<{
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete?: string;
    expiresAt: number;
    intervalMs: number;
  } | null>(null);
  let copilotAuthStatus = $state<'idle' | 'pending' | 'connected' | 'error'>('idle');
  let copilotAuthMessage = $state<string>('');
  let copilotPollTimer: ReturnType<typeof setTimeout> | null = null;

  // Auth mode for providers with multiple auth options
  let selectedAuthMode = $state<Record<string, string>>({});

  function getProviderCaps(name: string) {
    const status = getProviderStatusExact(name);
    if (status) return status;
    // Fallback to minimal defaults if not yet loaded
    return { 
      authMode: 'api_key' as string, 
      supportsApiKey: true, 
      supportsAuthToken: false, 
      requiresBaseUrl: false,
      enabled: false,
      authenticated: false,
      models: [] as string[],
      extraAuthModes: undefined as undefined | Array<{id: string; label: string}>,
    };
  }

  function getProviderStatusExact(name: string) {
    return wsStore.providers.find(p => p.name === name);
  }

  function getProviderStatus(name: string) {
    const related = providerGroup(name);
    const statuses = related
      .map((key) => getProviderStatusExact(key))
      .filter(Boolean);
    if (statuses.length === 0) return undefined;
    return statuses.find((s) => s?.authenticated) ?? statuses.find((s) => s?.enabled) ?? statuses[0];
  }

  function providerGroup(name: string): string[] {
    if (name === 'anthropic') return ['anthropic', 'claude-code'];
    if (name === 'openai') return ['openai', 'codex'];
    if (name === 'google') return ['google', 'google-cli', 'google-antigravity'];
    return [name];
  }

  function modeProviderKey(cardKey: string, modeId: string): string {
    if (cardKey === 'openai' && modeId === 'codex') return 'codex';
    if (cardKey === 'anthropic' && modeId === 'claude_code') return 'anthropic';
    if (cardKey === 'google' && (modeId === 'cli' || modeId === 'antigravity')) return 'google';
    return cardKey;
  }

  async function connectProvider(name: string) {
    const caps = getProviderCaps(name);
    const apiKey = keyInputs[name]?.trim();
    const authToken = tokenInputs[name]?.trim();
    const baseUrl = urlInputs[name]?.trim();
    const authMode = selectedAuthMode[name];

    // Handle special CLI auth modes
    if (authMode === 'codex' || authMode === 'cli' || authMode === 'antigravity' || authMode === 'claude_code') {
      saving = name;
      try {
        const res = await fetch(`/api/providers/${name}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authMode }),
        });
        const data = await res.json();
        if (data.ok) {
          expandedProvider = null;
          const label = authMode === 'codex'
            ? 'Codex'
            : authMode === 'antigravity'
              ? 'Antigravity'
              : authMode === 'cli'
                ? 'Gemini'
                : 'Claude Code';
          toastStore.success(`${name} connected via ${label} CLI auth`);
        } else {
          toastStore.error(data.error ?? 'Connection failed');
        }
      } catch (err: any) {
        toastStore.error(err.message ?? 'Network error');
      } finally {
        saving = null;
      }
      return;
    }

    if (caps.authMode === 'api_key' && !apiKey) {
      toastStore.error('Enter API key');
      return;
    }
    if (caps.authMode === 'api_key_or_auth' && !apiKey && !authToken) {
      toastStore.error('Enter auth token or API key');
      return;
    }
    if (caps.authMode === 'base_url_only' && !baseUrl) {
      toastStore.error('Enter endpoint URL');
      return;
    }
    if (caps.authMode === 'env_auth') {
      // No typed secret input; backend verifies host environment credentials.
    }

    saving = name;
    try {
      const body: Record<string, string> = {};
      if (apiKey) body.apiKey = apiKey;
      if (authToken) body.authToken = authToken;
      if (baseUrl) body.baseUrl = baseUrl;
      const res = await fetch(`/api/providers/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        keyInputs[name] = '';
        tokenInputs[name] = '';
        urlInputs[name] = '';
        expandedProvider = null;
        toastStore.success(`${name} connected`);

        // Wait a small bit for wsStore to update if needed, then check status
        setTimeout(() => {
          const status = getProviderStatus(name);
          if (status && !status.hideModelSelector && (status.allAvailableModels?.length ?? 0) > 0) {
            selectorTarget = status;
            showModelSelector = true;
          }
        }, 100);
      } else {
        toastStore.error(data.error ?? 'Connection failed');
      }
    } catch (err: any) {
      toastStore.error(err.message ?? 'Network error');
    } finally {
      saving = null;
    }
  }

  async function saveSelectedModels(selected: string[], hideSelector: boolean) {
    if (!selectorTarget) return;
    const name = selectorTarget.name;
    
    try {
      const res = await fetch(`/api/providers/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          selectedModels: selected,
          hideModelSelector: hideSelector
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showModelSelector = false;
        selectorTarget = null;
        toastStore.success('Models updated');
      } else {
        toastStore.error(data.error ?? 'Failed to update models');
      }
    } catch (err: any) {
      toastStore.error(err.message ?? 'Network error');
    }
  }

  function openAuthPortal(name: string) {
    const url = authPortalUrls[name];
    if (!url) {
      toastStore.error('No auth portal configured for this provider');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function stopCopilotPolling() {
    if (copilotPollTimer) {
      clearTimeout(copilotPollTimer);
      copilotPollTimer = null;
    }
  }

  function scheduleCopilotPoll(delayMs: number) {
    stopCopilotPolling();
    copilotPollTimer = setTimeout(() => {
      void completeCopilotAuth(false);
    }, delayMs);
  }

  async function startCopilotAuth() {
    try {
      stopCopilotPolling();
      const res = await fetch('/api/providers/copilot/device/start', {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        toastStore.error(data.error ?? 'Failed to start Copilot auth');
        return;
      }

      const p = data.data as {
        deviceCode: string;
        userCode: string;
        verificationUri: string;
        verificationUriComplete?: string;
        expiresIn: number;
        interval?: number;
      };
      copilotDeviceAuth = {
        deviceCode: p.deviceCode,
        userCode: p.userCode,
        verificationUri: p.verificationUri,
        verificationUriComplete: p.verificationUriComplete,
        expiresAt: Date.now() + p.expiresIn * 1000,
        intervalMs: Math.max(3, p.interval ?? 5) * 1000,
      };
      copilotAuthStatus = 'pending';
      copilotAuthMessage = 'Waiting for GitHub authorization...';

      const authUrl = p.verificationUriComplete ?? p.verificationUri;
      window.open(authUrl, '_blank', 'noopener,noreferrer');
      await navigator.clipboard.writeText(p.userCode);
      toastStore.success('Copilot code ready. It has been copied to clipboard.');
      scheduleCopilotPoll(1500);
    } catch (err: any) {
      copilotAuthStatus = 'error';
      copilotAuthMessage = err.message ?? 'Failed to start Copilot auth';
      toastStore.error(err.message ?? 'Failed to start Copilot auth');
    }
  }

  async function completeCopilotAuth(manual = true) {
    if (!copilotDeviceAuth?.deviceCode) {
      toastStore.error('Start Copilot auth first');
      return;
    }
    const pollIntervalMs = copilotDeviceAuth.intervalMs;
    if (Date.now() > copilotDeviceAuth.expiresAt) {
      stopCopilotPolling();
      copilotAuthStatus = 'error';
      copilotAuthMessage = 'Device code expired. Start authorization again.';
      toastStore.error(copilotAuthMessage);
      return;
    }

    saving = 'copilot';
    try {
      const res = await fetch('/api/providers/copilot/device/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode: copilotDeviceAuth.deviceCode }),
      });
      const data = await res.json();
      if (!data.ok) {
        toastStore.error(data.error ?? 'Copilot auth failed');
        return;
      }

      const status = data.data?.status as string | undefined;
      if (status && status !== 'connected') {
        if (status === 'authorization_pending') {
          copilotAuthStatus = 'pending';
          copilotAuthMessage = 'Waiting for GitHub authorization...';
          scheduleCopilotPoll(pollIntervalMs);
        } else if (status === 'slow_down') {
          copilotAuthStatus = 'pending';
          copilotAuthMessage = 'GitHub asked to slow down. Retrying...';
          scheduleCopilotPoll(pollIntervalMs + 3000);
        } else if (status === 'expired_token') {
          stopCopilotPolling();
          copilotAuthStatus = 'error';
          copilotAuthMessage = 'Device code expired. Start authorization again.';
          toastStore.error(copilotAuthMessage);
        } else {
          stopCopilotPolling();
          copilotAuthStatus = 'error';
          copilotAuthMessage = data.data?.description ?? status;
          toastStore.error(copilotAuthMessage);
        }
        return;
      }

      stopCopilotPolling();
      copilotAuthStatus = 'connected';
      copilotAuthMessage = 'Authorized successfully.';
      copilotDeviceAuth = null;
      expandedProvider = null;
      toastStore.success('copilot connected');
    } catch (err: any) {
      if (manual) {
        toastStore.error(err.message ?? 'Copilot auth failed');
      } else {
        // keep polling on transient failures
        copilotAuthStatus = 'pending';
        copilotAuthMessage = 'Waiting for GitHub authorization...';
        scheduleCopilotPoll(pollIntervalMs);
      }
    } finally {
      saving = null;
    }
  }

  onDestroy(() => {
    stopCopilotPolling();
  });

  async function launchGeminiAuth() {
    saving = 'google';
    try {
      const res = await fetch('/api/providers/google/auth/cli', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        if (data.data.url) {
          window.open(data.data.url, '_blank', 'noopener,noreferrer');
          toastStore.info('Opened auth page. Complete login then click Verify.');
        } else {
          toastStore.success(data.data.message);
        }
      } else {
        toastStore.error(data.error || 'Auth launch failed');
      }
    } catch (err: any) {
      toastStore.error(err.message);
    } finally {
      saving = null;
    }
  }

  async function launchAntigravityAuth() {
    saving = 'google-antigravity';
    try {
      const res = await fetch('/api/providers/google/auth/antigravity', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        if (data.data.url) {
          window.open(data.data.url, '_blank', 'noopener,noreferrer');
          toastStore.info('Opened Antigravity portal. Ensure you have the plugin installed.');
        } else {
          toastStore.success(data.data.message);
        }
      } else {
        toastStore.error(data.error || 'Antigravity launch failed');
      }
    } catch (err: any) {
      toastStore.error(err.message);
    } finally {
      saving = null;
    }
  }

  async function launchClaudeAuth() {
    saving = 'claude-code';
    try {
      const res = await fetch('/api/providers/anthropic/auth/cli', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        if (data.data.url) {
          window.open(data.data.url, '_blank', 'noopener,noreferrer');
          toastStore.info('Opened auth page. Complete login in browser.');
        } else {
          toastStore.success(data.data.message);
        }
      } else {
        toastStore.error(data.error || 'Auth launch failed');
      }
    } catch (err: any) {
      toastStore.error(err.message);
    } finally {
      saving = null;
    }
  }

  async function launchCodexAuth() {
    saving = 'codex';
    try {
      const res = await fetch('/api/providers/openai/auth/codex', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        if (data.data.url) {
          window.open(data.data.url, '_blank', 'noopener,noreferrer');
          toastStore.info('Opened auth page. Complete login in browser.');
        } else {
          toastStore.success(data.data.message);
        }
      } else {
        toastStore.error(data.error || 'Auth launch failed');
      }
    } catch (err: any) {
      toastStore.error(err.message);
    } finally {
      saving = null;
    }
  }

  async function launchClaudeCodeAuth() {
    saving = 'claude-code';
    try {
      const res = await fetch('/api/providers/anthropic/auth/cli', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        if (data.data.url) {
          window.open(data.data.url, '_blank', 'noopener,noreferrer');
          toastStore.info('Opened auth page. Complete login in browser.');
        } else {
          toastStore.success(data.data.message);
        }
      } else {
        toastStore.error(data.error || 'Auth launch failed');
      }
    } catch (err: any) {
      toastStore.error(err.message);
    } finally {
      saving = null;
    }
  }

  async function disconnectProvider(name: string, grouped = true) {
    try {
      const names = grouped ? providerGroup(name) : [name];
      await Promise.all(names.map((provider) => fetch(`/api/providers/${provider}`, { method: 'DELETE' })));
      toastStore.info(`${name} disconnected`);
    } catch {}
  }

  function copyEndpoint() {
    navigator.clipboard.writeText(`${window.location.protocol}//${window.location.host}`);
    copiedEndpoint = true;
    setTimeout(() => copiedEndpoint = false, 2000);
  }

  // ─── Worker Assignments ──────────────────────────────────────────────
  let assignments = $state<Record<string, string>>({});
  let loadingAssignments = $state(false);

  async function loadAssignments() {
    loadingAssignments = true;
    try {
      const res = await fetch('/api/assignments');
      const data = await res.json();
      if (data.ok) {
        assignments = data.data.assignments;
      }
    } catch (err) {
      console.error('Failed to load assignments:', err);
    } finally {
      loadingAssignments = false;
    }
  }

  async function updateAssignment(domain: string, value: string) {
    try {
      const res = await fetch('/api/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: { [domain]: value } }),
      });
      const data = await res.json();
      if (data.ok) {
        assignments[domain] = value;
        toastStore.success(`Assigned ${domain} to ${value.split(':')[1] || value}`);
      }
    } catch (err) {
      toastStore.error('Failed to update assignment');
    }
  }

  $effect(() => {
    if (open && activeTab === 'assignments') {
      loadAssignments();
    }
  });

  const workerDomains = [
    { id: 'ui', label: 'UI Specialist', icon: Palette, description: 'Frontend, CSS, Svelte, design components' },
    { id: 'backend', label: 'Backend Specialist', icon: Server, description: 'C++, APIs, DSP, systems logic' },
    { id: 'critic', label: 'The Critic', icon: Check, description: 'Final quality audit, stub detection (Harshest)' },
    { id: 'general', label: 'Generalist', icon: Zap, description: 'Refactoring, docs, miscellaneous tasks' },
    { id: 'test', label: 'Test Engineer', icon: Check, description: 'Writing and verifying test suites' },
  ];

  function getAllModels() {
    const models: Array<{ id: string; name: string; provider: string }> = [];
    for (const p of wsStore.providers) {
      if (p.authenticated) {
        for (const m of p.models) {
          models.push({ id: `${p.name}:${m}`, name: m, provider: p.name });
        }
      }
    }
    return models;
  }

  // ─── Keyboard Shortcuts (editable, persisted via shared store) ──────────
  let shortcuts = $derived(shortcutStore.list);
  let editingShortcutId = $state<string | null>(null);
  let capturedKeys = $state<string[]>([]);

  function startEditShortcut(id: string) {
    if (editingShortcutId === id) {
      editingShortcutId = null;
      capturedKeys = [];
      return;
    }
    editingShortcutId = id;
    capturedKeys = [];
  }

  function handleShortcutKeydown(e: KeyboardEvent) {
    if (!editingShortcutId) return;
    e.preventDefault();
    e.stopPropagation();

    const keys: string[] = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.shiftKey) keys.push('Shift');
    if (e.altKey) keys.push('Alt');
    if (e.metaKey) keys.push('Meta');

    const key = e.key;
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      keys.push(key.length === 1 ? key.toUpperCase() : key);
    }

    if (keys.length === 0) return;
    capturedKeys = keys;

    // If a non-modifier key was pressed, commit the binding
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      const idx = shortcutStore.list.findIndex(s => s.id === editingShortcutId);
      if (idx >= 0) {
        shortcutStore.list[idx] = { ...shortcutStore.list[idx], keys: capturedKeys };
        shortcutStore.list = [...shortcutStore.list];
        shortcutStore.save();
      }
      editingShortcutId = null;
      capturedKeys = [];
    }
  }

  function resetShortcuts() {
    shortcutStore.reset();
    toastStore.info('Shortcuts reset to defaults');
  }
</script>

<svelte:window onkeydown={(e) => { if (editingShortcutId) handleShortcutKeydown(e); else handleKeydown(e); }} />

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
    onclick={onClose}
    onkeydown={(e) => { if (e.key === 'Escape' && onClose) onClose(); }}
    role="presentation"
  >
    <!-- Modal -->
    <div
      class="relative w-[90vw] max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      style="background: var(--color-surface-1); border: 1px solid var(--color-border);"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (!editingShortcutId) e.stopPropagation(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      tabindex="-1"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 shrink-0" style="border-bottom: 1px solid var(--color-border);">
        <h2 id="settings-title" class="text-base font-semibold" style="color: var(--color-text-primary);">Settings</h2>
        <button
          class="p-1.5 rounded-lg transition-colors hover:bg-[var(--color-surface-3)]"
          style="color: var(--color-text-muted);"
          onclick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <!-- Tab bar -->
      <div class="flex gap-1 mx-6 mt-4 p-1 rounded-lg shrink-0" style="background: var(--color-surface-0);">
        <button
          class="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-md transition-colors
                 {activeTab === 'providers' ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
          onclick={() => activeTab = 'providers'}
        >
          <Key size={13} /> Providers
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-md transition-colors
                 {activeTab === 'assignments' ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
          onclick={() => activeTab = 'assignments'}
        >
          <Cpu size={13} /> Assignments
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-md transition-colors
                 {activeTab === 'appearance' ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
          onclick={() => activeTab = 'appearance'}
        >
          <Palette size={13} /> Theme
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-md transition-colors
                 {activeTab === 'shortcuts' ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
          onclick={() => activeTab = 'shortcuts'}
        >
          <Keyboard size={13} /> Shortcuts
        </button>
      </div>

      <!-- Content (scrollable) -->
      <div class="flex-1 overflow-y-auto px-6 py-5">

  {#if activeTab === 'providers'}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each providerCategories as category}
      {@const CategoryIcon = category.icon}
      <div>
        <div class="flex items-center gap-1.5 mb-2 px-1">
          <CategoryIcon size={12} style="color: var(--color-text-muted);" />
          <span class="text-[10px] font-medium uppercase tracking-wider" style="color: var(--color-text-muted);">
            {category.label}
          </span>
        </div>
        <div class="space-y-0.5">
          {#each category.providers as prov}
            {@const status = getProviderStatus(prov.key)}
            {@const caps = getProviderCaps(prov.key)}
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
                    <span class="text-[10px] text-amber-400">needs auth</span>
                  {:else}
                    <span class="w-1.5 h-1.5 rounded-full" style="background: var(--color-surface-4);"></span>
                  {/if}
                </div>
              </button>

              {#if expandedProvider === prov.key}
                <div class="px-2.5 pb-2.5 space-y-2">
                  {#if caps.extraAuthModes}
                    <div class="flex gap-1 p-0.5 rounded-md mb-2" style="background: var(--color-surface-2);">
                      {#each caps.extraAuthModes as mode}
                        <button
                          class="flex-1 text-[10px] py-1 rounded transition-colors
                                 {(selectedAuthMode[prov.key] ?? caps.extraAuthModes[0].id) === mode.id
                                   ? 'bg-[var(--color-surface-4)] text-[var(--color-text-primary)] font-medium'
                                   : 'text-[var(--color-text-muted)]'}"
                          onclick={() => { selectedAuthMode[prov.key] = mode.id; selectedAuthMode = {...selectedAuthMode}; }}
                        >
                          {mode.label}
                        </button>
                      {/each}
                    </div>
                    {@const currentMode = selectedAuthMode[prov.key] ?? caps.extraAuthModes[0].id}
                    {@const modeProvider = modeProviderKey(prov.key, currentMode)}
                    {@const modeStatus = getProviderStatusExact(modeProvider)}

                    {#if modeStatus?.authenticated}
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <span class="text-[10px] text-emerald-400 font-medium flex items-center gap-1"><Check size={10} /> Connected</span>
                          <button
                            onclick={() => { selectorTarget = modeStatus; showModelSelector = true; }}
                            class="text-[10px] opacity-60 hover:opacity-100 underline decoration-dotted underline-offset-2"
                          >
                            Manage Models
                          </button>
                        </div>
                        <button
                          onclick={() => disconnectProvider(modeProvider, false)}
                          class="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                        >
                          Disconnect
                        </button>
                      </div>
                      <div class="space-y-0.5 mt-1">
                        {#each modeStatus.models as model}
                          <div class="flex items-center justify-between px-2 py-1 rounded" style="background: var(--color-surface-2);">
                            <span class="text-[11px]" style="color: var(--color-text-secondary);">{model}</span>
                          </div>
                        {/each}
                      </div>
                    {:else if currentMode === 'codex'}
                      <div class="text-[10px] mb-1" style="color: var(--color-text-muted);">
                        Uses existing Codex CLI session. Run <code class="px-1 py-0.5 rounded" style="background: var(--color-surface-3);">codex auth</code> first.
                      </div>
                      <div class="flex gap-2">
                        <button
                          onclick={launchCodexAuth}
                          disabled={saving === prov.key}
                          class="btn btn-secondary flex-1"
                        >
                          Launch Auth
                        </button>
                        <button
                          onclick={() => connectProvider(prov.key)}
                          disabled={saving === prov.key}
                          class="btn btn-primary flex-1"
                        >
                          {saving === prov.key ? 'Verifying...' : 'Verify'}
                        </button>
                      </div>
                    {:else if currentMode === 'claude_code'}
                      <div class="text-[10px] mb-1" style="color: var(--color-text-muted);">
                        Uses existing Claude Code session. Run <code class="px-1 py-0.5 rounded" style="background: var(--color-surface-3);">claude auth</code> first.
                      </div>
                      <div class="flex gap-2">
                        <button
                          onclick={launchClaudeCodeAuth}
                          disabled={saving === prov.key}
                          class="btn btn-secondary flex-1"
                        >
                          Launch Auth
                        </button>
                        <button
                          onclick={() => connectProvider(prov.key)}
                          disabled={saving === prov.key}
                          class="btn btn-primary flex-1"
                        >
                          {saving === prov.key ? 'Verifying...' : 'Verify'}
                        </button>
                      </div>
                    {:else if currentMode === 'cli'}
                      <div class="text-[10px] mb-1" style="color: var(--color-text-muted);">
                        Authenticate via Google Cloud / Gemini CLI (ADC).
                      </div>
                      <div class="flex gap-2">
                        <button
                          onclick={launchGeminiAuth}
                          disabled={saving === prov.key}
                          class="btn btn-secondary flex-1"
                        >
                          Launch Auth
                        </button>
                        <button
                          onclick={() => connectProvider(prov.key)}
                          disabled={saving === prov.key}
                          class="btn btn-primary flex-1"
                        >
                          {saving === prov.key ? 'Verifying...' : 'Verify'}
                        </button>
                      </div>
                    {:else if currentMode === 'antigravity'}
                      <div class="text-[10px] mb-1" style="color: var(--color-text-muted);">
                        Connect to Google's internal Antigravity agent platform.
                      </div>
                      <div class="flex gap-2">
                        <button
                          onclick={launchAntigravityAuth}
                          disabled={saving === prov.key}
                          class="btn btn-secondary flex-1"
                        >
                          Connect Portal
                        </button>
                        <button
                          onclick={() => connectProvider(prov.key)}
                          disabled={saving === prov.key}
                          class="btn btn-primary flex-1"
                        >
                          {saving === prov.key ? 'Verifying...' : 'Verify'}
                        </button>
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
                      <button
                        onclick={() => connectProvider(prov.key)}
                        disabled={saving === prov.key}
                        class="btn btn-primary w-full"
                      >
                        {saving === prov.key ? 'Connecting...' : 'Connect'}
                      </button>
                    {/if}
                  {:else}
                      <!-- Providers without multi-auth-mode -->
                      {#if caps.supportsApiKey}
                        <input
                          type="password"
                          placeholder={prov.placeholder}
                          bind:value={keyInputs[prov.key]}
                          onkeydown={(e) => { if (e.key === 'Enter') connectProvider(prov.key); }}
                          class="input"
                          style="font-size: 12px;"
                        />
                      {/if}
                      {#if caps.supportsAuthToken}
                        <input
                          type="password"
                          placeholder={caps.authMode === 'api_key_or_auth' ? 'Auth token (or use API key)' : 'Auth token'}
                          bind:value={tokenInputs[prov.key]}
                          onkeydown={(e) => { if (e.key === 'Enter') connectProvider(prov.key); }}
                          class="input"
                          style="font-size: 12px;"
                        />
                      {/if}
                      {#if caps.authMode === 'auth_only'}
                        <div class="text-[10px] mb-1" style="color: var(--color-text-muted);">
                          Authenticate via professional CLI / Portal flow.
                        </div>
                        {#if prov.key === 'copilot'}
                          <button
                            onclick={startCopilotAuth}
                            class="btn btn-secondary w-full"
                          >
                            Authorize Copilot in Browser
                          </button>
                          {#if copilotDeviceAuth}
                            <div class="rounded-md px-2 py-2 mt-2" style="background: var(--color-surface-2);">
                              <div class="text-[10px] mb-1" style="color: var(--color-text-muted);">Enter this code on GitHub:</div>
                              <code class="text-xs font-semibold">{copilotDeviceAuth.userCode}</code>
                              {#if copilotAuthStatus !== 'idle'}
                                <div class="text-[10px] mt-2" style="color: var(--color-text-muted);">{copilotAuthMessage}</div>
                              {/if}
                            </div>
                            <button
                              onclick={() => completeCopilotAuth(true)}
                              disabled={saving === 'copilot'}
                              class="btn btn-primary w-full"
                            >
                              {saving === 'copilot' ? 'Checking...' : 'Complete Authorization'}
                            </button>
                          {/if}
                        {:else if prov.key === 'google-cli'}
                          <div class="flex gap-2">
                            <button onclick={launchGeminiAuth} class="btn btn-secondary flex-1">Launch Auth</button>
                            <button onclick={() => connectProvider(prov.key)} class="btn btn-primary flex-1">Verify</button>
                          </div>
                        {:else if prov.key === 'google-antigravity'}
                          <div class="flex gap-2">
                            <button onclick={launchAntigravityAuth} class="btn btn-secondary flex-1">Connect Portal</button>
                            <button onclick={() => connectProvider(prov.key)} class="btn btn-primary flex-1">Verify</button>
                          </div>
                        {:else if prov.key === 'claude-code'}
                          <div class="flex gap-2">
                            <button onclick={launchClaudeAuth} class="btn btn-secondary flex-1">Launch Auth</button>
                            <button onclick={() => connectProvider(prov.key)} class="btn btn-primary flex-1">Verify</button>
                          </div>
                        {:else if prov.key === 'codex'}
                          <div class="flex gap-2">
                            <button onclick={launchCodexAuth} class="btn btn-secondary flex-1">Launch Auth</button>
                            <button onclick={() => connectProvider(prov.key)} class="btn btn-primary flex-1">Verify</button>
                          </div>
                        {:else if authPortalUrls[prov.key]}
                          <button
                            onclick={() => openAuthPortal(prov.key)}
                            class="btn btn-secondary w-full"
                          >
                            Authenticate in Browser
                          </button>
                        {/if}
                      {/if}
                      {#if caps.requiresBaseUrl || prov.needsUrl}
                        <input
                          type="text"
                          placeholder="Endpoint URL"
                          bind:value={urlInputs[prov.key]}
                          class="input"
                          style="font-size: 12px;"
                        />
                      {/if}
                      {#if caps.authMode === 'env_auth'}
                        <div class="text-[10px]" style="color: var(--color-text-muted);">
                          Uses host environment auth ({prov.key === 'bedrock' ? 'AWS credentials/profile' : 'Vertex/Google credentials'}).
                        </div>
                      {/if}
                      {#if !(caps.authMode === 'auth_only' && prov.key === 'copilot')}
                        <button
                          onclick={() => connectProvider(prov.key)}
                          disabled={saving === prov.key}
                          class="btn btn-primary w-full"
                        >
                          {saving === prov.key ? 'Connecting...' : (caps.authMode === 'auth_only' || caps.authMode === 'env_auth' ? 'Verify Connection' : 'Connect')}
                        </button>
                      {/if}
                    {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
    </div>

    <div class="pt-4 mt-4" style="border-top: 1px solid var(--color-border);">
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

  {:else if activeTab === 'assignments'}
    <div class="space-y-4">
      <div class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mb-4">
        <p class="text-[11px] text-blue-400">
          Assign specific models to specialized roles. Manager chooses "Auto" based on these assignments.
          The Critic is the final gatekeeper for all code changes.
        </p>
      </div>

      {#if loadingAssignments}
        <div class="flex items-center justify-center py-10">
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--color-accent)]"></div>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-3">
          {#each workerDomains as domain}
            {@const DomainIcon = domain.icon}
            <div class="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] flex flex-col gap-3">
              <div class="flex items-start justify-between">
                <div class="flex gap-2.5">
                  <div class="mt-0.5 p-1.5 rounded-lg bg-[var(--color-surface-3)]" style="color: var(--color-text-secondary);">
                    <DomainIcon size={16} />
                  </div>
                  <div>
                    <h3 class="text-xs font-semibold" style="color: var(--color-text-primary);">{domain.label}</h3>
                    <p class="text-[10px]" style="color: var(--color-text-muted);">{domain.description}</p>
                  </div>
                </div>
              </div>

              <div class="relative">
                <select
                  class="w-full bg-[var(--color-surface-3)] text-xs rounded-lg px-3 py-2 border-none ring-1 ring-inset ring-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-accent)] appearance-none cursor-pointer"
                  style="color: var(--color-text-primary);"
                  value={assignments[domain.id] || ''}
                  onchange={(e) => updateAssignment(domain.id, (e.target as HTMLSelectElement).value)}
                >
                  <option value="">Default (Manager's Choice)</option>
                  {#each getAllModels() as model}
                    <option value={model.id}>
                      {model.provider.toUpperCase()}: {model.name}
                    </option>
                  {/each}
                </select>
                <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none opacity-50">
                  <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

  {:else if activeTab === 'appearance'}
    <div class="space-y-6 max-w-lg">
      <div>
        <div class="text-xs font-medium mb-2 block" style="color: var(--color-text-secondary);">Theme Preset</div>
        <div class="grid grid-cols-3 gap-1.5">
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
    <div class="space-y-1.5 max-w-lg">
      <p class="text-[10px] mb-3" style="color: var(--color-text-muted);">
        Click a shortcut to rebind it. Press the new key combination to save.
      </p>
      {#each shortcuts as shortcut (shortcut.id)}
        <div
          class="flex items-center justify-between py-2 px-3 rounded-lg transition-colors cursor-pointer
                 {editingShortcutId === shortcut.id ? 'ring-1 ring-[var(--color-accent)]' : 'hover:bg-[var(--color-surface-3)]'}"
          style="background: var(--color-surface-2);"
          onclick={() => startEditShortcut(shortcut.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => { if (e.key === 'Enter') startEditShortcut(shortcut.id); }}
        >
          <span class="text-xs" style="color: var(--color-text-secondary);">{shortcut.action}</span>
          <div class="flex gap-1">
            {#if editingShortcutId === shortcut.id}
              {#if capturedKeys.length > 0}
                {#each capturedKeys as key}
                  <span class="kbd" style="color: var(--color-accent);">{key}</span>
                {/each}
              {:else}
                <span class="text-[10px] animate-pulse" style="color: var(--color-accent);">Press keys...</span>
              {/if}
            {:else}
              {#each shortcut.keys as key}
                <span class="kbd">{key}</span>
              {/each}
            {/if}
          </div>
        </div>
      {/each}
      <div class="pt-3">
        <button
          class="btn btn-secondary text-xs"
          onclick={resetShortcuts}
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  {/if}

      </div>
    </div>
  </div>
{/if}

{#if showModelSelector && selectorTarget}
  <ModelSelectionDialog
    providerName={selectorTarget.name}
    availableModels={selectorTarget.allAvailableModels}
    selectedModels={selectorTarget.selectedModels}
    onSave={saveSelectedModels}
    onClose={() => { showModelSelector = false; selectorTarget = null; }}
  />
{/if}
