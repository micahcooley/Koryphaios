<!--
  SessionSidebar.svelte — Session list with create/delete.
-->
<script lang="ts">
  import type { Session } from '@koryphaios/shared';

  let { currentSessionId = $bindable('') }: { currentSessionId: string } = $props();
  let sessions = $state<Session[]>([]);

  $effect(() => {
    loadSessions();
  });

  async function loadSessions() {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.ok) sessions = data.data;
    } catch {}
  }

  async function createSession() {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Session ${sessions.length + 1}` }),
      });
      const data = await res.json();
      if (data.ok) {
        sessions = [data.data, ...sessions];
        currentSessionId = data.data.id;
      }
    } catch {}
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      sessions = sessions.filter(s => s.id !== id);
      if (currentSessionId === id) {
        currentSessionId = sessions[0]?.id ?? '';
      }
    } catch {}
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="flex flex-col h-full">
  <div class="window-titlebar">
    <span class="traffic-light close"></span>
    <span class="traffic-light minimize"></span>
    <span class="traffic-light maximize"></span>
    <span class="text-xs text-text-muted ml-2">Sessions</span>
  </div>

  <div class="p-2">
    <button
      onclick={createSession}
      class="w-full py-2 px-3 text-xs text-text-primary bg-surface-3 hover:bg-surface-4 rounded-lg transition-colors flex items-center justify-center gap-1"
    >
      <span class="text-lg leading-none">+</span> New Session
    </button>
  </div>

  <div class="flex-1 overflow-y-auto px-2 space-y-1">
    {#each sessions as session (session.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        onclick={() => currentSessionId = session.id}
        onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') currentSessionId = session.id; }}
        role="button"
        tabindex="0"
        class="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors group cursor-pointer {currentSessionId === session.id ? 'bg-accent/15 border border-accent/30 text-text-primary' : 'hover:bg-surface-3 text-text-secondary'}"
      >
        <div class="flex items-center justify-between">
          <span class="truncate font-medium">{session.title}</span>
          <button
            onclick={(e: MouseEvent) => { e.stopPropagation(); deleteSession(session.id); }}
            class="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-all text-sm"
          >×</button>
        </div>
        <div class="flex items-center gap-2 mt-0.5 text-text-muted">
          <span>{formatTime(session.updatedAt)}</span>
          {#if session.totalCost > 0}
            <span>· ${session.totalCost.toFixed(3)}</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
