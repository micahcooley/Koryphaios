<script lang="ts">
  interface Props {
    provider: string;
    size?: number;
    class?: string;
  }

  let { provider, size = 16, class: className = '' }: Props = $props();
</script>

<!-- Brand SVG icons for each LLM provider -->
{#if provider === 'anthropic'}
  <!-- Claude / Anthropic -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <path d="M13.827 3.52l5.924 16.96H23L16.827 3.52h-3zm-7.654 0L0 20.48h3.249l1.425-4.16h7.252l1.425 4.16h3.249L10.427 3.52h-4.254zm.913 10.08l2.564-7.49 2.564 7.49H7.086z" fill="#D97757"/>
  </svg>
{:else if provider === 'openai'}
  <!-- OpenAI -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.042 6.042 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.516 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="#10A37F"/>
  </svg>
{:else if provider === 'gemini'}
  <!-- Google Gemini -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <path d="M12 24C12 20.8 11.1 18.15 9.3 16.05C7.65 14.1 5.4 12.75 2.55 12C5.4 11.25 7.65 9.9 9.3 7.95C11.1 5.85 12 3.2 12 0C12 3.2 12.9 5.85 14.7 7.95C16.35 9.9 18.6 11.25 21.45 12C18.6 12.75 16.35 14.1 14.7 16.05C12.9 18.15 12 20.8 12 24Z" fill="url(#gemini-grad-{size})"/>
    <defs>
      <linearGradient id="gemini-grad-{size}" x1="2.55" y1="12" x2="21.45" y2="12" gradientUnits="userSpaceOnUse">
        <stop stop-color="#4285F4"/>
        <stop offset="0.5" stop-color="#9B72CB"/>
        <stop offset="1" stop-color="#D96570"/>
      </linearGradient>
    </defs>
  </svg>
{:else if provider === 'copilot'}
  <!-- GitHub Copilot -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" fill="currentColor" style="color: var(--color-text-primary);"/>
  </svg>
{:else if provider === 'openrouter'}
  <!-- OpenRouter -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <path d="M4 4h16v2H4V4zm0 7h16v2H4v-2zm0 7h16v2H4v-2z" fill="#6366F1"/>
    <circle cx="20" cy="5" r="3" fill="#818CF8"/>
    <circle cx="4" cy="12" r="3" fill="#818CF8"/>
    <circle cx="20" cy="19" r="3" fill="#818CF8"/>
  </svg>
{:else if provider === 'groq'}
  <!-- Groq -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="#F55036"/>
    <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" fill="#F55036"/>
    <circle cx="12" cy="12" r="2" fill="#F55036"/>
  </svg>
{:else if provider === 'xai'}
  <!-- xAI / Grok -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <path d="M3 3l7.5 9L3 21h2.5l6-7.2L17.5 21H21l-7.5-9L21 3h-2.5l-6 7.2L6.5 3H3z" fill="currentColor" style="color: var(--color-text-primary);"/>
  </svg>
{:else if provider === 'azure'}
  <!-- Azure OpenAI -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <path d="M5.483 21h7.235L8.442 12.41 2 21h3.483zM13.012 3l-2.755 8.516L22 21h-4.028L13.012 3z" fill="#0078D4"/>
  </svg>
{:else if provider === 'bedrock'}
  <!-- AWS Bedrock -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="none" stroke="#FF9900" stroke-width="1.5"/>
    <path d="M12 2v20M3 7l9 5 9-5M3 17l9-5 9 5" fill="none" stroke="#FF9900" stroke-width="1.5"/>
  </svg>
{:else if provider === 'vertexai'}
  <!-- Google Vertex AI -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <path d="M12 2L4 6v12l8 4 8-4V6l-8-4z" fill="#4285F4" opacity="0.3"/>
    <path d="M12 2L4 6l8 4 8-4-8-4z" fill="#4285F4"/>
    <path d="M4 6v12l8 4V10L4 6z" fill="#34A853"/>
    <path d="M20 6v12l-8 4V10l8-4z" fill="#EA4335"/>
  </svg>
{:else if provider === 'local'}
  <!-- Local / Ollama -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <rect x="4" y="4" width="16" height="16" rx="3" stroke="#A78BFA" stroke-width="1.5" fill="none"/>
    <path d="M8 10h8M8 14h5" stroke="#A78BFA" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="17" cy="14" r="1.5" fill="#A78BFA"/>
  </svg>
{:else}
  <!-- Fallback: generic circuit icon -->
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={className}>
    <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5" fill="none" style="color: var(--color-text-muted);"/>
    <circle cx="12" cy="12" r="3" fill="currentColor" style="color: var(--color-text-muted);"/>
  </svg>
{/if}
