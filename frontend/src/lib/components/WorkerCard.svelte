<script lang="ts">
  import type { AgentIdentity, AgentStatus } from '@koryphaios/shared';

  interface AgentState {
    identity: AgentIdentity;
    status: AgentStatus;
    content: string;
    thinking: string;
    toolCalls: Array<{ name: string; status: string }>;
    task: string;
    tokensUsed: number;
    contextMax: number;
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

  let isActive = $derived(
    agent.status === 'thinking' || agent.status === 'streaming' || agent.status === 'tool_calling'
  );

  let contextPercent = $derived(
    agent.contextMax > 0 ? Math.min((agent.tokensUsed / agent.contextMax) * 100, 100) : 0
  );

  let contextColor = $derived(
    contextPercent > 80 ? 'bg-red-500' :
    contextPercent > 50 ? 'bg-amber-500' :
    'bg-emerald-500'
  );
</script>

<div class="agent-card rounded-lg border transition-all duration-300 min-w-[180px] max-w-[240px]
            {isActive ? `active ${glowClass} glow-active` : 'opacity-70'}"
     style="background: var(--color-surface-2); border-color: var(--color-border); padding: 10px 12px;">
  <!-- Header -->
  <div class="flex items-center justify-between mb-1.5">
    <div class="flex items-center gap-1.5">
      <div class="w-1.5 h-1.5 rounded-full {isActive ? 'bg-emerald-400 animate-pulse' : agent.status === 'done' ? 'bg-emerald-600' : ''}"
           style="{!isActive && agent.status !== 'done' ? 'background: var(--color-surface-4);' : ''}"></div>
      <span class="text-xs font-medium" style="color: var(--color-text-primary);">{agent.identity.name}</span>
    </div>
    <span class="text-[10px] capitalize px-1.5 py-0.5 rounded" style="background: var(--color-surface-3); color: var(--color-text-muted);">{agent.identity.domain}</span>
  </div>

  <!-- Status -->
  <div class="flex items-center justify-between mb-1.5">
    <span class="text-[11px]" style="color: {agent.status === 'done' ? 'var(--color-success)' : agent.status === 'error' ? 'var(--color-error)' : 'var(--color-text-secondary)'};">
      {statusText}
    </span>
    <span class="text-[10px]" style="color: var(--color-text-muted);">{agent.identity.model.split('-').slice(0, 2).join('-')}</span>
  </div>

  <!-- Context window bar -->
  {#if agent.tokensUsed > 0}
    <div class="mb-1">
      <div class="flex items-center justify-between mb-0.5">
        <span class="text-[9px]" style="color: var(--color-text-muted);">Context</span>
        <span class="text-[9px]" style="color: var(--color-text-muted);">{Math.round(agent.tokensUsed / 1000)}k / {Math.round(agent.contextMax / 1000)}k</span>
      </div>
      <div class="h-1 rounded-full overflow-hidden" style="background: var(--color-surface-4);">
        <div class="h-full rounded-full transition-all {contextColor}" style="width: {contextPercent}%;"></div>
      </div>
    </div>
  {/if}

  <!-- Recent tools -->
  {#if agent.toolCalls.length > 0}
    <div class="flex flex-wrap gap-1 mt-1">
      {#each agent.toolCalls.slice(-2) as tc}
        <span class="text-[10px] px-1 py-0.5 rounded" style="background: var(--color-surface-3); color: var(--color-accent);">{tc.name}</span>
      {/each}
    </div>
  {/if}
</div>
