<script>
  import pb from '$lib/pocketbase';
  import { goto } from '$app/navigation';
  import { EyeIcon, EyeSlashIcon } from 'phosphor-svelte';

  let email = '';
  let password = '';
  let showPassword = false;
  let error = '';

  async function login() {
    error = '';
    try {
      await pb.collection('users').authWithPassword(email, password);
      goto('/home');
    } catch (err) {
      if (err instanceof Error) {
        error = err.message;
      } else {
        error = 'Login failed';
      }
    }
  }

  async function forgetPassword() {
    if (!email) {
      error = 'Enter your email first';
      return;
    }

    try {
      await pb.collection('users').requestPasswordReset(email);
      alert('Password reset email sent!');
    } catch (err) {
      error = 'Failed to send reset email';
    }
  }
</script>

<div class="flex min-h-screen">
  <!-- IMAGE PANEL -->
  <div class="hidden md:flex w-1/2 h-screen items-center justify-center bg-primary">
    <img
      src="/images/Login.jpg"
      alt="Side visual"
      class="h-screen rounded-2xl"
    />
  </div>

  <!-- FORM PANEL -->
  <div class="flex w-full md:w-1/2 justify-center items-center bg-background">
    <div class="flex flex-col items-start w-full max-w-md p-12">
      <h1 class="title mb-2">Welcome back</h1>
 

      <p class="text-muted-foreground leading-relaxed mb-8">
        Order meals you'll love from everyday cooks.
        Explore, cook, or sell. All in one place.
      </p>

      {#if error}
        <div class="w-full bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      {/if}

      <input
        type="email"
        placeholder="Email"
        bind:value={email}
        class="w-full rounded-lg border border-border bg-white
               px-4 py-3 text-black placeholder:text-gray-500
               focus:outline-none focus:ring-2 focus:ring-primary mb-4"
      />

      <div class="relative flex items-center justify-center w-full mb-4">
        <input
        type={showPassword ? 'text': 'password'}
        placeholder="Password"
        bind:value={password}
        class="w-full rounded-lg border border-border bg-white
               px-4 py-3 text-black placeholder:text-gray-500
               focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <button
          type="button"
          class="absolute right-3 top-1/2 -translate-y-1/2
                text-gray-500 hover:text-gray-700 transition-colors"
          on:click={() => showPassword = !showPassword}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {#if showPassword}
            <EyeSlashIcon size={20} />
          {:else}
            <EyeIcon size={20} />
          {/if}
        </button>
      </div>


      <button
        class="w-full bg-primary text-primary-foreground py-3 rounded-lg font-medium hover:bg-app-primary transition-colors mb-6"
        on:click={login}
      >
        Log In
      </button>

      <!-- OR -->
      <div class="flex items-center gap-4 mb-6 w-full">
        <div class="h-px flex-1 bg-border"></div>
        <span class="text-sm text-muted-foreground">OR</span>
        <div class="h-px flex-1 bg-border"></div>
      </div>

      <p class="text-sm text-muted-foreground">
        Don't have an account?
        <a href="/auth/signup" class="text-primary underline ml-1"> 
          Sign up
        </a>
      </p>

      <button
        class="text-sm text-primary underline"
        on:click={forgetPassword}
      >
        Forgot password?
      </button>

    </div>
  </div>
</div>
