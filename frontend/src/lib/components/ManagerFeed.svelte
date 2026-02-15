<script lang="ts">
  import { wsStore } from '$lib/stores/websocket.svelte';
  import { tick } from 'svelte';
  import { 
    MessageSquare, 
    Brain, 
    FileText, 
    Wrench, 
    Box, 
    ArrowRightLeft, 
    AlertCircle, 
    Zap,
    Send,
    Search,
    Filter,
    ArrowDown,
  } from 'lucide-svelte';

  type FeedEntryType = "user_message" | "thought" | "content" | "thinking" | "tool_call" | "tool_result" | "routing" | "error" | "system";

  interface FeedEntryLocal {
    id: string;
    timestamp: number;
    type: FeedEntryType;
    agentId: string;
    agentName: string;
    glowClass: string;
    text: string;
    metadata?: Record<string, unknown>;
  }

  let feedContainer: HTMLDivElement;
  let autoScroll = $state(true);

  let filteredFeed = $derived(wsStore.feed as FeedEntryLocal[]);

  $effect(() => {
    const len = filteredFeed.length;
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

  function getEntryIcon(type: FeedEntryType) {
    switch (type) {
      case 'user_message': return Send;
      case 'thought': return Brain;
      case 'content': return MessageSquare;
      case 'thinking': return MessageSquare;
      case 'tool_call': return Wrench;
      case 'tool_result': return Box;
      case 'routing': return ArrowRightLeft;
      case 'error': return AlertCircle;
      case 'system': return Zap;
      default: return MessageSquare;
    }
  }

  function getEntryColor(type: FeedEntryType): string {
    switch (type) {
      case 'user_message': return 'text-accent font-medium';
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
  <div class="panel-header">
    <span class="panel-title">
      <MessageSquare size={14} />
      Agent Feed
    </span>
    {#if !autoScroll}
      <button
        onclick={() => { autoScroll = true; feedContainer.scrollTop = feedContainer.scrollHeight; }}
        class="btn btn-secondary"
        style="padding: 4px 8px; font-size: 10px;"
      >
        <ArrowDown size={10} class="inline mr-1" />Scroll to bottom
      </button>
    {/if}
  </div>

  <div
    bind:this={feedContainer}
    onscroll={handleScroll}
    class="flex-1 overflow-y-auto p-3 space-y-1"
  >
    {#if filteredFeed.length === 0}
      <div class="empty-state">
        <MessageSquare size={32} class="empty-state-icon" />
        <p class="text-sm">Ready for your request</p>
        <p class="text-xs mt-1">Type a message below to get started</p>
      </div>
    {:else}
      {#each filteredFeed as entry (entry.id)}
        {@const EntryIcon = getEntryIcon(entry.type)}
        <div class="flex gap-2 py-1 text-sm leading-relaxed group hover:bg-surface-2/30 rounded px-2 -mx-2 transition-colors {entry.type === 'user_message' ? 'feed-user-message' : ''}">
          <span class="text-xs text-text-muted shrink-0 pt-0.5 w-16">
            {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>

          {#if entry.glowClass}
            <span class="w-1.5 h-1.5 rounded-full mt-2 shrink-0 {entry.glowClass === 'glow-kory' ? 'bg-yellow-400' : entry.glowClass === 'glow-codex' ? 'bg-cyan-400' : entry.glowClass === 'glow-gemini' ? 'bg-purple-500' : entry.glowClass === 'glow-claude' ? 'bg-orange-400' : 'bg-green-400'}"></span>
          {:else if entry.type === 'user_message'}
            <span class="w-1.5 h-1.5 rounded-full mt-2 shrink-0 bg-accent"></span>
          {:else}
            <span class="w-1.5 h-1.5 rounded-full mt-2 shrink-0 bg-surface-4"></span>
          {/if}

          <div class="flex-1 min-w-0">
            <span class="text-xs font-medium {entry.glowClass === 'glow-kory' ? 'text-yellow-400' : entry.type === 'user_message' ? 'text-accent' : 'text-text-secondary'}">
              {entry.agentName}
            </span>
            <EntryIcon size={12} class="inline mx-1 text-text-muted" />
            <span class="{getEntryColor(entry.type)} break-words">
              {entry.text}
            </span>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
