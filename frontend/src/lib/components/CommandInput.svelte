<!--
  CommandInput.svelte — Prompt input with macOS-style styling.
-->
<script lang="ts">
  let { onSend }: { onSend: (message: string) => void } = $props();
  let input = $state('');
  let inputEl: HTMLTextAreaElement;

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function send() {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    input = '';
    // Reset textarea height
    if (inputEl) inputEl.style.height = 'auto';
  }

  function autoResize() {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
  }
</script>

<div class="flex gap-2 p-3 rounded-xl bg-surface-1 border border-border">
  <textarea
    bind:this={inputEl}
    bind:value={input}
    oninput={autoResize}
    onkeydown={handleKeydown}
    placeholder="Send a vibe to Kory... (Enter to send, Shift+Enter for newline)"
    rows="1"
    class="flex-1 bg-surface-2 border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent transition-colors"
  ></textarea>

  <button
    onclick={send}
    disabled={!input.trim()}
    class="px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
  >
    Send
  </button>
</div>
