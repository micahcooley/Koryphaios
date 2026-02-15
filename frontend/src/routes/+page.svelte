<script lang="ts">
  import { onMount } from 'svelte';
  import { wsStore } from '$lib/stores/websocket.svelte';
  import { theme } from '$lib/stores/theme.svelte';
  import { sessionStore } from '$lib/stores/sessions.svelte';
  import ManagerFeed from '$lib/components/ManagerFeed.svelte';
  import FileEditPreview from '$lib/components/FileEditPreview.svelte';
  import WorkerCard from '$lib/components/WorkerCard.svelte';
  import CommandInput from '$lib/components/CommandInput.svelte';
  import SessionSidebar from '$lib/components/SessionSidebar.svelte';
  import PermissionDialog from '$lib/components/PermissionDialog.svelte';
  import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import {
    Settings,
    Activity,
    Cpu,
    ChevronDown,
  } from 'lucide-svelte';

  let showSettings = $state(false);
  let showAgents = $state(false);
  let inputRef = $state<HTMLTextAreaElement>();

  onMount(() => {
    theme.init();
    wsStore.connect();
    sessionStore.fetchSessions().then(() => {
      if (!sessionStore.activeSessionId && sessionStore.sessions.length === 0) {
        sessionStore.createSession();
      } else if (!sessionStore.activeSessionId && sessionStore.sessions.length > 0) {
        sessionStore.activeSessionId = sessionStore.sessions[0].id;
      }
    });

    window.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      wsStore.disconnect();
      window.removeEventListener('keydown', handleGlobalKeydown);
    };
  });

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case ',':
          e.preventDefault();
          showSettings = true;
          break;
        case 'n':
          e.preventDefault();
          sessionStore.createSession();
          break;
        case 'k':
          e.preventDefault();
          inputRef?.focus();
          break;
      }
    }
    if (e.key === 'Escape' && showSettings) {
      showSettings = false;
    }
  }

  function handleSend(message: string) {
    if (!sessionStore.activeSessionId || !message.trim()) return;
    wsStore.sendMessage(sessionStore.activeSessionId, message);
  }

  let activeAgents = $derived([...wsStore.agents.values()]);
  let connectedProviders = $derived(wsStore.providers.filter(p => p.authenticated).length);
  let connectionDot = $derived(
    wsStore.status === 'connected' ? 'bg-emerald-500' :
    wsStore.status === 'connecting' ? 'bg-amber-500 animate-pulse' :
    'bg-red-500'
  );
</script>

<svelte:head>
  <title>Koryphaios — AI Agent Orchestrator</title>
</svelte:head>

<div class="flex h-screen overflow-hidden" style="background: var(--color-surface-0);">
  <!-- Sidebar -->
  <div class="w-60 min-w-[200px] max-w-[320px] shrink-0 border-r flex flex-col" style="border-color: var(--color-border); background: var(--color-surface-1);">
    <!-- Logo -->
    <div class="flex items-center gap-2.5 px-4 py-3 border-b" style="border-color: var(--color-border);">
      <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-xs font-bold" style="color: var(--color-surface-0);">K</div>
      <div>
        <h1 class="text-sm font-semibold" style="color: var(--color-text-primary);">Koryphaios</h1>
        <p class="text-[10px]" style="color: var(--color-text-muted);">v0.1.0</p>
      </div>
    </div>
    <div class="flex-1 overflow-hidden">
      <SessionSidebar currentSessionId={sessionStore.activeSessionId} />
    </div>
    <!-- Sidebar footer -->
    <div class="px-3 py-2 border-t flex items-center justify-between" style="border-color: var(--color-border);">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full {connectionDot}"></div>
        <span class="text-[10px] capitalize" style="color: var(--color-text-muted);">{wsStore.status}</span>
      </div>
      <div class="flex items-center gap-1">
        {#if connectedProviders > 0}
          <span class="text-[10px] px-1.5 py-0.5 rounded" style="background: var(--color-surface-3); color: var(--color-text-muted);">
            {connectedProviders} providers
          </span>
        {/if}
        <button
          class="p-2 rounded-lg transition-colors hover:bg-[var(--color-surface-3)]"
          style="color: var(--color-text-muted);"
          onclick={() => showSettings = true}
          title="Settings (Ctrl+,)"
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="flex-1 flex flex-col min-w-0">
    <!-- Top bar -->
    <header class="flex items-center justify-between px-4 py-2 border-b shrink-0" style="border-color: var(--color-border); background: var(--color-surface-1);">
      <div class="flex items-center gap-3">
        {#if wsStore.koryPhase}
          <div class="flex items-center gap-2 px-2.5 py-1 rounded-lg" style="background: var(--color-surface-2);">
            <div class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></div>
            <span class="text-xs" style="color: var(--color-text-secondary);">
              Kory: {wsStore.koryPhase}
            </span>
          </div>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        {#if activeAgents.length > 0}
          <button
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors hover:bg-[var(--color-surface-3)]"
            style="background: var(--color-surface-2);"
            onclick={() => showAgents = !showAgents}
          >
            <Activity size={12} class="text-emerald-400" />
            <span class="text-xs" style="color: var(--color-text-secondary);">{activeAgents.length} agent{activeAgents.length !== 1 ? 's' : ''}</span>
            <ChevronDown size={12} class="transition-transform {showAgents ? 'rotate-180' : ''}" style="color: var(--color-text-muted);" />
          </button>
        {/if}
      </div>
    </header>

    <!-- Agent cards (collapsible) -->
    {#if showAgents && activeAgents.length > 0}
      <div class="px-4 py-2 border-b flex gap-2 overflow-x-auto shrink-0" style="border-color: var(--color-border); background: var(--color-surface-1);">
        {#each activeAgents as agent (agent.identity.id)}
          <WorkerCard {agent} />
        {/each}
      </div>
    {/if}

    <!-- File Edit Preview (Cursor-style streaming) -->
    <FileEditPreview />

    <!-- Chat / Feed area -->
    <div class="flex-1 overflow-hidden">
      <ManagerFeed />
    </div>

    <!-- Command Input -->
    <div class="shrink-0 border-t" style="border-color: var(--color-border); background: var(--color-surface-1);">
      <CommandInput
        bind:inputRef
        onSend={handleSend}
      />
    </div>
  </div>
</div>

<PermissionDialog />
<SettingsDrawer open={showSettings} onClose={() => showSettings = false} />
<ToastContainer />
