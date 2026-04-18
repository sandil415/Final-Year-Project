<script>
  import pb from '$lib/pocketbase';
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { CameraIcon, MapPinIcon, CheckCircleIcon, ArrowRightIcon, ArrowLeftIcon } from 'phosphor-svelte';

  // ── Auth state ────────────────────────────────────────────────────
  // We deliberately do NOT redirect to /auth/login here.
  // After email verification the user lands on this page but PocketBase
  // confirmVerification does not auto-login — so authStore.isValid is
  // false. Instead we show an inline prompt to log in first.
  let user = /** @type {any} */ (null);
  let authChecked = false;   // true once onMount has run
  let notLoggedIn = false;   // true when we know user is not authenticated

  // ── Step state ────────────────────────────────────────────────────
  let step = 1; // 1 = avatar + bio, 2 = location
  let saving = false;
  let error = '';

  // Step 1
  let avatarFile = /** @type {File|null} */ (null);
  let avatarPreview = /** @type {string|null} */ (null);
  let bio = '';

  // Step 2
  let locationAddress = '';
  let locationLat = /** @type {number|null} */ (null);
  let locationLng = /** @type {number|null} */ (null);
  let mapContainer = /** @type {HTMLElement|null} */ (null);
  let map = /** @type {any} */ (null);
  let marker = /** @type {any} */ (null);
  let geocoding = false;
  let mapReady = false;

  // ── Inline login (shown when user lands here unauthenticated) ─────
  let loginEmail = '';
  let loginPassword = '';
  let loginError = '';
  let loginLoading = false;

  onMount(() => {
    if (pb.authStore.isValid && pb.authStore.model) {
      user = pb.authStore.record ?? pb.authStore.model;
      bio             = user.bio             || '';
      locationAddress = user.locationAddress || '';
      locationLat     = user.locationLat     || null;
      locationLng     = user.locationLng     || null;
      if (user.avatar) avatarPreview = pb.files.getUrl(user, user.avatar);
    } else {
      // Not logged in — try to pre-fill email from localStorage
      try {
        loginEmail = localStorage.getItem('fiestra_pending_email') || '';
      } catch (_) {}
      notLoggedIn = true;
    }
    authChecked = true;
  });

  // ── Inline login ──────────────────────────────────────────────────
  async function loginAndContinue() {
    loginError = '';
    if (!loginEmail.trim()) { loginError = 'Please enter your email address.'; return; }
    if (!loginPassword)     { loginError = 'Please enter your password.'; return; }
    loginLoading = true;
    try {
      const authData = await pb.collection('users').authWithPassword(
        loginEmail.trim(),
        loginPassword
      );
      user = authData.record;
      bio             = user.bio             || '';
      locationAddress = user.locationAddress || '';
      locationLat     = user.locationLat     || null;
      locationLng     = user.locationLng     || null;
      if (user.avatar) avatarPreview = pb.files.getUrl(user, user.avatar);
      notLoggedIn = false;
    } catch (e) {
      const err = /** @type {any} */ (e);
      if (err?.status === 400)
        loginError = 'Incorrect email or password. Please try again.';
      else if (err?.status === 0 || err?.status === 503)
        loginError = 'Cannot reach the server. Please check your connection.';
      else
        loginError = 'Login failed. Please try again.';
    } finally {
      loginLoading = false;
    }
  }

  // ── Avatar ────────────────────────────────────────────────────────
  function handleAvatarFile(e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const file = input.files?.[0];
    if (!file) return;
    avatarFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      avatarPreview = /** @type {string} */ (ev.target?.result ?? null);
    };
    reader.readAsDataURL(file);
  }

  function removeAvatar() {
    avatarFile = null;
    avatarPreview = null;
  }

  // ── Step 2: Map ───────────────────────────────────────────────────
  async function enterStep2() {
    step = 2;
    await tick();
    loadLeaflet();
  }

  function loadLeaflet() {
    if (typeof (/** @type {any} */ (window)).L !== 'undefined') {
      initMap();
      return;
    }
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = initMap;
    document.head.appendChild(script);
  }

  function initMap() {
    if (!mapContainer) return;
    const L = /** @type {any} */ (window).L;
    if (!L) return;

    const lat = locationLat ?? 27.7172;
    const lng = locationLng ?? 85.3240;

    map = L.map(mapContainer, {
      center: [lat, lng],
      zoom: locationLat ? 15 : 13,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: '',
      html: `<div style="
        width:28px;height:28px;
        background:#FF6B35;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.25);
      "></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });

    if (locationLat && locationLng) {
      marker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
      marker.on('dragend', (/** @type {any} */ e) => {
        const pos = e.target.getLatLng();
        reverseGeocode(pos.lat, pos.lng);
      });
    }

    map.on('click', (/** @type {any} */ e) => {
      const clat = e.latlng.lat;
      const clng = e.latlng.lng;
      locationLat = clat;
      locationLng = clng;
      if (marker) {
        marker.setLatLng([clat, clng]);
      } else {
        marker = L.marker([clat, clng], { icon: pinIcon, draggable: true }).addTo(map);
        marker.on('dragend', (/** @type {any} */ ev) => {
          const pos = ev.target.getLatLng();
          reverseGeocode(pos.lat, pos.lng);
        });
      }
      reverseGeocode(clat, clng);
    });

    if (!locationLat && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { map.setView([pos.coords.latitude, pos.coords.longitude], 15); },
        () => {}
      );
    }

    mapReady = true;
  }

  async function reverseGeocode(lat, lng) {
    geocoding = true;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`
      );
      const data = await res.json();
      locationAddress = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (_) {
      locationAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } finally {
      geocoding = false;
    }
  }

  // ── Save ──────────────────────────────────────────────────────────
  async function saveProfile() {
    if (!user) return;
    saving = true;
    error = '';
    try {
      const fd = new FormData();
      fd.append('bio', bio.trim());
      fd.append('locationAddress', locationAddress.trim());
      if (locationLat !== null)  fd.append('locationLat',  String(locationLat));
      if (locationLng !== null) fd.append('locationLng', String(locationLng));
      if (avatarFile) fd.append('avatar', avatarFile);

      const updated = await pb.collection('users').update(user.id, fd);
      pb.authStore.save(pb.authStore.token, updated);
      // Clean up the stash
      try { localStorage.removeItem('fiestra_pending_email'); } catch (_) {}
      goto('/home');
    } catch (e) {
      const err = /** @type {any} */ (e);
      if (err?.status === 400)
        error = 'Some fields are invalid. Please check your input.';
      else if (err?.status === 403)
        error = 'You do not have permission to update this profile.';
      else
        error = 'Failed to save your profile. You can update it later in Settings.';
      saving = false;
    }
  }

  function skip() {
    try { localStorage.removeItem('fiestra_pending_email'); } catch (_) {}
    goto('/home');
  }
</script>

<div class="min-h-screen bg-background flex flex-col">

  <!-- Top bar with progress -->
  <div class="border-b border-border flex-shrink-0">
    <div class="max-w-lg mx-auto px-6 py-4 flex items-center gap-4">
      <span class="text-base font-bold tracking-tight text-foreground flex-shrink-0">FIESTRA</span>
      {#if !notLoggedIn}
        <div class="flex-1 flex items-center gap-1">
          <div class="flex-1 h-1.5 rounded-full overflow-hidden bg-muted">
            <div
              class="h-full rounded-full transition-all duration-500"
              style="width:{step === 1 ? 50 : 100}%;background:#FF6B35;"
            ></div>
          </div>
        </div>
        <span class="text-xs text-muted-foreground flex-shrink-0">Step {step} of 2</span>
      {/if}
    </div>
  </div>

  <div class="flex-1 flex items-start justify-center px-4 py-10">
    <div class="w-full max-w-lg">

      <!-- ════════ NOT LOGGED IN — inline login prompt ════════ -->
      {#if authChecked && notLoggedIn}
        <div class="text-center mb-8">
          <!-- Verified success badge -->
          <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
            style="background:#16a34a15;">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M6 16l7 7 13-13" stroke="#16a34a" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1 class="text-2xl font-bold mb-2 text-foreground">Email verified!</h1>
          <p class="text-muted-foreground text-sm leading-relaxed mb-6">
            Log in to finish setting up your profile.
          </p>
        </div>

        {#if loginError}
          <div class="w-full bg-red-50 border border-red-300 text-red-700
                      px-4 py-3 rounded-xl mb-4 text-sm">
            {loginError}
          </div>
        {/if}

        <input
          type="email"
          placeholder="Email"
          bind:value={loginEmail}
          autocomplete="email"
          class="auth-input-white mb-4"
        />
        <input
          type="password"
          placeholder="Password"
          bind:value={loginPassword}
          autocomplete="current-password"
          class="auth-input-white mb-6"
        />

        <button
          class="w-full py-3 rounded-xl font-semibold text-white hover:opacity-90
                 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          style="background-color:#FF6B35;"
          on:click={loginAndContinue}
          disabled={loginLoading}
        >
          {#if loginLoading}
            <span class="flex items-center justify-center gap-2">
              <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Logging in…
            </span>
          {:else}
            Log in and continue
          {/if}
        </button>

        <p class="text-xs text-muted-foreground text-center mt-4">
          You can also
          <a href="/home" class="underline" style="color:#FF6B35;">skip this for now</a>
          and set up your profile later in Settings.
        </p>

      <!-- ════════ LOADING STATE ════════ -->
      {:else if !authChecked}
        <div class="flex items-center justify-center py-20">
          <div class="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style="border-color:#FF6B35;border-top-color:transparent;"></div>
        </div>

      <!-- ════════ STEP 1: Avatar + Bio ════════ -->
      {:else if step === 1}
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold mb-2 text-foreground">Set up your profile</h1>
          <p class="text-muted-foreground text-sm leading-relaxed">
            Add a photo and tell the community about yourself.
          </p>
        </div>

        <!-- Avatar upload -->
        <div class="flex flex-col items-center mb-8">
          <div class="relative">
            <label class="cursor-pointer block">
              <div
                class="w-28 h-28 rounded-full border-2 overflow-hidden bg-muted
                       flex items-center justify-center transition-all duration-200
                       hover:border-[#FF6B35]"
                class:border-border={!avatarPreview}
                class:border-transparent={!!avatarPreview}
              >
                {#if avatarPreview}
                  <img src={avatarPreview} alt="Preview" class="w-full h-full object-cover" />
                {:else}
                  <div class="flex flex-col items-center gap-1.5 text-muted-foreground select-none">
                    <CameraIcon size={28} weight="duotone" />
                    <span class="text-xs font-medium">Add photo</span>
                  </div>
                {/if}
              </div>
              <input type="file" accept="image/*" class="hidden" on:change={handleAvatarFile} />
            </label>

            {#if avatarPreview}
              <label
                class="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center
                       justify-center border-2 border-background cursor-pointer
                       hover:opacity-90 transition-opacity"
                style="background:#FF6B35;"
              >
                <CameraIcon size={15} color="white" weight="bold" />
                <input type="file" accept="image/*" class="hidden" on:change={handleAvatarFile} />
              </label>
            {/if}
          </div>

          {#if avatarPreview}
            <button
              class="mt-2 text-xs text-muted-foreground hover:text-red-500 transition-colors"
              on:click={removeAvatar}
            >
              Remove photo
            </button>
          {:else}
            <p class="mt-2 text-xs text-muted-foreground">Tap to upload a profile photo</p>
          {/if}
        </div>

        <!-- Bio -->
        <div class="mb-8">
          <label class="block text-sm font-semibold text-foreground mb-1.5">
            Bio <span class="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            rows="4"
            placeholder="Tell people about yourself — what you cook, what you love to eat, your favourite Nepali dish…"
            bind:value={bio}
            maxlength="200"
            class="w-full rounded-xl border border-border bg-background px-4 py-3
                   text-foreground placeholder:text-muted-foreground focus:outline-none
                   focus:ring-2 focus:ring-[#FF6B35]/50 resize-none text-sm leading-relaxed"
          ></textarea>
          <div class="flex justify-between mt-1">
            <span class="text-xs text-muted-foreground">Shown on your profile</span>
            <span class="text-xs text-muted-foreground">{bio.length}/200</span>
          </div>
        </div>

        <div class="flex gap-3">
          <button
            class="flex-1 border border-border py-3 rounded-xl text-sm font-medium
                   hover:bg-muted transition-colors text-foreground"
            on:click={skip}
          >
            Skip for now
          </button>
          <button
            class="flex-1 py-3 rounded-xl text-white font-semibold text-sm
                   hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            style="background-color:#FF6B35;"
            on:click={enterStep2}
          >
            Next: Add location
            <ArrowRightIcon size={15} weight="bold" />
          </button>
        </div>

      <!-- ════════ STEP 2: Location ════════ -->
      {:else}
        <div class="mb-5">
          <button
            class="flex items-center gap-1.5 text-sm text-muted-foreground
                   hover:text-foreground transition-colors mb-4"
            on:click={() => (step = 1)}
          >
            <ArrowLeftIcon size={14} weight="bold" />
            Back
          </button>
          <h1 class="text-2xl font-bold mb-1.5 text-foreground">Your location</h1>
          <p class="text-muted-foreground text-sm leading-relaxed">
            Tap the map to pin your default delivery address.
            This will pre-fill the address field when you order.
          </p>
        </div>

        <!-- Map -->
        <div
          class="rounded-2xl overflow-hidden border border-border mb-4 relative"
          style="height:320px;"
        >
          <div bind:this={mapContainer} class="w-full h-full"></div>

          {#if !mapReady}
            <div class="absolute inset-0 bg-muted flex items-center justify-center">
              <div class="flex flex-col items-center gap-2 text-muted-foreground">
                <div class="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                  style="border-color:#FF6B35;border-top-color:transparent;"></div>
                <span class="text-xs">Loading map…</span>
              </div>
            </div>
          {:else if !locationLat}
            <div class="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none
                        px-3 py-2 rounded-xl text-xs font-medium text-white"
              style="background:rgba(0,0,0,0.6);">
              Tap anywhere on the map to set your location
            </div>
          {/if}
        </div>

        <!-- Address input -->
        <div class="mb-6">
          <label class="flex items-center gap-1.5 text-sm font-semibold text-foreground mb-1.5">
            <MapPinIcon size={14} style="color:#FF6B35;" />
            Delivery address
          </label>
          <div class="relative">
            <input
              type="text"
              placeholder="Tap the map above, or type your address…"
              bind:value={locationAddress}
              class="w-full rounded-xl border border-border bg-background px-4 py-3 pr-10
                     text-foreground placeholder:text-muted-foreground focus:outline-none
                     focus:ring-2 focus:ring-[#FF6B35]/50 text-sm"
            />
            {#if geocoding}
              <div class="absolute right-3 top-1/2 -translate-y-1/2">
                <div class="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style="border-color:#FF6B35;border-top-color:transparent;"></div>
              </div>
            {/if}
          </div>

          {#if locationLat}
            <p class="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
              <CheckCircleIcon size={11} weight="fill" style="color:#16a34a;" />
              Location pinned: {locationLat.toFixed(5)}, {locationLng !== null ? locationLng.toFixed(5) : ''}
            </p>
          {/if}
        </div>

        {#if error}
          <div class="w-full bg-red-50 border border-red-300 text-red-700
                      px-4 py-3 rounded-xl mb-4 text-sm">
            {error}
          </div>
        {/if}

        <div class="flex gap-3">
          <button
            class="flex-1 border border-border py-3 rounded-xl text-sm font-medium
                   hover:bg-muted transition-colors text-foreground"
            on:click={skip}
          >
            Skip for now
          </button>
          <button
            class="flex-1 py-3 rounded-xl text-white font-semibold text-sm
                   hover:opacity-90 transition-opacity disabled:opacity-50
                   flex items-center justify-center gap-2"
            style="background-color:#FF6B35;"
            disabled={saving}
            on:click={saveProfile}
          >
            {#if saving}
              <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Saving…
            {:else}
              Finish setup →
            {/if}
          </button>
        </div>
      {/if}

    </div>
  </div>
</div>