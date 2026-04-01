<script>
  import pb from '$lib/pocketbase';

  let email = '';
  let password = '';
  let username = '';
  let error = '';

  async function signup() {
    error = '';
    try {
      const user = await pb.collection('users').create({
        email,
        password,
        passwordConfirm: password,
        username,
        accountType: 'personal'
      });

      console.log('User created', user);

      await pb.collection('users').requestVerification(email);

      alert('Check your email to verify your account!');
    } catch (e) {
      const err = /** @type {any} */ (e);
      if (err.data?.email?.code === 'validation_not_unique') {
        error = 'Email already in use. Try logging in instead.';
      } else if (err instanceof Error) {
        error = err.message;
      } else {
        error = 'Signup failed';
      }
    }
  }

</script>

<div class="flex min-h-screen">
  <!-- FORM PANEL -->
  <div class="flex w-full md:w-1/2 justify-center items-center bg-background">
    <div class="flex flex-col items-start w-full max-w-md p-12">
      <h1 class="title mb-2">Create an account</h1>

      <p class="text-muted-foreground leading-relaxed mb-8">
        Join a community where anyone can cook,
        discover dishes, or start selling their own.
      </p>

      {#if error}
        <div class="w-full bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      {/if}

      <input
        type="text"
        placeholder="Username"
        bind:value={username}
        class="w-full rounded-lg border border-border bg-white
              px-4 py-3 text-black placeholder:text-gray-500
              focus:outline-none focus:ring-2 focus:ring-primary mb-4"
      />

      <input
        type="email"
        placeholder="Email"
        bind:value={email}
        class="w-full rounded-lg border border-border bg-white
              px-4 py-3 text-black placeholder:text-gray-500
              focus:outline-none focus:ring-2 focus:ring-primary mb-4"
      />

      <input
        type="password"
        placeholder="Password"
        bind:value={password}
        class="w-full rounded-lg border border-border bg-white
              px-4 py-3 text-black placeholder:text-gray-500
              focus:outline-none focus:ring-2 focus:ring-primary mb-8"
      />

      <button
        class="w-full bg-primary text-primary-foreground
              py-3 rounded-lg font-medium
              hover:bg-app-primary transition-colors mb-6"
        on:click={signup}
      >
        Sign Up
      </button>

      <p class="text-sm text-muted-foreground">
        Already have an account?
        <a href="/auth/login" class="text-primary underline ml-1">
          Log in
        </a>
      </p>

      <!-- <button
        class="text-sm text-primary underline mt-2"
        on:click={forgetPassword}
      >
        Forgot password?
      </button> -->
    </div>
  </div>

  <!-- IMAGE PANEL -->
  <div class="hidden md:flex w-1/2 object-cover h-screen items-center justify-center bg-primary">
    <img src="/images/Signup.jpg" alt="Right visual"
>
  </div>
</div>