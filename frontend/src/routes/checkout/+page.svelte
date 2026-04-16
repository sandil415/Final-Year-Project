<script>
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import {
    ArrowLeftIcon, MapPinIcon, CalendarIcon, ClockIcon,
    CaretDownIcon, CaretUpIcon, TrashIcon, MinusIcon, PlusIcon,
    CheckCircleIcon, WarningCircleIcon, XIcon, InfoIcon,
  } from 'phosphor-svelte';
  import {
    cart, cartBySeller, cartTotal, cartCount, checkoutState,
    removeItem as removeCartItem, removeSellerItems,
    addItem as addCartItem, setCheckoutField, initCheckout,
  } from '$lib/stores/cart';

  let currentUser = null;
  let loading = false;
  let toast = null;

  // Expanded order groups
  let expandedGroups = {};

  // Map instances per seller
  let leafletInstances = {};

  // Schedule toggle per seller
  let scheduleEnabled = {};
  let scheduledDate = {};
  let scheduledTime = {};

  // Min date for calendar (today)
  const today = new Date().toISOString().split('T')[0];

  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => (toast = null), 3500);
  }

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.record ?? pb.authStore.model;

    // Auto-expand if only one seller
    const groups = $cartBySeller;
    if (groups.length === 1) {
      expandedGroups[groups[0].sellerId] = true;
      initCheckout(groups[0].sellerId);
    } else {
      for (const g of groups) {
        initCheckout(g.sellerId);
      }
    }
  });

  onDestroy(() => {
    for (const inst of Object.values(leafletInstances)) {
      try { inst.map?.remove(); } catch (_) {}
    }
  });

  // ── Leaflet ───────────────────────────────────────────────────────────────────
  async function initMap(sellerId) {
    if (leafletInstances[sellerId]) {
      setTimeout(() => leafletInstances[sellerId]?.map?.invalidateSize(), 300);
      return;
    }

    await tick();
    if (typeof window === 'undefined') return;

    if (!window.L) {
      await new Promise((resolve, reject) => {
        if (document.querySelector('link[href*="leaflet"]')) { resolve(); return; }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    const L = window.L;
    const el = document.getElementById(`map-${sellerId}`);
    if (!el) return;

    const defaultCenter = [27.7172, 85.324];
    const map = L.map(el, { zoomControl: true }).setView(defaultCenter, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const pinHtml = `<div style="width:28px;height:28px;background:#FF6B35;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`;
    const pinIcon = L.divIcon({ className: '', html: pinHtml, iconSize: [28, 28], iconAnchor: [14, 28] });
    const marker = L.marker(defaultCenter, { icon: pinIcon, draggable: true }).addTo(map);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const { latitude: lat, longitude: lng } = coords;
          map.setView([lat, lng], 16);
          marker.setLatLng([lat, lng]);
          reverseGeocode(sellerId, lat, lng);
        },
        () => {}
      );
    }

    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng();
      setCheckoutField(sellerId, 'lat', lat);
      setCheckoutField(sellerId, 'lng', lng);
      reverseGeocode(sellerId, lat, lng);
    });

    map.on('click', ({ latlng: { lat, lng } }) => {
      marker.setLatLng([lat, lng]);
      setCheckoutField(sellerId, 'lat', lat);
      setCheckoutField(sellerId, 'lng', lng);
      reverseGeocode(sellerId, lat, lng);
    });

    leafletInstances[sellerId] = { map, marker };
    setTimeout(() => map.invalidateSize(), 250);
  }

  async function reverseGeocode(sellerId, lat, lng) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
      );
      const data = await res.json();
      setCheckoutField(sellerId, 'address', data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } catch (_) {
      setCheckoutField(sellerId, 'address', `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }
  }

  // ── Toggle group expand ───────────────────────────────────────────────────────
  function toggleGroup(sellerId) {
    expandedGroups[sellerId] = !expandedGroups[sellerId];
    expandedGroups = { ...expandedGroups };
    if (expandedGroups[sellerId]) {
      initCheckout(sellerId);
      tick().then(() => initMap(sellerId));
    }
  }

  // ── Quantity helpers ──────────────────────────────────────────────────────────
  function addOne(item) { addCartItem(item, 1, {}, []); }
  function removeOne(lineKey) { removeCartItem(lineKey, 1); }

  // ── Place order ───────────────────────────────────────────────────────────────
  async function placeOrder(group) {
    const sid = group.sellerId;
    const co = $checkoutState[sid];
    if (!co?.address?.trim()) { showToast('Please set a delivery address', 'error'); return; }

    // Build scheduled_at if schedule enabled
    let scheduledAt = null;
    if (scheduleEnabled[sid]) {
      const d = scheduledDate[sid];
      const t = scheduledTime[sid] || '12:00';
      if (!d) { showToast('Please pick a delivery date', 'error'); return; }
      scheduledAt = new Date(`${d}T${t}:00`).toISOString();
      if (new Date(scheduledAt) <= new Date()) {
        showToast('Scheduled time must be in the future', 'error'); return;
      }
    }

    setCheckoutField(sid, 'placing', true);
    try {
      await pb.collection('orders').create({
        buyer: currentUser.id,
        seller: sid,
        items: group.entries.map(e => ({
          menuItemId: e.item.id,
          name: e.item.name,
          basePrice: e.item.price,
          effectivePrice: e.effectivePrice ?? e.item.price,
          quantity: e.quantity,
          selectionLabel: e.selectionLabel || '',
          selections: e.selections || {},
        })),
        totalAmount: group.subtotal,
        status: scheduledAt ? 'scheduled' : 'pending',
        deliveryAddress: co.address,
        notes: co.notes || '',
        scheduledAt: scheduledAt || null,
      });

      // Notify seller
      pb.collection('notifications').create({
        user: sid,
        triggeredBy: currentUser.id,
        type: 'message',
        message: scheduledAt
          ? `${currentUser.username} placed a scheduled order for ${new Date(scheduledAt).toLocaleString()}.`
          : `${currentUser.username} placed a new order worth Rs. ${group.subtotal.toFixed(2)}.`,
        read: false,
      }).catch(() => {});

      removeSellerItems(sid);
      showToast(scheduledAt ? `Order scheduled! ✓` : `Order placed with ${group.sellerName}! ✓`);
      setCheckoutField(sid, 'success', true);

      if ($cartBySeller.length === 0) {
        setTimeout(() => goto('/home'), 1800);
      }
    } catch (err) {
      showToast(err.message || 'Failed to place order', 'error');
    } finally {
      setCheckoutField(sid, 'placing', false);
    }
  }
</script>

<!-- Toast -->
{#if toast}
  <div class="fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold text-white pointer-events-none"
    style={toast.type === 'error' ? 'background:#EF4444;' : 'background:#16a34a;'}>
    {#if toast.type === 'error'}<WarningCircleIcon size={15} weight="fill"/>
    {:else}<CheckCircleIcon size={15} weight="fill"/>{/if}
    {toast.msg}
  </div>
{/if}

<div class="min-h-screen bg-background text-foreground">
  <Header />

  <main class="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24">

    <!-- ── Page header ── -->
    <div class="flex items-center gap-3 mb-8">
      <button
        class="p-2 hover:bg-muted rounded-xl transition-colors border border-border"
        on:click={() => history.back()}
        aria-label="Go back"
      >
        <ArrowLeftIcon size={18} />
      </button>
      <div>
        <h1 class="text-xl font-bold">Checkout</h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          {$cartCount} item{$cartCount !== 1 ? 's' : ''} from {$cartBySeller.length} seller{$cartBySeller.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>

    <!-- ── Empty state ── -->
    {#if $cartBySeller.length === 0}
      <div class="flex flex-col items-center py-24 text-center">
        <div class="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4 text-3xl">🛒</div>
        <p class="font-semibold text-lg mb-1">Your cart is empty</p>
        <p class="text-sm text-muted-foreground mb-6">Browse menus to add items before checking out.</p>
        <button
          class="px-6 py-2.5 rounded-xl text-white font-semibold text-sm hover:opacity-90"
          style="background-color:#FF6B35;"
          on:click={() => goto('/search')}
        >
          Browse Food
        </button>
      </div>

    {:else}
      <!-- ── Seller order cards ── -->
      <div class="space-y-4">
        {#each $cartBySeller as group (group.sellerId)}
          {@const co = $checkoutState[group.sellerId] || {}}
          {@const isExpanded = !!expandedGroups[group.sellerId]}
          {@const isScheduled = !!scheduleEnabled[group.sellerId]}

          <div class="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">

            <!-- ── Seller header (click to expand) ── -->
            <button
              class="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
              on:click={() => toggleGroup(group.sellerId)}
            >
              <!-- Avatar -->
              {#if group.sellerRecord?.avatar}
                <img
                  src={pb.files.getUrl(group.sellerRecord, group.sellerRecord.avatar)}
                  alt={group.sellerName}
                  class="w-10 h-10 rounded-full object-cover ring-1 ring-border flex-shrink-0"
                />
              {:else}
                <div
                  class="w-10 h-10 rounded-full text-white font-bold text-sm flex items-center justify-center flex-shrink-0"
                  style="background-color:#FF6B35;"
                >
                  {group.sellerName.charAt(0).toUpperCase()}
                </div>
              {/if}

              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm">{group.sellerName}</p>
                <p class="text-xs text-muted-foreground">
                  {group.entries.length} item{group.entries.length !== 1 ? 's' : ''}
                  · Rs. {group.subtotal.toFixed(2)}
                  {#if isScheduled && scheduledDate[group.sellerId]}
                    · <span style="color:#FF6B35;">Scheduled</span>
                  {/if}
                </p>
              </div>

              {#if isExpanded}
                <CaretUpIcon size={16} class="text-muted-foreground flex-shrink-0" />
              {:else}
                <CaretDownIcon size={16} class="text-muted-foreground flex-shrink-0" />
              {/if}
            </button>

            <!-- ── Expanded details ── -->
            {#if isExpanded}
              <div class="border-t border-border px-5 py-4 space-y-5">

                {#if co.success}
                  <!-- Success state -->
                  <div class="flex flex-col items-center py-8 text-center">
                    <div class="w-16 h-16 rounded-full flex items-center justify-center mb-3 text-4xl" style="background:#FF6B3515;">🎉</div>
                    <h3 class="font-bold text-lg mb-1">Order Placed!</h3>
                    <p class="text-sm text-muted-foreground">
                      {isScheduled ? 'Scheduled order confirmed.' : 'The seller will confirm shortly.'}
                    </p>
                  </div>

                {:else}

                  <!-- ── Items list ── -->
                  <div>
                    <p class="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Items</p>
                    <div class="space-y-2">
                      {#each group.entries as entry}
                        {@const lineKey = Object.entries($cart).find(([k, e]) => e === entry)?.[0] || entry.item.id}
                        <div class="flex items-center gap-3 p-3 bg-background border border-border rounded-xl">
                          {#if entry.item.image}
                            <img
                              src={pb.files.getUrl(entry.item, entry.item.image)}
                              alt={entry.item.name}
                              class="w-11 h-11 rounded-lg object-cover flex-shrink-0"
                            />
                          {:else}
                            <div class="w-11 h-11 rounded-lg bg-muted flex items-center justify-center text-lg flex-shrink-0">🍽️</div>
                          {/if}

                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium truncate">{entry.item.name}</p>
                            {#if entry.selectionLabel}
                              <p class="text-[11px] text-muted-foreground mt-0.5">{entry.selectionLabel}</p>
                            {/if}
                            <p class="text-xs text-muted-foreground">
                              Rs. {(entry.effectivePrice ?? entry.item.price).toFixed(0)} × {entry.quantity}
                            </p>
                          </div>

                          <!-- Qty controls -->
                          <div class="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              class="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                              on:click={() => removeOne(lineKey)}
                            >
                              <MinusIcon size={12} />
                            </button>
                            <span class="text-sm font-semibold w-4 text-center">{entry.quantity}</span>
                            <button
                              class="w-7 h-7 rounded-full text-white flex items-center justify-center hover:opacity-90"
                              style="background-color:#FF6B35;"
                              on:click={() => addOne(entry.item)}
                            >
                              <PlusIcon size={12} />
                            </button>
                          </div>

                          <!-- Line total -->
                          <p class="text-sm font-bold flex-shrink-0 w-16 text-right">
                            Rs. {((entry.effectivePrice ?? entry.item.price) * entry.quantity).toFixed(0)}
                          </p>
                        </div>
                      {/each}
                    </div>
                  </div>

                  <!-- ── Delivery address ── -->
                  <div>
                    <p class="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
                      Delivery Address <span class="text-red-500">*</span>
                    </p>

                    <!-- Address input -->
                    <textarea
                      rows="2"
                      class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm resize-none mb-2 focus:outline-none focus:ring-2 focus:ring-orange-300"
                      value={co.address || ''}
                      on:input={e => setCheckoutField(group.sellerId, 'address', e.target.value)}
                      placeholder="Your delivery address (or click the map below)"
                    />

                    <!-- Leaflet map -->
                    <div
                      id="map-{group.sellerId}"
                      class="w-full rounded-xl overflow-hidden border border-border"
                      style="height:220px;"
                    ></div>
                    <p class="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
                      <InfoIcon size={11} />
                      Click the map or drag the pin to set your delivery location.
                    </p>
                  </div>

                  <!-- ── Notes ── -->
                  <div>
                    <p class="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Notes</p>
                    <textarea
                      rows="2"
                      class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
                      value={co.notes || ''}
                      on:input={e => setCheckoutField(group.sellerId, 'notes', e.target.value)}
                      placeholder="Allergies, special requests…"
                    />
                  </div>

                  <!-- ── Schedule toggle ── -->
                  <div class="rounded-xl border border-border bg-background p-4">
                    <div class="flex items-center justify-between mb-1">
                      <div>
                        <p class="text-sm font-semibold flex items-center gap-1.5">
                          <CalendarIcon size={15} style="color:#FF6B35;" />
                          Schedule for later
                        </p>
                        <p class="text-xs text-muted-foreground mt-0.5">
                          Plan ahead — birthday cakes, event catering, etc.
                        </p>
                      </div>
                      <!-- Toggle -->
                      <button
                        class="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                        style={scheduleEnabled[group.sellerId] ? 'background-color:#FF6B35;' : 'background-color:hsl(var(--muted));'}
                        on:click={() => {
                          scheduleEnabled[group.sellerId] = !scheduleEnabled[group.sellerId];
                          scheduleEnabled = { ...scheduleEnabled };
                        }}
                        aria-label="Toggle schedule"
                      >
                        <span
                          class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={scheduleEnabled[group.sellerId] ? 'transform:translateX(20px);' : ''}
                        ></span>
                      </button>
                    </div>

                    {#if scheduleEnabled[group.sellerId]}
                      <div class="mt-3 grid grid-cols-2 gap-3 pt-3 border-t border-border">
                        <div>
                          <label class="block text-xs font-medium mb-1 text-muted-foreground">Date</label>
                          <input
                            type="date"
                            min={today}
                            bind:value={scheduledDate[group.sellerId]}
                            class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                          />
                        </div>
                        <div>
                          <label class="block text-xs font-medium mb-1 text-muted-foreground">Time</label>
                          <input
                            type="time"
                            bind:value={scheduledTime[group.sellerId]}
                            class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                          />
                        </div>
                        {#if scheduledDate[group.sellerId]}
                          <div class="col-span-2">
                            <div class="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium" style="background:#FF6B3512;color:#FF6B35;">
                              <CalendarIcon size={13} />
                              Delivery scheduled for {new Date(`${scheduledDate[group.sellerId]}T${scheduledTime[group.sellerId] || '12:00'}`).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
                            </div>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>

                  <!-- ── Order summary ── -->
                  <div class="rounded-xl border border-border bg-background px-4 py-3 space-y-1.5">
                    <div class="flex justify-between text-sm text-muted-foreground">
                      <span>Items ({group.entries.reduce((s, e) => s + e.quantity, 0)})</span>
                      <span>Rs. {group.subtotal.toFixed(2)}</span>
                    </div>
                    <div class="flex justify-between text-sm text-muted-foreground">
                      <span>Delivery</span>
                      <span class="text-green-600 font-medium">Free</span>
                    </div>
                    <div class="flex justify-between font-bold text-base border-t border-border pt-1.5 mt-1.5">
                      <span>Total</span>
                      <span>Rs. {group.subtotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <!-- ── Actions ── -->
                  <div class="flex gap-2">
                    <!-- Remove seller -->
                    <button
                      class="p-3 rounded-xl border border-border hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 transition-colors flex-shrink-0"
                      title="Remove all items from {group.sellerName}"
                      on:click={() => removeSellerItems(group.sellerId)}
                    >
                      <TrashIcon size={16} />
                    </button>

                    <!-- Place order -->
                    <button
                      class="flex-1 py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style="background-color:#FF6B35;"
                      disabled={co.placing}
                      on:click={() => placeOrder(group)}
                    >
                      {#if co.placing}
                        <span class="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                        Placing…
                      {:else if scheduleEnabled[group.sellerId]}
                        <CalendarIcon size={15} />
                        Schedule Order
                      {:else}
                        Place Order · Rs. {group.subtotal.toFixed(2)}
                      {/if}
                    </button>
                  </div>

                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- ── Grand total ── -->
      {#if $cartBySeller.length > 1}
        <div class="mt-4 px-5 py-4 bg-card border border-border rounded-2xl flex items-center justify-between">
          <div>
            <p class="text-xs text-muted-foreground">Grand total</p>
            <p class="text-xl font-bold">Rs. {$cartTotal.toFixed(2)}</p>
          </div>
          <p class="text-xs text-muted-foreground text-right">
            Expand each seller<br/>above to place orders
          </p>
        </div>
      {/if}
    {/if}
  </main>
</div>

<style>
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }
</style>