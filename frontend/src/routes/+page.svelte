<!--
  Koryphaios Dashboard — Main page.
  macOS-style bento grid with live agent feeds.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { wsStore } from '$lib/stores/websocket.svelte';
  import ManagerFeed from '$lib/components/ManagerFeed.svelte';
  import WorkerCard from '$lib/components/WorkerCard.svelte';
  import CommandInput from '$lib/components/CommandInput.svelte';
  import ProviderHub from '$lib/components/ProviderHub.svelte';
  import SessionSidebar from '$lib/components/SessionSidebar.svelte';
  import DiffViewer from '$lib/components/DiffViewer.svelte';
  import PermissionDialog from '$lib/components/PermissionDialog.svelte';

  let currentSessionId = $state<string>('');
  let bottomTab = $state<'terminal' | 'diffs'>('terminal');

  onMount(() => {
    wsStore.connect();
    createSession();
    return () => wsStore.disconnect();
  });

  async function createSession() {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Session' }),
      });
      const data = await res.json();
      if (data.ok) currentSessionId = data.data.id;
    } catch {
      currentSessionId = `local-${Date.now()}`;
    }
  }

  function handleSend(message: string) {
    if (!currentSessionId || !message.trim()) return;
    wsStore.sendMessage(currentSessionId, message);
  }

  let activeAgents = $derived([...wsStore.agents.values()]);
  let connectionDot = $derived(
    wsStore.status === 'connected' ? 'bg-green-500' :
    wsStore.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
    'bg-red-500'
  );
</script>

<svelte:head>
  <title>Koryphaios — AI Agent Dashboard</title>
</svelte:head>

<div class="bento-grid">
  <!-- Sidebar -->
  <div class="window-chrome" style="grid-area: sidebar;">
    <SessionSidebar bind:currentSessionId />
  </div>

  <!-- Header -->
  <div style="grid-area: header;" class="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-1 border border-border">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-sm font-bold text-black">K</div>
      <div>
        <h1 class="text-base font-semibold text-text-primary">Koryphaios</h1>
        <p class="text-xs text-text-muted">
          {wsStore.koryPhase ? `Kory: ${wsStore.koryPhase}` : 'AI Agent Orchestrator'}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-4">
      {#if activeAgents.length > 0}
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs">
          <span class="text-text-secondary">{activeAgents.length} active</span>
        </div>
      {/if}
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full {connectionDot}"></div>
        <span class="text-xs text-text-muted capitalize">{wsStore.status}</span>
      </div>
    </div>
  </div>

  <!-- Provider Hub & Workers -->
  <div class="window-chrome overflow-y-auto" style="grid-area: providers;">
    <div class="window-titlebar">
      <span class="traffic-light close"></span>
      <span class="traffic-light minimize"></span>
      <span class="traffic-light maximize"></span>
      <span class="text-xs text-text-muted ml-2">Providers & Workers</span>
    </div>
    <div class="p-3 space-y-3">
      <ProviderHub />
      {#each activeAgents as agent (agent.identity.id)}
        <WorkerCard {agent} />
      {/each}
    </div>
  </div>

  <!-- Main Feed -->
  <div class="window-chrome flex flex-col" style="grid-area: feed;">
    <div class="window-titlebar">
      <span class="traffic-light close"></span>
      <span class="traffic-light minimize"></span>
      <span class="traffic-light maximize"></span>
      <span class="text-xs text-text-muted ml-2">Agent Feed</span>
    </div>
    <ManagerFeed />
  </div>

  <!-- Terminal / Diff Split -->
  <div class="window-chrome flex flex-col" style="grid-area: terminal;">
    <div class="window-titlebar">
      <span class="traffic-light close"></span>
      <span class="traffic-light minimize"></span>
      <span class="traffic-light maximize"></span>
      <span class="text-xs text-text-muted ml-2">Terminal & Diffs</span>
      <div class="ml-auto flex gap-1">
        <button onclick={() => bottomTab = 'terminal'} class="px-2 py-0.5 text-[10px] rounded {bottomTab === 'terminal' ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary'}">Terminal</button>
        <button onclick={() => bottomTab = 'diffs'} class="px-2 py-0.5 text-[10px] rounded {bottomTab === 'diffs' ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary'}">Diffs</button>
      </div>
    </div>
    {#if bottomTab === 'terminal'}
      <div class="flex-1 overflow-y-auto p-3 font-mono text-xs text-text-secondary">
        {#each wsStore.feed.filter(e => e.type === 'tool_result' || e.type === 'tool_call') as entry (entry.id)}
          <div class="mb-2 {entry.type === 'tool_call' ? 'text-accent' : (entry.text.startsWith('Tool error') ? 'text-error' : 'text-success')}">
            <span class="text-text-muted">{new Date(entry.timestamp).toLocaleTimeString()}</span>
            {entry.text}
          </div>
        {/each}
      </div>
    {:else}
      <DiffViewer sessionId={currentSessionId} />
    {/if}
  </div>

  <!-- Command Input -->
  <div style="grid-area: input;">
    <CommandInput onSend={handleSend} />
  </div>
</div>

<PermissionDialog />
