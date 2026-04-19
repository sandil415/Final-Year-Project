<script>
  import { onMount } from 'svelte';
  import pb from '$lib/pocketbase';

  // email must be read inside onMount / reactively — NOT at module level.
  // Reading $page.url at module initialisation is unreliable with SSR disabled
  // because the page store may not have hydrated yet.
  let email = '';
  let resending = false, resent = false, resendError = '';

  onMount(() => {
    // Primary: query param passed from signup page
    const params = new URLSearchParams(window.location.search);
    email = params.get('email') || '';

    // Fallback: localStorage stash written during signup
    if (!email) {
      try { email = localStorage.getItem('fiestra_pending_email') || ''; } catch (_) {}
    }
  });

  /** Parse PocketBase errors clearly. */
  function parseResendError(e) {
    const err = /** @type {any} */ (e);
    if (err?.status === 400)
      return 'We could not find an account with that email address.';
    if (err?.status === 429)
      return 'Too many attempts. Please wait a moment before trying again.';
    if (err?.status === 0 || err?.status === 503)
      return 'Cannot reach the server. Please check your connection.';
    return 'Failed to resend the email. Please try again.';
  }

  async function resend() {
    if (!email) {
      resendError = 'No email address found. Please go back and sign up again.';
      return;
    }
    resending = true;
    resendError = '';
    resent = false;
    try {
      await pb.collection('users').requestVerification(email);
      resent = true;
    } catch (e) {
      resendError = parseResendError(e);
    } finally {
      resending = false;
    }
  }
</script>

<div class="min-h-screen bg-background flex items-center justify-center px-4">
  <div class="max-w-md w-full text-center">

    <!-- Envelope icon -->
    <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
      style="background:#FF6B3512;">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="10" width="32" height="22" rx="3"
          stroke="#FF6B35" stroke-width="2" fill="none"/>
        <path d="M4 14l16 10 16-10" stroke="#FF6B35" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <h1 class="text-2xl font-bold mb-3 text-foreground">Check your email</h1>

    <p class="text-muted-foreground mb-2 leading-relaxed">
      We sent a verification link to
    </p>
    {#if email}
      <p class="font-semibold text-foreground mb-1 text-lg break-all">{email}</p>
    {/if}
    <p class="text-sm text-muted-foreground mt-3 mb-8 leading-relaxed max-w-sm mx-auto">
      Click the link in that email to verify your account and continue
      setting up your profile. The link expires in 72 hours.
    </p>

    <!-- Progress steps -->
    <div class="flex items-center justify-center gap-4 mb-8">
      <div class="flex flex-col items-center gap-1.5">
        <div class="w-8 h-8 rounded-full flex items-center justify-center
                    text-white text-xs font-bold" style="background:#FF6B35;">
          1
        </div>
        <span class="text-xs text-muted-foreground">Verify email</span>
      </div>
      <div class="flex-1 max-w-10 h-px bg-border"></div>
      <div class="flex flex-col items-center gap-1.5">
        <div class="w-8 h-8 rounded-full flex items-center justify-center
                    text-xs font-bold border border-border text-muted-foreground">
          2
        </div>
        <span class="text-xs text-muted-foreground">Set up profile</span>
      </div>
      <div class="flex-1 max-w-10 h-px bg-border"></div>
      <div class="flex flex-col items-center gap-1.5">
        <div class="w-8 h-8 rounded-full flex items-center justify-center
                    text-xs font-bold border border-border text-muted-foreground">
          3
        </div>
        <span class="text-xs text-muted-foreground">Start exploring</span>
      </div>
    </div>

    <!-- Resend section -->
    {#if resent}
      <div class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
        style="background:#16a34a15;color:#16a34a;">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8l3.5 3.5 6.5-6.5" stroke="#16a34a" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Verification email resent!
      </div>
    {:else}
      {#if resendError}
        <p class="text-sm text-red-500 mb-3 max-w-xs mx-auto">{resendError}</p>
      {/if}
      <p class="text-sm text-muted-foreground mb-3">Didn't receive it?</p>
      <button
        class="text-sm text-alert font-semibold underline hover:opacity-70 transition-opacity
               disabled:opacity-40 disabled:cursor-not-allowed"
        on:click={resend}
        disabled={resending}
      >
        {resending ? 'Resending…' : 'Resend verification email'}
      </button>
    {/if}

    <!-- Navigation -->
    <div class="mt-10 pt-6 border-t border-border flex items-center justify-center gap-4
        flex-wrap text-sm text-muted-foreground">
      <a href="/auth/login" class="text-foreground font-bold hover:text-app-primary transition-colors">
        ← Back to login
      </a>
      <span class="font-bold text-border select-none">·</span>
      <a href="/auth/signup" class="text-foreground font-bold hover:text-app-primary transition-colors">
        Use a different email
      </a>
    </div>
  </div>
</div>