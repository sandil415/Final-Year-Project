<script>
  import pb from '$lib/pocketbase';
  import { goto } from '$app/navigation';
  import { EyeIcon, EyeSlashIcon, CheckCircleIcon, XCircleIcon } from 'phosphor-svelte';

  let email = '', password = '', username = '', error = '', loading = false;
  let showPassword = false, passwordFocused = false;

  $: checks = {
    length:  password.length >= 8,
    upper:   /[A-Z]/.test(password),
    lower:   /[a-z]/.test(password),
    number:  /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  $: strengthScore = Object.values(checks).filter(Boolean).length;
  $: strengthLabel = ['', 'Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][strengthScore] || '';
  $: strengthColor =
    strengthScore <= 1 ? '#EF4444' :
    strengthScore === 2 ? '#F97316' :
    strengthScore === 3 ? '#EAB308' :
    strengthScore === 4 ? '#22C55E' : '#16A34A';

  const checkLabels = [
    { key: 'length',  label: 'At least 8 characters' },
    { key: 'upper',   label: 'One uppercase letter'   },
    { key: 'lower',   label: 'One lowercase letter'   },
    { key: 'number',  label: 'One number'             },
    { key: 'special', label: 'One special character'  },
  ];

  /** Turn PocketBase errors into plain English. No "Failed to create record" nonsense. */
  function parseError(e) {
    const err = /** @type {any} */ (e);
    const data = err?.data?.data ?? err?.data ?? {};

    if (data?.email?.code === 'validation_not_unique')
      return 'That email address is already registered. Try logging in instead.';
    if (data?.username?.code === 'validation_not_unique')
      return 'That username is already taken. Please choose a different one.';
    if (data?.email?.code === 'validation_required')
      return 'Email address is required.';
    if (data?.password?.code === 'validation_length_out_of_range')
      return 'Password must be at least 8 characters long.';
    if (err?.status === 400)
      return 'Please check your details and try again.';
    if (err?.status === 429)
      return 'Too many attempts. Please wait a moment and try again.';
    if (err?.status === 0 || err?.status === 503)
      return 'Cannot reach the server. Please check your connection.';

    const msg = err?.message || '';
    if (msg && !msg.toLowerCase().includes('failed to') && msg.length < 120)
      return msg;

    return 'Something went wrong. Please try again.';
  }

  async function signup() {
    error = '';
    if (!username.trim()) { error = 'Please enter a username.'; return; }
    if (!email.trim())    { error = 'Please enter your email address.'; return; }
    if (!password)        { error = 'Please enter a password.'; return; }
    if (strengthScore < 3) { error = 'Your password is too weak. Please make it stronger.'; return; }

    loading = true;
    try {
      // ── Handle unverified duplicate email ─────────────────────────
      // If the user signed up before but never clicked the verification
      // link, their unverified record blocks re-registration.
      // We detect this and delete the stale unverified record first.
      try {
        const stale = await pb.collection('users').getFirstListItem(
          `email = "${email.trim()}" && verified = false`
        );
        await pb.collection('users').delete(stale.id);
      } catch (_) {
        // 404 = no stale record found, or other error — both fine, continue
      }

      // ── Create the account ─────────────────────────────────────────
      await pb.collection('users').create({
        email:           email.trim(),
        password,
        passwordConfirm: password,
        username:        username.trim(),
        accountType:     'personal',
      });

      // ── Request email verification ─────────────────────────────────
      await pb.collection('users').requestVerification(email.trim());

      // Stash email so the verify-pending page has it even across refreshes
      try { localStorage.setItem('fiestra_pending_email', email.trim()); } catch (_) {}

      goto(`/auth/verify-pending?email=${encodeURIComponent(email.trim())}`);
    } catch (e) {
      error = parseError(e);
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex min-h-screen">
  <!-- Image panel (desktop only) -->
  <div class="hidden md:block w-1/2 h-screen overflow-hidden flex-shrink-0">
    <img src="/images/Signup.jpg" alt="" class="h-full w-full object-cover" />
  </div>

  <!-- Form panel -->
  <div class="flex w-full md:w-1/2 justify-center items-center bg-background overflow-y-auto py-8">
    <div class="flex flex-col items-start w-full max-w-md px-10">

      <!-- Brand -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold tracking-tight text-foreground">FIESTRA</h1>
        <p class="text-xs font-medium tracking-wider mt-0.5" style="color:#FF6B35;">
          Explore Nepali Cuisines with Us
        </p>
      </div>

      <h2 class="title mb-2">Create an account</h2>
      <p class="text-muted-foreground leading-relaxed mb-8">
        Join a community where anyone can cook,
        discover dishes, or start selling their own.
      </p>

      {#if error}
        <div class="w-full bg-red-50 border border-red-300 text-red-700
                    px-4 py-3 rounded-xl mb-4 text-sm">
          {error}
        </div>
      {/if}

      <input
        type="text"
        placeholder="Username"
        bind:value={username}
        autocomplete="username"
        class="auth-input-white mb-4"
      />

      <input
        type="email"
        placeholder="Email"
        bind:value={email}
        autocomplete="email"
        class="auth-input-white mb-4"
      />

      <!-- Password + visibility toggle -->
      <div class="relative w-full mb-2">
        <input
          type={showPassword ? 'text' : 'password'}
          placeholder="Password"
          bind:value={password}
          autocomplete="new-password"
          on:focus={() => (passwordFocused = true)}
          on:blur={() => (passwordFocused = false)}
          class="auth-input-white pr-12"
        />
        <button
          type="button"
          class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
                 hover:text-gray-600 transition-colors"
          on:click={() => (showPassword = !showPassword)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {#if showPassword}<EyeSlashIcon size={20} />{:else}<EyeIcon size={20} />{/if}
        </button>
      </div>

      <!-- Password strength meter -->
      {#if password.length > 0}
        <div class="w-full mb-6">
          <div class="flex items-center gap-2 mb-2">
            <div class="flex-1 flex gap-0.5">
              {#each Array(5) as _, i}
                <div
                  class="flex-1 h-1.5 rounded-full transition-all duration-300"
                  style="background-color:{i < strengthScore ? strengthColor : 'hsl(var(--muted))'};"
                ></div>
              {/each}
            </div>
            <span class="text-xs font-semibold flex-shrink-0" style="color:{strengthColor};">
              {strengthLabel}
            </span>
          </div>
          {#if passwordFocused || strengthScore < 5}
            <ul class="space-y-1 mt-1">
              {#each checkLabels as c}
                <li class="flex items-center gap-2 text-xs transition-colors
                           {checks[c.key] ? 'text-green-600' : 'text-muted-foreground'}">
                  {#if checks[c.key]}
                    <CheckCircleIcon size={13} weight="fill" />
                  {:else}
                    <XCircleIcon size={13} />
                  {/if}
                  {c.label}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else}
        <div class="mb-6"></div>
      {/if}

      <button
        class="w-full py-3 rounded-xl font-semibold text-white hover:opacity-90
               transition-opacity mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
        style="background-color:#FF6B35;"
        on:click={signup}
        disabled={loading}
      >
        {#if loading}
          <span class="flex items-center justify-center gap-2">
            <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Creating account…
          </span>
        {:else}
          Sign Up
        {/if}
      </button>

      <div class="flex items-center gap-4 mb-6 w-full">
        <div class="h-px flex-1 bg-border"></div>
        <span class="text-sm text-muted-foreground">OR</span>
        <div class="h-px flex-1 bg-border"></div>
      </div>

      <p class="text-sm text-muted-foreground">
        Already have an account?
        <a href="/auth/login" class="underline ml-1" style="color:#FF6B35;">Log in</a>
      </p>
    </div>
  </div>
</div>