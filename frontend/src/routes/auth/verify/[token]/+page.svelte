<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import pb from '$lib/pocketbase';

  let status = 'verifying'; // 'verifying' | 'success' | 'error'
  let message = '';
  let countdown = 3;
  let timer;

  onMount(async () => {
    const token = $page.params.token;
    try {
      await pb.collection('users').confirmVerification(token);
      status = 'success';
      message = 'Your email has been verified!';
      // Countdown then redirect
      timer = setInterval(() => {
        countdown -= 1;
        if (countdown <= 0) {
          clearInterval(timer);
          window.location.href = '/auth/setupProfile';
        }
      }, 1000);
    } catch (err) {
      status = 'error';
      message = 'Verification failed. The link may have expired or already been used.';
      console.error(err);
    }

    return () => { if (timer) clearInterval(timer); };
  });
</script>

<div class="min-h-screen bg-background flex items-center justify-center px-4">
  <div class="text-center p-8 max-w-sm w-full">

    {#if status === 'verifying'}
      <!-- Spinner -->
      <div class="w-16 h-16 mx-auto mb-6 flex items-center justify-center">
        <div class="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
          style="border-color:#FF6B35;border-top-color:transparent;"></div>
      </div>
      <h1 class="text-xl font-semibold text-foreground mb-2">Verifying your email…</h1>
      <p class="text-sm text-muted-foreground">Please wait a moment.</p>

    {:else if status === 'success'}
      <!-- Success tick -->
      <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
        style="background:#16a34a15;">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M8 20l9 9 15-15" stroke="#16a34a" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h1 class="text-2xl font-bold mb-2" style="color:#16a34a;">{message}</h1>
      <p class="text-muted-foreground mb-6 leading-relaxed">
        Redirecting you to profile setup in <strong>{countdown}</strong>…
      </p>
      <!-- Progress bar -->
      <div class="w-full h-1 bg-muted rounded-full overflow-hidden mb-6">
        <div class="h-full rounded-full transition-all duration-1000"
          style="background:#FF6B35;width:{((3 - countdown) / 3) * 100}%;"></div>
      </div>
      <a href="/auth/setupProfile"
        class="inline-block px-6 py-2.5 rounded-xl text-white text-sm font-semibold
               hover:opacity-90 transition-opacity"
        style="background-color:#FF6B35;">
        Continue to profile setup →
      </a>

    {:else}
      <!-- Error -->
      <div class="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
        style="background:#EF444415;">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M12 12l16 16M28 12L12 28" stroke="#EF4444" stroke-width="2.5"
            stroke-linecap="round"/>
        </svg>
      </div>
      <h1 class="text-2xl font-bold text-red-500 mb-3">Verification failed</h1>
      <p class="text-muted-foreground mb-6 leading-relaxed">{message}</p>
      <div class="flex flex-col gap-2 items-center">
        <a href="/auth/signup"
          class="inline-block px-6 py-2.5 rounded-xl text-white text-sm font-semibold
                 hover:opacity-90 transition-opacity w-full text-center"
          style="background-color:#FF6B35;">
          Sign up again
        </a>
        <a href="/auth/login"
          class="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Already verified? Log in
        </a>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }
</style>