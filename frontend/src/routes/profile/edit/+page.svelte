<script>
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import { theme } from '$lib/theme';
  import {
    UserCircleIcon, ShieldCheckIcon, PaintBrushIcon,
    StorefrontIcon, CreditCardIcon, ArrowLeftIcon,
    ArrowRightIcon, UploadIcon, CheckCircleIcon,
    WarningCircleIcon, XCircleIcon, ClockIcon,
    SignOutIcon, TrashIcon, SunIcon, MoonIcon,
    DesktopIcon, CaretRightIcon, PackageIcon,
    ChefHatIcon, TruckIcon, ForkKnifeIcon,
    ArrowUpIcon, ArrowDownIcon, SpinnerGapIcon,
    MapPinIcon, NavigationArrowIcon, PencilSimpleIcon,
    HeartIcon,
  } from 'phosphor-svelte';

  // ── State ────────────────────────────────────────────────────────────────────
  let user = null;
  let loading = true;
  let activePage = 'hub';

  // Personal info
  let username = '', bio = '', avatar = null, avatarPreview = null, avatarName = 'No file chosen';
  let canChangeUsername = true, nextUsernameChangeDate = null;
  let savingProfile = false;

  // Location
  let locationLat = null;
  let locationLng = null;
  let locationAddress = '';
  let showLocationMap = false;
  let locationMapContainer = null;
  let locationMap = null;
  let locationMarker = null;
  let geocoding = false;
  let savingLocation = false;
  let gpsLoading = false;

  // Security
  let oldPassword = '', newPassword = '', confirmPassword = '';
  let showDeleteModal = false, deletePassword = '', deleteError = '';

  // Business
  let isBusiness = false;
  let businessName = '', businessType = 'home_chef', businessDescription = '', businessPhone = '', businessAddress = '';
  let existingApplication = null, submittingApplication = false;
  let showBusinessModal = false;
  let docReg = null, docPan = null, docWard = null, docDftqc = null;

  // Transactions
  let transactions = [];
  let salesOrders  = [];
  let txLoading    = true;
  let txTab        = 'purchases';

  // Favorites
  let favorites = [];
  let favoritesLoading = true;

  // Toast
  let toast = null;
  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => (toast = null), 3500);
  }

  const businessTypes = [
    { value: 'home_chef',  label: 'Home Chef',  icon: ChefHatIcon   },
    { value: 'restaurant', label: 'Restaurant', icon: StorefrontIcon },
    { value: 'food_truck', label: 'Food Truck', icon: TruckIcon      },
    { value: 'catering',   label: 'Catering',   icon: ForkKnifeIcon  },
  ];

  const statusStyle = {
    pending:   { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },
    confirmed: { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },
    preparing: { bg: '#EDE9FE', text: '#5B21B6', dot: '#8B5CF6' },
    ready:     { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
    delivered: { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
    cancelled: { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
    scheduled: { bg: '#EDE9FE', text: '#5B21B6', dot: '#8B5CF6' },
  };

  onMount(async () => {
    requireAuth();
    user = pb.authStore.record ?? pb.authStore.model;
    username = user.username;
    bio = user.bio || '';
    isBusiness = user.accountType === 'business';
    businessName = user.businessName || '';
    businessType = user.businessType || 'home_chef';
    businessDescription = user.businessDescription || '';
    businessPhone = user.businessPhone || '';
    businessAddress = user.businessAddress || '';
    avatarPreview = user.avatar ? pb.files.getUrl(user, user.avatar) : null;

    // Load saved location
    locationLat = user.locationLat || null;
    locationLng = user.locationLng || null;
    locationAddress = user.locationAddress || '';

    checkUsernameEligibility();
    if (!isBusiness) await checkExistingApplication();
    loading = false;
  });

  onDestroy(() => {
    destroyLocationMap();
  });

  // ── Location map ──────────────────────────────────────────────────────────────

  function destroyLocationMap() {
    if (locationMap) {
      locationMap.remove();
      locationMap = null;
      locationMarker = null;
    }
  }

  async function openLocationMap() {
    showLocationMap = true;
    // Wait for DOM to render the map container
    await tick();
    await tick();
    initLocationMap();
  }

  function closeLocationMap() {
    showLocationMap = false;
    destroyLocationMap();
  }

  function initLocationMap() {
    if (!locationMapContainer || locationMap) return;

    // Dynamic import so Leaflet only loads when needed
    import('leaflet').then(({ default: L }) => {
      import('leaflet/dist/leaflet.css').catch(() => {});

      const defaultLat = locationLat ?? 27.7172;
      const defaultLng = locationLng ?? 85.3240;

      locationMap = L.map(locationMapContainer, {
        center: [defaultLat, defaultLng],
        zoom: locationLat ? 15 : 13,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(locationMap);

      // Custom pin icon matching app style
      const pinIcon = L.divIcon({
        className: '',
        html: `<div style="width:32px;height:32px;background:#FF6B35;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      // Place marker at saved location or default
      locationMarker = L.marker([defaultLat, defaultLng], {
        icon: pinIcon,
        draggable: true,
      }).addTo(locationMap);

      // Click on map → move marker + reverse geocode
      locationMap.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        locationMarker.setLatLng([lat, lng]);
        locationLat = lat;
        locationLng = lng;
        await reverseGeocode(lat, lng);
      });

      // Drag marker → reverse geocode on dragend
      locationMarker.on('dragend', async () => {
        const { lat, lng } = locationMarker.getLatLng();
        locationLat = lat;
        locationLng = lng;
        await reverseGeocode(lat, lng);
      });

      // If no saved location, try to show the marker at current address coords
      if (locationLat && locationLng) {
        reverseGeocode(locationLat, locationLng);
      }
    });
  }

  async function reverseGeocode(lat, lng) {
    geocoding = true;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data?.display_name) {
        // Build a concise address: neighbourhood + city/town + country
        const a = data.address || {};
        const parts = [
          a.road || a.neighbourhood || a.suburb,
          a.city || a.town || a.village || a.county,
          a.state,
          a.country,
        ].filter(Boolean);
        locationAddress = parts.length ? parts.join(', ') : data.display_name;
      }
    } catch (_) {
      // Nominatim failed — leave address as-is, user can edit manually
    } finally {
      geocoding = false;
    }
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      showToast('Geolocation not supported by your browser', 'error');
      return;
    }
    gpsLoading = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        locationLat = lat;
        locationLng = lng;

        // If map is open, pan to new position
        if (locationMap && locationMarker) {
          locationMap.setView([lat, lng], 16);
          locationMarker.setLatLng([lat, lng]);
        }

        await reverseGeocode(lat, lng);
        gpsLoading = false;

        // Open map if not already open
        if (!showLocationMap) await openLocationMap();
      },
      (err) => {
        gpsLoading = false;
        showToast('Could not get your location. Please allow location access.', 'error');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function saveLocation() {
    if (!locationLat || !locationLng) {
      showToast('Pin a location on the map first', 'error');
      return;
    }
    savingLocation = true;
    try {
      const updated = await pb.collection('users').update(user.id, {
        locationLat,
        locationLng,
        locationAddress,
      });
      pb.authStore.save(pb.authStore.token, updated);
      user = updated;
      showToast('Location saved ✓');
      closeLocationMap();
    } catch (err) {
      showToast(err?.response?.message || 'Failed to save location', 'error');
    } finally {
      savingLocation = false;
    }
  }

  async function clearLocation() {
    try {
      const updated = await pb.collection('users').update(user.id, {
        locationLat: null,
        locationLng: null,
        locationAddress: '',
      });
      pb.authStore.save(pb.authStore.token, updated);
      user = updated;
      locationLat = null;
      locationLng = null;
      locationAddress = '';
      closeLocationMap();
      showToast('Location removed');
    } catch (err) {
      showToast('Failed to remove location', 'error');
    }
  }

  // ── Username eligibility ──────────────────────────────────────────────────────
  function checkUsernameEligibility() {
    if (!user.usernameLastChanged) return;
    const last = new Date(user.usernameLastChanged);
    const hrs = (Date.now() - last) / 3600000;
    if (hrs < 24) {
      canChangeUsername = false;
      nextUsernameChangeDate = new Date(last.getTime() + 86400000);
    }
  }

  async function checkExistingApplication() {
    try {
      const res = await pb.collection('business_applications').getList(1, 1, {
        filter: `user.id = "${user.id}"`, sort: '-created',
      });
      if (res.items.length) {
        existingApplication = res.items[0];
        if (existingApplication.status === 'approved' && !isBusiness) await activateBusiness();
      }
    } catch (_) { existingApplication = null; }
  }

  async function activateBusiness() {
    const updated = await pb.collection('users').update(user.id, {
      accountType: 'business',
      businessName: existingApplication.businessName,
      businessType: existingApplication.businessType,
      businessDescription: existingApplication.businessDescription,
      businessPhone: existingApplication.businessPhone,
      businessAddress: existingApplication.businessAddress,
    });
    pb.authStore.save(pb.authStore.token, updated);
    isBusiness = true; user = updated;
    showToast('Business account approved! 🎉');
  }

  // ── Transactions ──────────────────────────────────────────────────────────────
  async function loadTransactions() {
    txLoading = true;
    try {
      const [buyRes, sellRes] = await Promise.all([
        pb.collection('orders').getList(1, 100, {
          filter: `buyer.id = "${user.id}"`,
          sort: '-created',
          expand: 'seller',
          requestKey: 'tx-purchases',
        }),
        isBusiness
          ? pb.collection('orders').getList(1, 100, {
              filter: `seller.id = "${user.id}"`,
              sort: '-created',
              expand: 'buyer',
              requestKey: 'tx-sales',
            })
          : Promise.resolve({ items: [] }),
      ]);
      transactions = buyRes.items;
      salesOrders  = sellRes.items;
    } catch (err) {
      console.error(err);
    } finally {
      txLoading = false;
    }
  }

  async function loadFavorites() {
    favoritesLoading = true;
    try {
      const records = await pb.collection('favorites').getFullList({
        filter: `user = "${user.id}"`,
        sort: '-created',
        expand: 'menuItem,menuItem.seller',
        requestKey: 'settings-favorites',
      });
      favorites = records;
    } catch (err) {
      console.error('Failed to load favorites:', err);
      favorites = [];
    } finally {
      favoritesLoading = false;
    }
  }

  async function removeFavorite(favorite) {
    try {
      await pb.collection('favorites').delete(favorite.id);
      favorites = favorites.filter((f) => f.id !== favorite.id);
      showToast('Removed from favourites');
    } catch (err) {
      showToast(err?.response?.message || 'Failed to remove favourite', 'error');
    }
  }

  function navigateTo(page) {
    activePage = page;
    if (page === 'transactions') loadTransactions();
    if (page === 'favorites') loadFavorites();
    // Close location map when navigating away
    if (page !== 'personal') closeLocationMap();
  }

  // ── Avatar ────────────────────────────────────────────────────────────────────
  function handleAvatar(e) {
    avatar = e.target.files[0];
    avatarName = avatar?.name || 'No file chosen';
    if (avatar) {
      const r = new FileReader();
      r.onload = ev => (avatarPreview = ev.target.result);
      r.readAsDataURL(avatar);
    }
  }

  // ── Save profile ──────────────────────────────────────────────────────────────
  async function saveProfile() {
    savingProfile = true;
    const fd = new FormData();
    if (username !== user.username) {
      if (!canChangeUsername) {
        showToast(`Username locked until ${nextUsernameChangeDate?.toLocaleString()}`, 'error');
        savingProfile = false; return;
      }
      fd.append('username', username);
      fd.append('usernameLastChanged', new Date().toISOString());
    }
    fd.append('bio', bio);
    if (avatar) fd.append('avatar', avatar);
    try {
      const updated = await pb.collection('users').update(user.id, fd);
      pb.authStore.save(pb.authStore.token, updated);
      user = updated;
      showToast('Profile saved ✓');
    } catch (err) {
      showToast(err?.response?.message || 'Failed to save', 'error');
    } finally { savingProfile = false; }
  }

  // ── Password ──────────────────────────────────────────────────────────────────
  async function changePassword() {
    if (!oldPassword || !newPassword || !confirmPassword) { showToast('Fill all fields', 'error'); return; }
    if (newPassword !== confirmPassword) { showToast('Passwords do not match', 'error'); return; }
    if (newPassword.length < 8) { showToast('Min 8 characters', 'error'); return; }
    try {
      await pb.collection('users').update(user.id, { oldPassword, password: newPassword, passwordConfirm: confirmPassword });
      showToast('Password changed ✓');
      oldPassword = ''; newPassword = ''; confirmPassword = '';
    } catch (err) { showToast(err?.response?.message || 'Wrong current password', 'error'); }
  }

  // ── Delete account ────────────────────────────────────────────────────────────
  async function deleteAccount() {
    deleteError = '';
    if (!deletePassword) { deleteError = 'Enter your password'; return; }
    try {
      await pb.collection('users').authWithPassword(pb.authStore.model.email, deletePassword);
      await pb.collection('users').delete(pb.authStore.model.id);
      pb.authStore.clear(); goto('/auth/login');
    } catch (err) { deleteError = err?.response?.message || 'Incorrect password'; deletePassword = ''; }
  }

  // ── Business application ──────────────────────────────────────────────────────
  async function submitApplication() {
    if (!businessName.trim()) { showToast('Business name required', 'error'); return; }
    if (!docReg || !docPan || !docWard || !docDftqc) { showToast('All 4 documents required', 'error'); return; }
    submittingApplication = true;
    try {
      const fd = new FormData();
      fd.append('user', user.id);
      fd.append('businessName', businessName.trim());
      fd.append('businessType', businessType);
      fd.append('businessDescription', businessDescription);
      fd.append('businessPhone', businessPhone);
      fd.append('businessAddress', businessAddress);
      fd.append('status', 'pending');
      fd.append('regCertificate', docReg);
      fd.append('panCertificate', docPan);
      fd.append('wardLicense', docWard);
      fd.append('dftqcLicense', docDftqc);
      existingApplication = await pb.collection('business_applications').create(fd);
      showBusinessModal = false;
      showToast('Application submitted ✓');
    } catch (err) { showToast(err?.response?.message || 'Submission failed', 'error'); }
    finally { submittingApplication = false; }
  }

  async function saveBusinessDetails() {
    try {
      const updated = await pb.collection('users').update(user.id, {
        businessName, businessType, businessDescription, businessPhone, businessAddress,
      });
      pb.authStore.save(pb.authStore.token, updated);
      showToast('Business details saved ✓');
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function docName(f) { return f?.name || 'Not chosen'; }
  function logout() { pb.authStore.clear(); goto('/auth/login'); }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtTime(d) {
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function favoriteItem(favorite) {
    return favorite.expand?.menuItem || null;
  }

  function favoriteSeller(item) {
    return item?.expand?.seller || null;
  }

  $: totalSpent = transactions
    .filter(o => o.status === 'delivered')
    .reduce((s, o) => s + (o.totalAmount || 0), 0);
  $: totalEarned = salesOrders
    .filter(o => o.status === 'delivered')
    .reduce((s, o) => s + (o.totalAmount || 0), 0);
  $: activeTxList = txTab === 'purchases' ? transactions : salesOrders;
  $: hasLocation = !!(locationLat && locationLng);
</script>

<!-- ── TOAST ─────────────────────────────────────────────────────────────────── -->
{#if toast}
  <div class="fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold text-white pointer-events-none"
    style={toast.type === 'error' ? 'background:#EF4444;' : 'background:#16a34a;'}>
    {#if toast.type === 'error'}
      <WarningCircleIcon size={16} weight="fill" />
    {:else}
      <CheckCircleIcon size={16} weight="fill" />
    {/if}
    {toast.msg}
  </div>
{/if}

<!-- ── DELETE CONFIRM MODAL ──────────────────────────────────────────────────── -->
{#if showDeleteModal}
  <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="bg-background border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl">
      <div class="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center mb-4">
        <WarningCircleIcon size={28} weight="fill" style="color:#EF4444;" />
      </div>
      <h2 class="text-lg font-bold mb-1">Delete your account?</h2>
      <p class="text-sm text-muted-foreground mb-4">This is permanent. All posts, orders, and data will be erased.</p>
      <input type="password" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-red-300"
        bind:value={deletePassword} placeholder="Confirm your password"
        on:keydown={e => e.key === 'Enter' && deleteAccount()} />
      {#if deleteError}<p class="text-xs text-red-500 mb-3">{deleteError}</p>{/if}
      <div class="flex gap-2 mt-4">
        <button class="flex-1 border border-border py-2.5 rounded-xl text-sm font-medium hover:bg-muted"
          on:click={() => { showDeleteModal = false; deletePassword = ''; deleteError = ''; }}>Cancel</button>
        <button class="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
          on:click={deleteAccount}>Delete forever</button>
      </div>
    </div>
  </div>
{/if}

<!-- ── BUSINESS APPLICATION MODAL ─────────────────────────────────────────── -->
{#if showBusinessModal}
  <div class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
    <div class="bg-background border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl my-8">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#FF6B35;">
          <StorefrontIcon size={20} color="white" weight="fill" />
        </div>
        <div>
          <h2 class="font-bold text-base">Apply for Business Account</h2>
          <p class="text-xs text-muted-foreground">Reviewed within 1–2 business days</p>
        </div>
        <button class="ml-auto p-1.5 hover:bg-muted rounded-lg" on:click={() => showBusinessModal = false}>
          <XCircleIcon size={18} class="text-muted-foreground" />
        </button>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-1">Business name <span class="text-red-500">*</span></label>
          <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm focus:outline-none"
            bind:value={businessName} placeholder="e.g. Momo Palace" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-2">Business type</label>
          <div class="grid grid-cols-2 gap-2">
            {#each businessTypes as bt}
              {@const Icon = bt.icon}
              <button class="flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium text-left transition-all"
                style={businessType === bt.value ? 'background:#FF6B3515;border-color:#FF6B35;color:#FF6B35;' : 'border-color:hsl(var(--border));color:hsl(var(--muted-foreground));'}
                on:click={() => businessType = bt.value}>
                <Icon size={14} />{bt.label}
              </button>
            {/each}
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-1">Description</label>
          <textarea rows="2" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm resize-none" bind:value={businessDescription} placeholder="What makes your food special?" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1">Phone</label>
            <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm" bind:value={businessPhone} placeholder="+977 98..." />
          </div>
          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1">Address</label>
            <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm" bind:value={businessAddress} placeholder="Thamel, Kathmandu" />
          </div>
        </div>

        <div class="border-t border-border pt-4">
          <p class="text-xs font-bold text-foreground mb-1">Required Documents <span class="text-red-500">*</span></p>
          <p class="text-xs text-muted-foreground mb-3">Clear scans or photos. PDF or image accepted.</p>
          <div class="space-y-2">
            {#each [
              { label: 'Company Registration Certificate', key: 'reg', get: () => docReg, set: (f) => docReg = f },
              { label: 'PAN / VAT Certificate',            key: 'pan', get: () => docPan, set: (f) => docPan = f },
              { label: 'Ward / Municipality License',      key: 'ward', get: () => docWard, set: (f) => docWard = f },
              { label: 'DFTQC Food License',               key: 'dftqc', get: () => docDftqc, set: (f) => docDftqc = f },
            ] as doc}
              <div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-border">
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-medium text-foreground">{doc.label}</p>
                  <p class="text-[11px] text-muted-foreground truncate">{docName(doc.get())}</p>
                </div>
                <label class="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
                  style="background:#FF6B35;">
                  <UploadIcon size={11} />Upload
                  <input type="file" accept="image/*,.pdf" class="hidden"
                    on:change={(e) => doc.set(e.target.files[0])} />
                </label>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <div class="flex gap-2 mt-6">
        <button class="flex-1 border border-border py-2.5 rounded-xl text-sm font-medium hover:bg-muted"
          on:click={() => showBusinessModal = false} disabled={submittingApplication}>Cancel</button>
        <button class="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          style="background:#FF6B35;" on:click={submitApplication} disabled={submittingApplication}>
          {submittingApplication ? 'Submitting…' : 'Submit Application →'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ── SHELL ──────────────────────────────────────────────────────────────────── -->
<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />

  <main class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="flex items-center justify-center py-32">
        <SpinnerGapIcon size={32} style="color:#FF6B35;" class="animate-spin" />
      </div>

    <!-- ══════════ HUB ══════════════════════════════════════════════════════════ -->
    {:else if activePage === 'hub'}
      <div class="max-w-lg mx-auto px-4 py-10">

        <div class="flex items-center gap-4 mb-10 p-5 bg-card border border-border rounded-2xl">
          <div class="relative flex-shrink-0">
            <img
              src={avatarPreview || '/images/profilePlaceholder.jpg'}
              alt={user.username}
              class="w-16 h-16 rounded-full object-cover ring-2 ring-border"
            />
            {#if isBusiness}
              <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-background" style="background:#FF6B35;">
                <StorefrontIcon size={12} color="white" weight="fill" />
              </div>
            {/if}
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="font-bold text-lg leading-tight">{user.username}</h2>
            {#if isBusiness}
              <p class="text-xs font-medium mt-0.5" style="color:#FF6B35;">{user.businessName || 'Business Account'}</p>
            {/if}
            <p class="text-xs text-muted-foreground mt-0.5 truncate">{user.bio || 'No bio yet'}</p>
            {#if locationAddress}
              <p class="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                <MapPinIcon size={10} weight="fill" style="color:#FF6B35;flex-shrink:0;" />
                {locationAddress}
              </p>
            {/if}
          </div>
        </div>

        <nav class="space-y-2">
          <button
            class="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-orange-300 dark:hover:border-orange-700 transition-all group text-left"
            on:click={() => navigateTo('personal')}
          >
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#FF6B3515;">
              <UserCircleIcon size={20} style="color:#FF6B35;" weight="duotone" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-sm">Personal Information</p>
              <p class="text-xs text-muted-foreground mt-0.5">Username, bio, profile picture, location</p>
            </div>
            <CaretRightIcon size={16} class="text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </button>

          <button
            class="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-orange-300 dark:hover:border-orange-700 transition-all group text-left"
            on:click={() => navigateTo('security')}
          >
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#3B82F615;">
              <ShieldCheckIcon size={20} style="color:#3B82F6;" weight="duotone" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-sm">Security</p>
              <p class="text-xs text-muted-foreground mt-0.5">Password, account deletion</p>
            </div>
            <CaretRightIcon size={16} class="text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </button>

          <button
            class="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-orange-300 dark:hover:border-orange-700 transition-all group text-left"
            on:click={() => navigateTo('transactions')}
          >
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#10B98115;">
              <CreditCardIcon size={20} style="color:#10B981;" weight="duotone" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-sm">Transaction History</p>
              <p class="text-xs text-muted-foreground mt-0.5">
                {isBusiness ? 'Orders placed & sales received' : 'Your past orders & purchases'}
              </p>
            </div>
            <CaretRightIcon size={16} class="text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </button>

          <button
            class="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-orange-300 dark:hover:border-orange-700 transition-all group text-left"
            on:click={() => navigateTo('favorites')}
          >
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#EF444415;">
              <HeartIcon size={20} style="color:#EF4444;" weight="duotone" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-sm">Favourites</p>
              <p class="text-xs text-muted-foreground mt-0.5">Saved dishes from menus</p>
            </div>
            <CaretRightIcon size={16} class="text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </button>

          <button
            class="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-orange-300 dark:hover:border-orange-700 transition-all group text-left"
            on:click={() => navigateTo('appearance')}
          >
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#8B5CF615;">
              <PaintBrushIcon size={20} style="color:#8B5CF6;" weight="duotone" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-sm">Appearance</p>
              <p class="text-xs text-muted-foreground mt-0.5">Light, dark, or system theme</p>
            </div>
            <CaretRightIcon size={16} class="text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </button>

          {#if isBusiness}
            <button
              class="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-orange-300 dark:hover:border-orange-700 transition-all group text-left"
              on:click={() => navigateTo('business')}
            >
              <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#FF6B3515;">
                <StorefrontIcon size={20} style="color:#FF6B35;" weight="duotone" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm">Business Details</p>
                <p class="text-xs text-muted-foreground mt-0.5">{user.businessName || 'Manage your business info'}</p>
              </div>
              <CaretRightIcon size={16} class="text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
            </button>
          {:else}
            <button
              class="w-full flex items-center gap-4 p-4 bg-card border-2 border-dashed border-border hover:border-orange-300 rounded-2xl transition-all group text-left"
              on:click={() => showBusinessModal = true}
            >
              <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#FF6B3515;">
                <StorefrontIcon size={20} style="color:#FF6B35;" weight="duotone" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm">
                  {existingApplication?.status === 'pending' ? 'Application Under Review' : 'Become a Seller'}
                </p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {existingApplication?.status === 'pending'
                    ? 'We\'ll notify you once approved'
                    : 'Accept orders and grow your food business'}
                </p>
              </div>
              {#if existingApplication?.status === 'pending'}
                <ClockIcon size={16} style="color:#F59E0B;" class="flex-shrink-0" weight="fill" />
              {:else}
                <ArrowRightIcon size={16} class="text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
              {/if}
            </button>
          {/if}

          <div class="pt-2">
            <button
              class="w-full flex items-center gap-4 p-4 rounded-2xl border border-red-200 dark:border-red-950 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left group"
              on:click={logout}
            >
              <div class="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/30 flex items-center justify-center flex-shrink-0">
                <SignOutIcon size={18} style="color:#EF4444;" weight="duotone" />
              </div>
              <div class="flex-1">
                <p class="font-semibold text-sm text-red-500">Log Out</p>
                <p class="text-xs text-muted-foreground">Signed in as {user.username}</p>
              </div>
            </button>
          </div>
        </nav>
      </div>

    <!-- ══════════ PERSONAL INFO ═══════════════════════════════════════════════ -->
    {:else if activePage === 'personal'}
      <div class="max-w-lg mx-auto px-4 py-8">
        <button class="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors"
          on:click={() => { closeLocationMap(); activePage = 'hub'; }}>
          <ArrowLeftIcon size={16} />Back to Settings
        </button>
        <h1 class="text-xl font-bold mb-6">Personal Information</h1>

        <!-- Avatar -->
        <div class="flex items-center gap-5 mb-8 p-5 bg-card border border-border rounded-2xl">
          <div class="relative flex-shrink-0">
            <img src={avatarPreview || '/images/profilePlaceholder.jpg'} alt=""
              class="w-20 h-20 rounded-full object-cover ring-2 ring-border"/>
            <label class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer border-2 border-background"
              style="background:#FF6B35;">
              <UploadIcon size={13} color="white" weight="bold" />
              <input type="file" accept="image/*" class="hidden" on:change={handleAvatar} />
            </label>
          </div>
          <div>
            <p class="font-semibold text-sm">{user.username}</p>
            <p class="text-xs text-muted-foreground mt-0.5">{avatar ? avatarName : 'Tap the camera to change photo'}</p>
          </div>
        </div>

        <!-- Username + Bio -->
        <div class="space-y-4 mb-6">
          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Username</label>
            <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-40 disabled:cursor-not-allowed"
              bind:value={username} disabled={!canChangeUsername} />
            {#if !canChangeUsername}
              <p class="text-xs text-amber-500 mt-1.5 flex items-center gap-1">
                <ClockIcon size={12} weight="fill" />
                Locked until {nextUsernameChangeDate?.toLocaleString()}
              </p>
            {/if}
          </div>

          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Bio</label>
            <textarea rows="3"
              class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
              bind:value={bio} placeholder="Tell people about yourself…" />
          </div>

          <button
            class="w-full py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            style="background:#FF6B35;"
            on:click={saveProfile}
            disabled={savingProfile}
          >
            {#if savingProfile}
              <SpinnerGapIcon size={16} class="animate-spin" />Saving…
            {:else}
              <CheckCircleIcon size={16} weight="fill" />Save Profile
            {/if}
          </button>
        </div>

        <!-- ── LOCATION SECTION ─────────────────────────────────────────────── -->
        <div class="border-t border-border pt-6">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h2 class="font-bold text-sm flex items-center gap-1.5">
                <MapPinIcon size={15} weight="fill" style="color:#FF6B35;" />
                My Location
              </h2>
              <p class="text-xs text-muted-foreground mt-0.5">
                Used as your default delivery address
              </p>
            </div>
            <!-- GPS shortcut — always accessible -->
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
              on:click={useCurrentLocation}
              disabled={gpsLoading}
              title="Use device GPS"
            >
              {#if gpsLoading}
                <SpinnerGapIcon size={13} class="animate-spin" style="color:#FF6B35;" />
                Locating…
              {:else}
                <NavigationArrowIcon size={13} weight="fill" style="color:#FF6B35;" />
                Use GPS
              {/if}
            </button>
          </div>

          <!-- Current location display (when saved) -->
          {#if hasLocation && !showLocationMap}
            <div class="flex items-start gap-3 p-4 bg-card border border-border rounded-2xl mb-3">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style="background:#FF6B3515;">
                <MapPinIcon size={16} weight="fill" style="color:#FF6B35;" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-foreground leading-snug">{locationAddress || 'Saved location'}</p>
                <p class="text-[11px] text-muted-foreground mt-0.5">
                  {locationLat?.toFixed(5)}, {locationLng?.toFixed(5)}
                </p>
              </div>
              <div class="flex gap-1 flex-shrink-0">
                <button
                  class="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                  title="Edit location"
                  on:click={openLocationMap}
                >
                  <PencilSimpleIcon size={14} />
                </button>
                <button
                  class="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-red-400"
                  title="Remove location"
                  on:click={clearLocation}
                >
                  <TrashIcon size={14} weight="fill" />
                </button>
              </div>
            </div>
          {/if}

          <!-- Set location button (when none saved and map is closed) -->
          {#if !hasLocation && !showLocationMap}
            <button
              class="w-full flex items-center gap-3 p-4 border-2 border-dashed border-border hover:border-orange-300 rounded-2xl transition-all text-left group"
              on:click={openLocationMap}
            >
              <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style="background:#FF6B3515;">
                <MapPinIcon size={16} weight="duotone" style="color:#FF6B35;" />
              </div>
              <div class="flex-1">
                <p class="text-sm font-medium text-foreground">Set your location</p>
                <p class="text-xs text-muted-foreground">Pin your location on the map</p>
              </div>
              <ArrowRightIcon size={14} class="text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
            </button>
          {/if}

          <!-- Change location button (when saved and map is closed) -->
          {#if hasLocation && !showLocationMap}
            <button
              class="w-full py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2"
              on:click={openLocationMap}
            >
              <MapPinIcon size={14} style="color:#FF6B35;" weight="fill" />
              Change location on map
            </button>
          {/if}

          <!-- Inline Leaflet map -->
          {#if showLocationMap}
            <div class="border border-border rounded-2xl overflow-hidden">

              <!-- Map header -->
              <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
                <div class="flex items-center gap-2">
                  <MapPinIcon size={14} weight="fill" style="color:#FF6B35;" />
                  <span class="text-xs font-semibold text-foreground">
                    {geocoding ? 'Getting address…' : 'Click or drag pin to set location'}
                  </span>
                  {#if geocoding}
                    <SpinnerGapIcon size={12} class="animate-spin text-muted-foreground" />
                  {/if}
                </div>
                <button
                  class="p-1 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
                  on:click={closeLocationMap}
                  title="Close map"
                >
                  <XCircleIcon size={16} />
                </button>
              </div>

              <!-- Leaflet map container -->
              <div
                bind:this={locationMapContainer}
                style="height: 280px; width: 100%;"
              ></div>

              <!-- Address field + save -->
              <div class="p-4 border-t border-border bg-card space-y-3">
                <div>
                  <label class="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                    Address
                  </label>
                  <input
                    class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    bind:value={locationAddress}
                    placeholder="Address will auto-fill when you pin a location…"
                  />
                  <p class="text-[11px] text-muted-foreground mt-1">
                    You can also edit this address manually
                  </p>
                </div>

                {#if locationLat && locationLng}
                  <p class="text-[11px] text-muted-foreground flex items-center gap-1">
                    <MapPinIcon size={10} weight="fill" style="color:#FF6B35;" />
                    {locationLat.toFixed(6)}, {locationLng.toFixed(6)}
                  </p>
                {/if}

                <div class="flex gap-2">
                  <button
                    class="flex-1 border border-border py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors"
                    on:click={closeLocationMap}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
                    style="background:#FF6B35;"
                    on:click={saveLocation}
                    disabled={savingLocation || !locationLat || !locationLng}
                  >
                    {#if savingLocation}
                      <SpinnerGapIcon size={14} class="animate-spin" />Saving…
                    {:else}
                      <CheckCircleIcon size={14} weight="fill" />Save Location
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>
        <!-- ── END LOCATION SECTION ─────────────────────────────────────────── -->

      </div>

    <!-- ══════════ SECURITY ════════════════════════════════════════════════════ -->
    {:else if activePage === 'security'}
      <div class="max-w-lg mx-auto px-4 py-8">
        <button class="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors"
          on:click={() => activePage = 'hub'}>
          <ArrowLeftIcon size={16} />Back to Settings
        </button>
        <h1 class="text-xl font-bold mb-6">Security</h1>

        <div class="bg-card border border-border rounded-2xl p-5 mb-4">
          <h2 class="font-bold text-sm mb-4 flex items-center gap-2">
            <ShieldCheckIcon size={16} style="color:#3B82F6;" weight="duotone" />Change Password
          </h2>
          <div class="space-y-3">
            <input type="password" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              bind:value={oldPassword} placeholder="Current password" />
            <input type="password" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              bind:value={newPassword} placeholder="New password (min 8 chars)" />
            <input type="password" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              bind:value={confirmPassword} placeholder="Confirm new password" />
            <button class="w-full py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
              on:click={changePassword}>Update Password</button>
          </div>
        </div>

        <div class="bg-card border border-red-200 dark:border-red-950 rounded-2xl p-5">
          <h2 class="font-bold text-sm text-red-500 mb-1 flex items-center gap-2">
            <TrashIcon size={16} weight="fill" />Delete Account
          </h2>
          <p class="text-xs text-muted-foreground mb-4">Once deleted, your account and all data cannot be recovered.</p>
          <button class="w-full py-2.5 rounded-xl border border-red-300 dark:border-red-900 text-red-500 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            on:click={() => showDeleteModal = true}>
            Delete My Account
          </button>
        </div>
      </div>

    <!-- ══════════ TRANSACTIONS ════════════════════════════════════════════════ -->
    {:else if activePage === 'transactions'}
      <div class="max-w-2xl mx-auto px-4 py-8">
        <button class="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors"
          on:click={() => activePage = 'hub'}>
          <ArrowLeftIcon size={16} />Back to Settings
        </button>
        <h1 class="text-xl font-bold mb-2">Transaction History</h1>
        <p class="text-sm text-muted-foreground mb-6">Your complete order and payment history.</p>

        {#if !txLoading}
          <div class="grid grid-cols-2 gap-3 mb-6">
            <div class="bg-card border border-border rounded-2xl p-4">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#EF444415;">
                  <ArrowUpIcon size={14} style="color:#EF4444;" weight="bold" />
                </div>
                <span class="text-xs font-medium text-muted-foreground">Total Spent</span>
              </div>
              <p class="text-xl font-bold">Rs. {totalSpent.toFixed(0)}</p>
              <p class="text-xs text-muted-foreground mt-0.5">{transactions.filter(o => o.status === 'delivered').length} completed orders</p>
            </div>
            {#if isBusiness}
              <div class="bg-card border border-border rounded-2xl p-4">
                <div class="flex items-center gap-2 mb-2">
                  <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#10B98115;">
                    <ArrowDownIcon size={14} style="color:#10B981;" weight="bold" />
                  </div>
                  <span class="text-xs font-medium text-muted-foreground">Total Earned</span>
                </div>
                <p class="text-xl font-bold">Rs. {totalEarned.toFixed(0)}</p>
                <p class="text-xs text-muted-foreground mt-0.5">{salesOrders.filter(o => o.status === 'delivered').length} orders fulfilled</p>
              </div>
            {:else}
              <div class="bg-card border border-border rounded-2xl p-4">
                <div class="flex items-center gap-2 mb-2">
                  <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#FF6B3515;">
                    <PackageIcon size={14} style="color:#FF6B35;" weight="duotone" />
                  </div>
                  <span class="text-xs font-medium text-muted-foreground">Total Orders</span>
                </div>
                <p class="text-xl font-bold">{transactions.length}</p>
                <p class="text-xs text-muted-foreground mt-0.5">all time</p>
              </div>
            {/if}
          </div>
        {/if}

        {#if isBusiness}
          <div class="flex border border-border rounded-xl overflow-hidden mb-5">
            <button
              class="flex-1 py-2.5 text-xs font-semibold transition-colors"
              style={txTab === 'purchases' ? 'background:#FF6B35;color:white;' : 'color:hsl(var(--muted-foreground));'}
              on:click={() => txTab = 'purchases'}
            >My Purchases</button>
            <button
              class="flex-1 py-2.5 text-xs font-semibold transition-colors border-l border-border"
              style={txTab === 'sales' ? 'background:#10B981;color:white;' : 'color:hsl(var(--muted-foreground));'}
              on:click={() => txTab = 'sales'}
            >Sales Received</button>
          </div>
        {/if}

        {#if txLoading}
          <div class="space-y-3">
            {#each Array(5) as _}
              <div class="h-20 bg-card border border-border rounded-2xl skeleton"></div>
            {/each}
          </div>

        {:else if activeTxList.length === 0}
          <div class="flex flex-col items-center py-20 text-center">
            <div class="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <PackageIcon size={28} weight="duotone" class="text-muted-foreground" />
            </div>
            <p class="font-semibold mb-1">No {txTab === 'purchases' ? 'purchases' : 'sales'} yet</p>
            <p class="text-sm text-muted-foreground">
              {txTab === 'purchases' ? 'Order from a seller to see your history here.' : 'Orders from customers will appear here.'}
            </p>
          </div>

        {:else}
          <div class="space-y-2">
            {#each activeTxList as order (order.id)}
              {@const st = statusStyle[order.status] || statusStyle.pending}
              <div class="bg-card border border-border rounded-2xl p-4 hover:border-border/60 transition-colors">
                <div class="flex items-start justify-between gap-3 mb-2">
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-medium text-muted-foreground mb-0.5">
                      {txTab === 'purchases'
                        ? (order.expand?.seller?.businessName || order.expand?.seller?.username || 'Seller')
                        : (order.expand?.buyer?.username || 'Customer')}
                    </p>
                    <p class="text-sm font-semibold text-foreground truncate">
                      {(order.items || []).map(i => `${i.quantity}× ${i.name}`).join(', ') || 'Order'}
                    </p>
                  </div>
                  <div class="flex flex-col items-end flex-shrink-0 gap-1">
                    <p class="text-sm font-bold">Rs. {order.totalAmount?.toFixed(0)}</p>
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                      style="background:{st.bg};color:{st.text};">{order.status}</span>
                  </div>
                </div>

                <div class="flex items-center justify-between pt-2 border-t border-border/50">
                  <div class="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{fmtDate(order.created)}</span>
                    <span>·</span>
                    <span>{fmtTime(order.created)}</span>
                    {#if order.paymentMethod === 'esewa'}
                      <span class="flex items-center gap-1 px-1.5 py-0.5 rounded-full" style="background:#6EC74720;color:#2e7d14;">
                        <CreditCardIcon size={10} weight="fill" />eSewa
                      </span>
                    {:else}
                      <span class="text-[10px] text-muted-foreground">Cash</span>
                    {/if}
                  </div>
                  <div class="w-1.5 h-1.5 rounded-full" style="background:{st.dot};"></div>
                </div>

                {#if order.notes}
                  <p class="text-[11px] text-muted-foreground italic mt-1.5 pt-1.5 border-t border-border/50">
                    "{order.notes}"
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

    <!-- ══════════ FAVOURITES ═════════════════════════════════════════════════ -->
    {:else if activePage === 'favorites'}
      <div class="max-w-2xl mx-auto px-4 py-8">
        <button class="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors"
          on:click={() => activePage = 'hub'}>
          <ArrowLeftIcon size={16} />Back to Settings
        </button>
        <h1 class="text-xl font-bold mb-2">Favourites</h1>
        <p class="text-sm text-muted-foreground mb-6">Dishes you saved from menus.</p>

        {#if favoritesLoading}
          <div class="space-y-3">
            {#each Array(5) as _}
              <div class="h-20 bg-card border border-border rounded-2xl skeleton"></div>
            {/each}
          </div>
        {:else if favorites.length === 0}
          <div class="flex flex-col items-center py-20 text-center">
            <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style="background:#EF444415;">
              <HeartIcon size={28} weight="duotone" style="color:#EF4444;" />
            </div>
            <p class="font-semibold mb-1">No favourites yet</p>
            <p class="text-sm text-muted-foreground">Tap the heart on a dish to save it here.</p>
          </div>
        {:else}
          <div class="space-y-2">
            {#each favorites as favorite (favorite.id)}
              {@const item = favoriteItem(favorite)}
              {@const seller = favoriteSeller(item)}
              {#if item}
                <div class="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                  {#if item.image}
                    <img src={pb.files.getUrl(item, item.image)} alt={item.name} class="w-14 h-14 rounded-xl object-cover flex-shrink-0"/>
                  {:else}
                    <div class="w-14 h-14 rounded-xl bg-muted flex items-center justify-center text-xl flex-shrink-0">🍽️</div>
                  {/if}
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-sm truncate">{item.name}</p>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-sm font-bold" style="color:#FF6B35;">Rs. {item.price}</span>
                      {#if item.isAvailable === false}
                        <span class="text-xs text-muted-foreground">(Unavailable)</span>
                      {/if}
                    </div>
                    {#if seller}
                      <p class="text-xs text-muted-foreground truncate">by {seller.businessName || seller.username}</p>
                    {/if}
                  </div>
                  <button
                    class="w-10 h-10 rounded-full border border-red-200 dark:border-red-950 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex-shrink-0"
                    on:click={() => removeFavorite(favorite)}
                    title="Remove from favourites"
                    aria-label="Remove from favourites"
                  >
                    <HeartIcon size={18} weight="fill" style="color:#EF4444;" />
                  </button>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>

    <!-- ══════════ APPEARANCE ═════════════════════════════════════════════════ -->
    {:else if activePage === 'appearance'}
      <div class="max-w-lg mx-auto px-4 py-8">
        <button class="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors"
          on:click={() => activePage = 'hub'}>
          <ArrowLeftIcon size={16} />Back to Settings
        </button>
        <h1 class="text-xl font-bold mb-2">Appearance</h1>
        <p class="text-sm text-muted-foreground mb-8">Choose how FIESTRA looks on your device.</p>

        <div class="grid grid-cols-3 gap-3">
          <button
            class="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all"
            style={$theme === 'light' ? 'border-color:#FF6B35;background:#FF6B3508;' : 'border-color:hsl(var(--border));'}
            on:click={() => theme.set('light')}
          >
            <div class="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-md">
              <SunIcon size={22} style="color:#F59E0B;" weight="fill" />
            </div>
            <span class="text-xs font-semibold" style={$theme === 'light' ? 'color:#FF6B35;' : ''}>Light</span>
            {#if $theme === 'light'}
              <div class="w-4 h-4 rounded-full flex items-center justify-center" style="background:#FF6B35;">
                <CheckCircleIcon size={12} color="white" weight="fill" />
              </div>
            {/if}
          </button>

          <button
            class="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all"
            style={$theme === 'dark' ? 'border-color:#FF6B35;background:#FF6B3508;' : 'border-color:hsl(var(--border));'}
            on:click={() => theme.set('dark')}
          >
            <div class="w-12 h-12 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center shadow-md">
              <MoonIcon size={22} style="color:#93C5FD;" weight="fill" />
            </div>
            <span class="text-xs font-semibold" style={$theme === 'dark' ? 'color:#FF6B35;' : ''}>Dark</span>
            {#if $theme === 'dark'}
              <div class="w-4 h-4 rounded-full flex items-center justify-center" style="background:#FF6B35;">
                <CheckCircleIcon size={12} color="white" weight="fill" />
              </div>
            {/if}
          </button>

          <button
            class="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all"
            style={$theme === 'system' ? 'border-color:#FF6B35;background:#FF6B3508;' : 'border-color:hsl(var(--border));'}
            on:click={() => theme.set('system')}
          >
            <div class="w-12 h-12 rounded-full flex items-center justify-center shadow-md overflow-hidden border border-gray-300"
              style="background:linear-gradient(135deg,white 50%,#111 50%);">
              <DesktopIcon size={22} style="color:#6B7280;" />
            </div>
            <span class="text-xs font-semibold" style={$theme === 'system' ? 'color:#FF6B35;' : ''}>System</span>
            {#if $theme === 'system'}
              <div class="w-4 h-4 rounded-full flex items-center justify-center" style="background:#FF6B35;">
                <CheckCircleIcon size={12} color="white" weight="fill" />
              </div>
            {/if}
          </button>
        </div>
      </div>

    <!-- ══════════ BUSINESS DETAILS ════════════════════════════════════════════ -->
    {:else if activePage === 'business' && isBusiness}
      <div class="max-w-lg mx-auto px-4 py-8">
        <button class="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors"
          on:click={() => activePage = 'hub'}>
          <ArrowLeftIcon size={16} />Back to Settings
        </button>
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-xl font-bold">Business Details</h1>
          <button class="text-xs font-semibold px-3 py-1.5 rounded-xl text-white hover:opacity-90"
            style="background:#FF6B35;" on:click={() => goto('/business/dashboard')}>
            Dashboard →
          </button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Business Name</label>
            <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              bind:value={businessName} />
          </div>

          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Business Type</label>
            <div class="grid grid-cols-2 gap-2">
              {#each businessTypes as bt}
                {@const Icon = bt.icon}
                <button class="flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium text-left transition-all"
                  style={businessType === bt.value ? 'background:#FF6B3515;border-color:#FF6B35;color:#FF6B35;' : 'border-color:hsl(var(--border));color:hsl(var(--muted-foreground));'}
                  on:click={() => businessType = bt.value}>
                  <Icon size={14} />{bt.label}
                </button>
              {/each}
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Description</label>
            <textarea rows="2" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm resize-none focus:outline-none" bind:value={businessDescription} />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Phone</label>
              <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm focus:outline-none" bind:value={businessPhone} />
            </div>
            <div>
              <label class="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Address</label>
              <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm focus:outline-none" bind:value={businessAddress} />
            </div>
          </div>

          <button class="w-full py-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors flex items-center justify-center gap-2"
            on:click={saveBusinessDetails}>
            <CheckCircleIcon size={16} weight="fill" style="color:#FF6B35;" />
            Save Business Details
          </button>
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .skeleton {
    background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--secondary)) 50%, hsl(var(--muted)) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 0.8s linear infinite; }
</style>
