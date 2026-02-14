<script lang="ts">
  import { wsStore } from "$lib/stores/websocket.svelte";

  // Permission requests from agents
  let pendingPermissions = $state<Array<{
    id: string;
    agentId: string;
    agentName: string;
    toolName: string;
    description: string;
    risk: "low" | "medium" | "high";
    timestamp: number;
  }>>([]);

  // For demo / incoming permissions from WS
  $effect(() => {
    // In production, permission requests come via WebSocket
    // Currently stubbed — will be wired when tool permission system is integrated
  });

  function riskColor(risk: "low" | "medium" | "high"): string {
    switch (risk) {
      case "low": return "text-green-400";
      case "medium": return "text-yellow-400";
      case "high": return "text-red-400";
    }
  }

  function riskBorder(risk: "low" | "medium" | "high"): string {
    switch (risk) {
      case "low": return "border-green-500/30";
      case "medium": return "border-yellow-500/30";
      case "high": return "border-red-500/30";
    }
  }

  function approve(id: string) {
    // Send approval via WS
    if (wsStore.connection?.readyState === 1) {
      wsStore.connection.send(JSON.stringify({
        type: "permission.response",
        id,
        approved: true,
      }));
    }
    pendingPermissions = pendingPermissions.filter((p) => p.id !== id);
  }

  function deny(id: string) {
    if (wsStore.connection?.readyState === 1) {
      wsStore.connection.send(JSON.stringify({
        type: "permission.response",
        id,
        approved: false,
      }));
    }
    pendingPermissions = pendingPermissions.filter((p) => p.id !== id);
  }

  function approveAll() {
    for (const p of pendingPermissions) {
      approve(p.id);
    }
  }
</script>

{#if pendingPermissions.length > 0}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="bg-surface-2 border border-border rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-border flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-yellow-400 animate-pulse"></div>
          <h3 class="text-sm font-semibold text-text-primary">Permission Required</h3>
        </div>
        <span class="text-xs text-text-muted">
          {pendingPermissions.length} pending
        </span>
      </div>

      <!-- Requests -->
      <div class="max-h-80 overflow-y-auto p-4 space-y-3">
        {#each pendingPermissions as perm (perm.id)}
          <div class="p-3 rounded-xl border {riskBorder(perm.risk)} bg-surface-3">
            <div class="flex items-start justify-between mb-2">
              <div>
                <span class="text-xs font-mono text-text-secondary">{perm.agentName}</span>
                <span class="text-text-muted mx-1">→</span>
                <span class="text-xs font-mono font-bold text-text-primary">{perm.toolName}</span>
              </div>
              <span class="text-[10px] uppercase font-bold {riskColor(perm.risk)}">
                {perm.risk} risk
              </span>
            </div>
            <p class="text-xs text-text-secondary leading-relaxed mb-3">
              {perm.description}
            </p>
            <div class="flex gap-2 justify-end">
              <button
                onclick={() => deny(perm.id)}
                class="px-3 py-1 text-xs rounded-lg bg-surface-4 text-text-secondary hover:bg-red-500/20 hover:text-red-400 transition-colors"
              >
                Deny
              </button>
              <button
                onclick={() => approve(perm.id)}
                class="px-3 py-1 text-xs rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
              >
                Approve
              </button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Footer -->
      {#if pendingPermissions.length > 1}
        <div class="px-5 py-3 border-t border-border flex justify-end">
          <button
            onclick={approveAll}
            class="px-4 py-1.5 text-xs rounded-lg bg-accent text-black font-medium hover:bg-accent/80 transition-colors"
          >
            Approve All ({pendingPermissions.length})
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
