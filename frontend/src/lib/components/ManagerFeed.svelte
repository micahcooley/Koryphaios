<!--
  ManagerFeed.svelte — Kory's live thought stream with auto-scroll.
  Uses Svelte 5 runes for reactive updates. Virtual-scroll aware.
-->
<script lang="ts">
  import { wsStore, type FeedEntry } from '$lib/stores/websocket.svelte';
  import { tick } from 'svelte';

  let feedContainer: HTMLDivElement;
  let autoScroll = $state(true);
  let filter = $state<string>('all');

  let filteredFeed = $derived(
    filter === 'all'
      ? wsStore.feed
      : wsStore.feed.filter(e => e.type === filter)
  );

  // Auto-scroll on new entries
  $effect(() => {
    const _len = filteredFeed.length;
    if (autoScroll && feedContainer) {
      tick().then(() => {
        feedContainer.scrollTop = feedContainer.scrollHeight;
      });
    }
  });

  function handleScroll() {
    if (!feedContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = feedContainer;
    autoScroll = scrollHeight - scrollTop - clientHeight < 100;
  }

  function getEntryIcon(type: FeedEntry['type']): string {
    switch (type) {
      case 'thought': return '💭';
      case 'content': return '📝';
      case 'thinking': return '🧠';
      case 'tool_call': return '🔧';
      case 'tool_result': return '📦';
      case 'routing': return '🔀';
      case 'error': return '❌';
      case 'system': return '⚡';
      default: return '•';
    }
  }

  function getEntryColor(type: FeedEntry['type']): string {
    switch (type) {
      case 'thought': return 'text-yellow-400';
      case 'content': return 'text-text-primary';
      case 'thinking': return 'text-blue-400/70';
      case 'tool_call': return 'text-accent';
      case 'tool_result': return 'text-green-400';
      case 'routing': return 'text-yellow-300';
      case 'error': return 'text-red-400';
      case 'system': return 'text-text-muted';
      default: return 'text-text-secondary';
    }
  }
</script>

<div class="flex flex-col flex-1 overflow-hidden">
  <!-- Filter Tabs -->
  <div class="flex gap-1 px-3 py-2 border-b border-border bg-surface-2/50">
    {#each ['all', 'thought', 'content', 'tool_call', 'tool_result', 'error'] as f}
      <button
        class="px-2 py-1 text-xs rounded-md transition-colors {filter === f ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-secondary hover:bg-surface-3'}"
        onclick={() => filter = f}
      >
        {f === 'all' ? 'All' : f.replace('_', ' ')}
      </button>
    {/each}
  </div>

  <!-- Feed Content -->
  <div
    bind:this={feedContainer}
    onscroll={handleScroll}
    class="flex-1 overflow-y-auto p-3 space-y-1"
  >
    {#if filteredFeed.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-text-muted">
        <div class="text-4xl mb-3">🎵</div>
        <p class="text-sm">Waiting for vibes...</p>
        <p class="text-xs mt-1">Send a message to start Kory</p>
      </div>
    {:else}
      {#each filteredFeed as entry (entry.id)}
        <div class="flex gap-2 py-1 text-sm leading-relaxed group hover:bg-surface-2/30 rounded px-2 -mx-2 transition-colors">
          <!-- Timestamp -->
          <span class="text-xs text-text-muted shrink-0 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>

          <!-- Agent indicator -->
          {#if entry.glowClass}
            <span class="w-1.5 h-1.5 rounded-full mt-2 shrink-0 {entry.glowClass === 'glow-kory' ? 'bg-yellow-400' : entry.glowClass === 'glow-codex' ? 'bg-cyan-400' : entry.glowClass === 'glow-gemini' ? 'bg-purple-500' : entry.glowClass === 'glow-claude' ? 'bg-orange-400' : 'bg-green-400'}"></span>
          {/if}

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <span class="text-xs font-medium {entry.glowClass === 'glow-kory' ? 'text-yellow-400' : 'text-text-secondary'}">
              {entry.agentName}
            </span>
            <span class="text-xs mx-1">{getEntryIcon(entry.type)}</span>
            <span class="{getEntryColor(entry.type)} break-words">
              {entry.text}
            </span>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Auto-scroll indicator -->
  {#if !autoScroll}
    <button
      onclick={() => { autoScroll = true; feedContainer.scrollTop = feedContainer.scrollHeight; }}
      class="absolute bottom-16 right-6 px-3 py-1.5 rounded-full bg-accent text-white text-xs shadow-lg hover:bg-accent-hover transition-colors"
    >
      ↓ New messages
    </button>
  {/if}
</div>
