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
{:else if provider === 'google' || provider === 'gemini'}
  <!-- Google "G" Logo (2025 Gradient) - Raw Source from Wikimedia -->
  <svg width={size} height={size} viewBox="0 0 268.1522 273.8827" fill="none" class={className} xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
      <linearGradient id="kgoog_a"><stop offset="0" stop-color="#0fbc5c"/><stop offset="1" stop-color="#0cba65"/></linearGradient>
      <linearGradient id="kgoog_g"><stop offset=".2312727" stop-color="#0fbc5f"/><stop offset=".3115468" stop-color="#0fbc5f"/><stop offset=".3660131" stop-color="#0fbc5e"/><stop offset=".4575163" stop-color="#0fbc5d"/><stop offset=".540305" stop-color="#12bc58"/><stop offset=".6993464" stop-color="#28bf3c"/><stop offset=".7712418" stop-color="#38c02b"/><stop offset=".8605665" stop-color="#52c218"/><stop offset=".9150327" stop-color="#67c30f"/><stop offset="1" stop-color="#86c504"/></linearGradient>
      <linearGradient id="kgoog_h"><stop offset=".1416122" stop-color="#1abd4d"/><stop offset=".2475151" stop-color="#6ec30d"/><stop offset=".3115468" stop-color="#8ac502"/><stop offset=".3660131" stop-color="#a2c600"/><stop offset=".4456735" stop-color="#c8c903"/><stop offset=".540305" stop-color="#ebcb03"/><stop offset=".6156363" stop-color="#f7cd07"/><stop offset=".6993454" stop-color="#fdcd04"/><stop offset=".7712418" stop-color="#fdce05"/><stop offset=".8605661" stop-color="#ffce0a"/></linearGradient>
      <linearGradient id="kgoog_f"><stop offset=".3159041" stop-color="#ff4c3c"/><stop offset=".6038179" stop-color="#ff692c"/><stop offset=".7268366" stop-color="#ff7825"/><stop offset=".884534" stop-color="#ff8d1b"/><stop offset="1" stop-color="#ff9f13"/></linearGradient>
      <linearGradient id="kgoog_b"><stop offset=".2312727" stop-color="#ff4541"/><stop offset=".3115468" stop-color="#ff4540"/><stop offset=".4575163" stop-color="#ff4640"/><stop offset=".540305" stop-color="#ff473f"/><stop offset=".6993464" stop-color="#ff5138"/><stop offset=".7712418" stop-color="#ff5b33"/><stop offset=".8605665" stop-color="#ff6c29"/><stop offset="1" stop-color="#ff8c18"/></linearGradient>
      <linearGradient id="kgoog_d"><stop offset=".4084578" stop-color="#fb4e5a"/><stop offset="1" stop-color="#ff4540"/></linearGradient>
      <linearGradient id="kgoog_c"><stop offset=".1315461" stop-color="#0cba65"/><stop offset=".2097843" stop-color="#0bb86d"/><stop offset=".2972969" stop-color="#09b479"/><stop offset=".3962575" stop-color="#08ad93"/><stop offset=".4771242" stop-color="#0aa6a9"/><stop offset=".5684245" stop-color="#0d9cc6"/><stop offset=".667385" stop-color="#1893dd"/><stop offset=".7687273" stop-color="#258bf1"/><stop offset=".8585063" stop-color="#3086ff"/></linearGradient>
      <linearGradient id="kgoog_e"><stop offset=".3660131" stop-color="#ff4e3a"/><stop offset=".4575163" stop-color="#ff8a1b"/><stop offset=".540305" stop-color="#ffa312"/><stop offset=".6156363" stop-color="#ffb60c"/><stop offset=".7712418" stop-color="#ffcd0a"/><stop offset=".8605665" stop-color="#fecf0a"/><stop offset=".9150327" stop-color="#fecf08"/><stop offset="1" stop-color="#fdcd01"/></linearGradient>
      <linearGradient xlink:href="#kgoog_a" id="kgoog_s" x1="219.6997" y1="329.5351" x2="254.4673" y2="329.5351" gradientUnits="userSpaceOnUse"/>
      <radialGradient xlink:href="#kgoog_b" id="kgoog_m" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-1.936885,1.043001,1.455731,2.555422,290.5254,-400.6338)" cx="109.6267" cy="135.8619" fx="109.6267" fy="135.8619" r="71.46001"/>
      <radialGradient xlink:href="#kgoog_c" id="kgoog_n" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-3.512595,-4.45809,-1.692547,1.260616,870.8006,191.554)" cx="45.25866" cy="279.2738" fx="45.25866" fy="279.2738" r="71.46001"/>
      <radialGradient xlink:href="#kgoog_d" id="kgoog_l" cx="304.0166" cy="118.0089" fx="304.0166" fy="118.0089" r="47.85445" gradientTransform="matrix(2.064353,-4.926832e-6,-2.901531e-6,2.592041,-297.6788,-151.7469)" gradientUnits="userSpaceOnUse"/>
      <radialGradient xlink:href="#kgoog_e" id="kgoog_o" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-0.2485783,2.083138,2.962486,0.3341668,-255.1463,-331.1636)" cx="181.001" cy="177.2013" fx="181.001" fy="177.2013" r="71.46001"/>
      <radialGradient xlink:href="#kgoog_f" id="kgoog_p" cx="207.6733" cy="108.0972" fx="207.6733" fy="108.0972" r="41.1025" gradientTransform="matrix(-1.249206,1.343263,-3.896837,-3.425693,880.5011,194.9051)" gradientUnits="userSpaceOnUse"/>
      <radialGradient xlink:href="#kgoog_g" id="kgoog_r" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-1.936885,-1.043001,1.455731,-2.555422,290.5254,838.6834)" cx="109.6267" cy="135.8619" fx="109.6267" fy="135.8619" r="71.46001"/>
      <radialGradient xlink:href="#kgoog_h" id="kgoog_j" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-0.081402,-1.93722,2.926737,-0.1162508,-215.1345,632.8606)" cx="154.8697" cy="145.9691" fx="154.8697" fy="145.9691" r="71.46001"/>
      <filter id="kgoog_q" x="-.04842873" y="-.0582241" width="1.096857" height="1.116448" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.700914"/></filter>
      <filter id="kgoog_k" x="-.01670084" y="-.01009856" width="1.033402" height="1.020197" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation=".2419367"/></filter>
      <clipPath clipPathUnits="userSpaceOnUse" id="kgoog_i">
        <path d="M371.3784 193.2406H237.0825v53.4375h77.167c-1.2405 7.5627-4.0259 15.0024-8.1049 21.7862-4.6734 7.7723-10.4511 13.6895-16.373 18.1957-17.7389 13.4983-38.42 16.2584-52.7828 16.2584-36.2824 0-67.2833-23.2865-79.2844-54.9287-.4843-1.1482-.8059-2.3344-1.1975-3.5068-2.652-8.0533-4.101-16.5825-4.101-25.4474 0-9.226 1.5691-18.0575 4.4301-26.3985 11.2851-32.8967 42.9849-57.4674 80.1789-57.4674 7.4811 0 14.6854.8843 21.5173 2.6481 15.6135 4.0309 26.6578 11.9698 33.4252 18.2494l40.834-39.7111c-24.839-22.616-57.2194-36.3201-95.8444-36.3201-30.8782-.00066-59.3863 9.55308-82.7477 25.6992-18.9454 13.0941-34.4833 30.6254-44.9695 50.9861-9.75366 18.8785-15.09441 39.7994-15.09441 62.2934 0 22.495 5.34891 43.6334 15.10261 62.3374v.126c10.3023 19.8567 25.3678 36.9537 43.6783 49.9878 15.9962 11.3866 44.6789 26.5516 84.0307 26.5516 22.6301 0 42.6867-4.0517 60.3748-11.6447 12.76-5.4775 24.0655-12.6217 34.3012-21.8036 13.5247-12.1323 24.1168-27.1388 31.3465-44.4041 7.2297-17.2654 11.097-36.7895 11.097-57.957 0-9.858-.9971-19.8694-2.6881-28.9684Z"/>
      </clipPath>
    </defs>
    <g transform="matrix(0.957922,0,0,0.985255,-90.17436,-78.85577)">
      <g clip-path="url(#kgoog_i)">
        <path d="M92.07563 219.9585c.14844 22.14 6.5014 44.983 16.11767 63.4234v.1269c6.9482 13.3919 16.4444 23.9704 27.2604 34.4518l65.326-23.67c-12.3593-6.2344-14.2452-10.0546-23.1048-17.0253-9.0537-9.0658-15.8015-19.4735-20.0038-31.677h-.1693l.1693-.1269c-2.7646-8.0587-3.0373-16.6129-3.1393-25.5029Z" fill="url(#kgoog_j)" filter="url(#kgoog_k)"/>
        <path d="M237.0835 79.02491c-6.4568 22.52569-3.988 44.42139 0 57.16129 7.4561.0055 14.6388.8881 21.4494 2.6464 15.6135 4.0309 26.6566 11.97 33.424 18.2496l41.8794-40.7256c-24.8094-22.58904-54.6663-37.2961-96.7528-37.33169Z" fill="url(#kgoog_l)" filter="url(#kgoog_k)"/>
        <path d="M236.9434 78.84678c-31.6709-.00068-60.9107 9.79833-84.8718 26.35902-8.8968 6.149-17.0612 13.2521-24.3311 21.1509-1.9045 17.7429 14.2569 39.5507 46.2615 39.3702 15.5284-17.9373 38.4946-29.5427 64.0561-29.5427.0233 0 .046.0019.0693.002l-1.0439-57.33536c-.0472-.00003-.0929-.00406-.1401-.00406Z" fill="url(#kgoog_m)" filter="url(#kgoog_k)"/>
        <path d="m341.4751 226.3788-28.2685 19.2848c-1.2405 7.5627-4.0278 15.0023-8.1068 21.7861-4.6734 7.7723-10.4506 13.6898-16.3725 18.196-17.7022 13.4704-38.3286 16.2439-52.6877 16.2553-14.8415 25.1018-17.4435 37.6749 1.0439 57.9342 22.8762-.0167 43.157-4.1174 61.0458-11.7965 12.9312-5.551 24.3879-12.7913 34.7609-22.0964 13.7061-12.295 24.4421-27.5034 31.7688-45.0003 7.3267-17.497 11.2446-37.2822 11.2446-58.7336Z" fill="url(#kgoog_n)" filter="url(#kgoog_k)"/>
        <path d="M234.9956 191.2104v57.4981h136.0062c1.1962-7.8745 5.1523-18.0644 5.1523-26.5001 0-9.858-.9963-21.899-2.6873-30.998Z" fill="#3086ff" filter="url(#kgoog_k)"/>
        <path d="M128.3894 124.3268c-8.393 9.1191-15.5632 19.326-21.2483 30.3646-9.75351 18.8785-15.09402 41.8295-15.09402 64.3235 0 .317.02642.6271.02855.9436 4.31953 8.2244 59.66647 6.6495 62.45617 0-.0035-.3103-.0387-.6128-.0387-.9238 0-9.226 1.5696-16.0262 4.4306-24.3672 3.5294-10.2885 9.0557-19.7628 16.1223-27.9257 1.6019-2.0309 5.8748-6.3969 7.1214-9.0157.4749-.9975-.8621-1.5574-.9369-1.9085-.0836-.3927-1.8762-.0769-2.2778-.3694-1.2751-.9288-3.8001-1.4138-5.3334-1.8449-3.2772-.9215-8.7085-2.9536-11.7252-5.0601-9.5357-6.6586-24.417-14.6122-33.5047-24.2164Z" fill="url(#kgoog_o)" filter="url(#kgoog_k)"/>
        <path d="M162.0989 155.8569c22.1123 13.3013 28.4714-6.7139 43.173-12.9771L179.698 90.21568c-9.4075 3.92642-18.2957 8.80465-26.5426 14.50442-12.316 8.5122-23.192 18.8995-32.1763 30.7204Z" fill="url(#kgoog_p)" filter="url(#kgoog_q)"/>
        <path d="M171.0987 290.222c-29.6829 10.6413-34.3299 11.023-37.0622 29.2903 5.2213 5.0597 10.8312 9.74 16.7926 13.9835 15.9962 11.3867 46.766 26.5517 86.1178 26.5517.0462 0 .0904-.004.1366-.004v-59.1574c-.0298.0001-.064.002-.0938.002-14.7359 0-26.5113-3.8435-38.5848-10.5273-2.9768-1.6479-8.3775 2.7772-11.1229.799-3.7865-2.7284-12.8991 2.3508-16.1833-.9378Z" fill="url(#kgoog_r)" filter="url(#kgoog_k)"/>
        <path d="M219.6997 299.0227v59.9959c5.506.6402 11.2361 1.0289 17.2472 1.0289 6.0259 0 11.8556-.3073 17.5204-.8723v-59.7481c-6.3482 1.0777-12.3272 1.461-17.4776 1.461-5.9318 0-11.7005-.6858-17.29-1.8654Z" opacity=".5" fill="url(#kgoog_s)" filter="url(#kgoog_k)"/>
      </g>
    </g>
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
  <!-- xAI Official Logo (scaled up) -->
  <svg width={size * 1.3} height={size * 1.3} viewBox="0 0 842 595.28" fill="none" class={className} style="overflow: visible;">
    <g fill="currentColor" style="color: var(--color-text-primary);">
      <polygon points="557.09,211.99 565.4,538.36 631.96,538.36 640.28,93.18"/>
      <polygon points="640.28,56.91 538.72,56.91 379.35,284.53 430.13,357.05"/>
      <polygon points="201.61,538.36 303.17,538.36 353.96,465.84 303.17,393.31"/>
      <polygon points="201.61,211.99 430.13,538.36 531.69,538.36 303.17,211.99"/>
    </g>
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
