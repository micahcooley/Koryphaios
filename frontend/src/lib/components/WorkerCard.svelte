<!--
  WorkerCard.svelte — Individual agent status card with domain-specific neon glow.
-->
<script lang="ts">
  import type { AgentIdentity, AgentStatus } from '@koryphaios/shared';

  interface AgentState {
    identity: AgentIdentity;
    status: AgentStatus;
    content: string;
    thinking: string;
    toolCalls: Array<{ name: string; status: string }>;
    task: string;
  }

  let { agent }: { agent: AgentState } = $props();

  let glowClass = $derived(
    agent.identity.domain === 'ui' ? 'glow-codex' :
    agent.identity.domain === 'backend' ? 'glow-gemini' :
    agent.identity.domain === 'test' ? 'glow-test' :
    'glow-claude'
  );

  let statusText = $derived(
    agent.status === 'thinking' ? 'Thinking...' :
    agent.status === 'streaming' ? 'Generating...' :
    agent.status === 'tool_calling' ? `Tool: ${agent.toolCalls.at(-1)?.name ?? '...'}` :
    agent.status === 'verifying' ? 'Verifying...' :
    agent.status === 'done' ? 'Complete' :
    agent.status === 'error' ? 'Error' :
    'Idle'
  );

  let statusColor = $derived(
    agent.status === 'done' ? 'text-success' :
    agent.status === 'error' ? 'text-error' :
    agent.status === 'idle' ? 'text-text-muted' :
    'text-text-primary'
  );

  let isActive = $derived(
    agent.status === 'thinking' || agent.status === 'streaming' || agent.status === 'tool_calling'
  );
</script>

<div class="p-3 rounded-lg border border-border bg-surface-2 transition-all duration-300 {isActive ? `${glowClass} glow-active` : ''}">
  <div class="flex items-center justify-between mb-2">
    <div class="flex items-center gap-2">
      <div class="w-2 h-2 rounded-full {isActive ? 'bg-green-400 animate-pulse' : agent.status === 'done' ? 'bg-green-600' : 'bg-surface-4'}"></div>
      <span class="text-sm font-medium text-text-primary">{agent.identity.name}</span>
    </div>
    <span class="text-xs text-text-muted">{agent.identity.model.split('-').slice(0, 2).join('-')}</span>
  </div>

  <div class="flex items-center justify-between">
    <span class="text-xs {statusColor}">{statusText}</span>
    <span class="text-xs text-text-muted capitalize px-1.5 py-0.5 rounded bg-surface-3">{agent.identity.domain}</span>
  </div>

  {#if agent.task}
    <p class="text-xs text-text-muted mt-2 line-clamp-2">{agent.task.slice(0, 120)}</p>
  {/if}

  {#if agent.toolCalls.length > 0}
    <div class="mt-2 flex flex-wrap gap-1">
      {#each agent.toolCalls.slice(-3) as tc}
        <span class="text-xs px-1.5 py-0.5 rounded bg-surface-3 text-accent">{tc.name}</span>
      {/each}
    </div>
  {/if}
</div>
