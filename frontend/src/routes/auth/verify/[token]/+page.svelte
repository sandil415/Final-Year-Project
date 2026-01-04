<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import pb from '$lib/pocketbase';

  let status = 'verifying';
  let message = '';

  onMount(async () => {
    const token = $page.params.token;
    
    try {
      await pb.collection('users').confirmVerification(token);
      status = 'success';
      message = 'Email verified! Redirecting to login...';
      
      setTimeout(() => {
        window.location.href = '/auth/login';
      }, 2000);
      
    } catch (err) {
      status = 'error';
      message = 'Verification failed. Link may be expired.';
      console.error(err);
    }
  });
</script>

<div class="flex min-h-screen items-center justify-center bg-background">
  <div class="text-center p-8">
    {#if status === 'verifying'}
      <p class="text-xl">Verifying your email...</p>
    {:else if status === 'success'}
      <h1 class="text-3xl font-bold text-green-600 mb-4">✓ Success!</h1>
      <p class="text-lg">{message}</p>
    {:else}
      <h1 class="text-3xl font-bold text-red-600 mb-4">✗ Error</h1>
      <p class="text-lg">{message}</p>
      <a href="/auth/signup" class="text-primary underline mt-4 inline-block">
        Request new verification email
      </a>
    {/if}
  </div>
</div>