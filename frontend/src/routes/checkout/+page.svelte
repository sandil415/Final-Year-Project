<script>
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import {
    ArrowLeftIcon, CalendarIcon, CaretDownIcon, CaretUpIcon,
    TrashIcon, MinusIcon, PlusIcon,
    CheckCircleIcon, WarningCircleIcon, InfoIcon,
    CreditCardIcon, ShoppingCartIcon,
    MoneyIcon,
  } from 'phosphor-svelte';
  import {
    cart, cartBySeller, cartTotal, cartCount, checkoutState,
    removeItem as removeCartItem, removeSellerItems,
    addItem as addCartItem, setCheckoutField, initCheckout,
  } from '$lib/stores/cart';

  let currentUser = null;
  let toast = null;
  let expandedGroups = {};
  let leafletInstances = {};
  let scheduleEnabled = {};
  let scheduledDate = {};
  let scheduledTime = {};
  let paymentMethod = {};

  // Calendar state per seller
  let calendarYear = {};
  let calendarMonth = {};

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // eSewa UAT config
  const ESEWA_TEST_URL = 'https://rc-epay.esewa.com.np/api/epay/main/v2/form';
  const ESEWA_MERCHANT_CODE = 'EPAYTEST';

  // ── Cart cleared flag in localStorage so success/failure pages can clean up ──
  // Key: 'esewa_pending_{orderId}' → sellerId
  // On success page: read this key, call removeSellerItems, delete key.

  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => (toast = null), 3500);
  }

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.record ?? pb.authStore.model;

    const groups = $cartBySeller;
    for (const g of groups) {
      initCheckout(g.sellerId);
      paymentMethod[g.sellerId] = 'esewa';

      // Init calendar to current month
      calendarYear[g.sellerId]  = today.getFullYear();
      calendarMonth[g.sellerId] = today.getMonth(); // 0-based
      // Default time: next hour rounded
      const nextHour = new Date(today);
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      scheduledTime[g.sellerId] = `${String(nextHour.getHours()).padStart(2,'0')}:00`;
    }
    if (groups.length === 1) {
      expandedGroups[groups[0].sellerId] = true;
      tick().then(() => initMap(groups[0].sellerId));
    }
  });

  onDestroy(() => {
    for (const inst of Object.values(leafletInstances)) {
      try { inst.map?.remove(); } catch (_) {}
    }
  });

  // ── Calendar helpers ──────────────────────────────────────────────────────────
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function calDays(year, month) {
    const first = new Date(year, month, 1).getDay(); // 0=Sun
    const total = new Date(year, month + 1, 0).getDate();
    return { first, total };
  }

  function calPrev(sid) {
    if (calendarMonth[sid] === 0) {
      calendarMonth[sid] = 11;
      calendarYear[sid]--;
    } else {
      calendarMonth[sid]--;
    }
    calendarMonth = { ...calendarMonth };
    calendarYear  = { ...calendarYear };
  }

  function calNext(sid) {
    if (calendarMonth[sid] === 11) {
      calendarMonth[sid] = 0;
      calendarYear[sid]++;
    } else {
      calendarMonth[sid]++;
    }
    calendarMonth = { ...calendarMonth };
    calendarYear  = { ...calendarYear };
  }

  function selectDay(sid, day) {
    const y = calendarYear[sid];
    const m = calendarMonth[sid];
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if (ds < todayStr) return; // past — ignore
    scheduledDate[sid] = ds;
    scheduledDate = { ...scheduledDate };
  }

  function isToday(sid, day) {
    const y = calendarYear[sid];
    const m = calendarMonth[sid];
    return today.getFullYear() === y && today.getMonth() === m && today.getDate() === day;
  }

  function isSelected(sid, day) {
    if (!scheduledDate[sid]) return false;
    const [sy, sm, sd] = scheduledDate[sid].split('-').map(Number);
    return sy === calendarYear[sid] && sm === calendarMonth[sid] + 1 && sd === day;
  }

  function isPast(sid, day) {
    const y = calendarYear[sid];
    const m = calendarMonth[sid];
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return ds < todayStr;
  }

  // Nav: don't allow going before current month
  function canGoPrev(sid) {
    return calendarYear[sid] > today.getFullYear() ||
           (calendarYear[sid] === today.getFullYear() && calendarMonth[sid] > today.getMonth());
  }

  // ── Leaflet map ───────────────────────────────────────────────────────────────
  async function initMap(sellerId) {
    if (leafletInstances[sellerId]) {
      setTimeout(() => leafletInstances[sellerId]?.map?.invalidateSize(), 300);
      return;
    }
    await tick();
    if (typeof window === 'undefined') return;

    if (!window.L) {
      await new Promise((resolve, reject) => {
        if (document.querySelector('script[src*="leaflet"]')) { resolve(); return; }
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

    const L  = window.L;
    const el = document.getElementById(`map-${sellerId}`);
    if (!el) return;

    const defaultCenter = [27.7172, 85.324];
    const map = L.map(el, { zoomControl: true }).setView(defaultCenter, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);

    const pinHtml = `<div style="width:28px;height:28px;background:#FF6B35;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`;
    const pinIcon = L.divIcon({ className: '', html: pinHtml, iconSize: [28, 28], iconAnchor: [14, 28] });
    const marker  = L.marker(defaultCenter, { icon: pinIcon, draggable: true }).addTo(map);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          map.setView([coords.latitude, coords.longitude], 16);
          marker.setLatLng([coords.latitude, coords.longitude]);
          reverseGeocode(sellerId, coords.latitude, coords.longitude);
        }, () => {}
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
      const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
      const data = await res.json();
      setCheckoutField(sellerId, 'address', data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } catch (_) {
      setCheckoutField(sellerId, 'address', `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }
  }

  // ── Group expand ──────────────────────────────────────────────────────────────
  function toggleGroup(sellerId) {
    expandedGroups[sellerId] = !expandedGroups[sellerId];
    expandedGroups = { ...expandedGroups };
    if (expandedGroups[sellerId]) {
      initCheckout(sellerId);
      tick().then(() => initMap(sellerId));
    }
  }

  // ── Qty helpers ───────────────────────────────────────────────────────────────
  function addOne(item)      { addCartItem(item, 1, {}, []); }
  function removeOne(lineKey){ removeCartItem(lineKey, 1); }

  // ── eSewa HMAC-SHA256 ─────────────────────────────────────────────────────────
  async function generateEsewaSignature(totalAmount, transactionUUID) {
    const secretKey = '8gBm/:&EnhH.1/q';
    const message   = `total_amount=${totalAmount},transaction_uuid=${transactionUUID},product_code=${ESEWA_MERCHANT_CODE}`;
    const encoder   = new TextEncoder();
    const key = await window.crypto.subtle.importKey(
      'raw', encoder.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await window.crypto.subtle.sign('HMAC', key, encoder.encode(message));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
  }

  // ── Validate checkout fields ──────────────────────────────────────────────────
  function validateCheckout(group) {
    const sid = group.sellerId;
    const co  = $checkoutState[sid];
    if (!co?.address?.trim()) { showToast('Please set a delivery address', 'error'); return null; }

    let scheduledAt = null;
    if (scheduleEnabled[sid]) {
      const d = scheduledDate[sid];
      const t = scheduledTime[sid] || '12:00';
      if (!d) { showToast('Please pick a delivery date on the calendar', 'error'); return null; }
      scheduledAt = new Date(`${d}T${t}:00`).toISOString();
      if (new Date(scheduledAt) <= new Date()) {
        showToast('Scheduled time must be in the future', 'error'); return null;
      }
    }
    return { co, scheduledAt };
  }

  function buildOrderPayload(group, co, scheduledAt, status = 'pending') {
    const payload = {
      buyer:           currentUser.id,
      seller:          group.sellerId,
      items:           group.entries.map(e => ({
        menuItemId:     e.item.id,
        name:           e.item.name,
        basePrice:      e.item.price,
        effectivePrice: e.effectivePrice ?? e.item.price,
        quantity:       e.quantity,
        selectionLabel: e.selectionLabel || '',
        selections:     e.selections || {},
      })),
      totalAmount:     group.subtotal,
      status,
      deliveryAddress: co.address,
      notes:           co.notes || '',
    };
    if (scheduledAt) payload.scheduledAt = scheduledAt;
    return payload;
  }

  // ── eSewa: create order → store pending marker → redirect ─────────────────────
  // FIX: We clear the cart BEFORE redirecting to eSewa. If the user abandons
  // payment, the cart is already gone — this is acceptable UX (they can re-add).
  // Alternatively the success page checks localStorage for a pending order ID
  // and marks it confirmed. Either way, items are not re-shown after redirect.
  async function initiateEsewaPayment(group) {
    const sid       = group.sellerId;
    const validated = validateCheckout(group);
    if (!validated) return;
    const { co, scheduledAt } = validated;

    setCheckoutField(sid, 'placing', true);
    try {
      const notesWithTag = `[eSewa]${co.notes ? ' ' + co.notes : ''}`;
      const orderPayload = buildOrderPayload(
        group,
        { ...co, notes: notesWithTag },
        scheduledAt,
        scheduledAt ? 'scheduled' : 'pending'
      );
      const order = await pb.collection('orders').create(orderPayload);

      const transactionUUID = order.id;
      const totalAmount     = group.subtotal.toFixed(2);
      const signature       = await generateEsewaSignature(totalAmount, transactionUUID);

      // ── FIX: clear cart items for this seller BEFORE leaving the page ──────
      // This prevents items from appearing in cart again if the user navigates
      // back without completing payment. The order already exists in the DB.
      removeSellerItems(sid);

      // Store a lightweight marker so the success/failure pages know which order
      // to confirm or cancel without re-visiting the cart.
      try {
        localStorage.setItem(`esewa_pending_${transactionUUID}`, JSON.stringify({
          orderId: order.id,
          sellerId: sid,
          amount: totalAmount,
          ts: Date.now(),
        }));
      } catch (_) {}

      const successUrl = `${window.location.origin}/checkout/esewa-success`;
      const failureUrl = `${window.location.origin}/checkout/esewa-failure`;

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = ESEWA_TEST_URL;

      const fields = {
        amount:                  group.subtotal.toFixed(2),
        tax_amount:              '0',
        total_amount:            totalAmount,
        transaction_uuid:        transactionUUID,
        product_code:            ESEWA_MERCHANT_CODE,
        product_service_charge:  '0',
        product_delivery_charge: '0',
        success_url:             successUrl,
        failure_url:             failureUrl,
        signed_field_names:      'total_amount,transaction_uuid,product_code',
        signature,
      };
      for (const [k, v] of Object.entries(fields)) {
        const input = document.createElement('input');
        input.type = 'hidden'; input.name = k; input.value = v;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
      // Page navigates away — no need to reset placing

    } catch (err) {
      console.error('eSewa error:', err);
      showToast(err?.response?.message || err.message || 'Failed to initiate payment', 'error');
      setCheckoutField(sid, 'placing', false);
    }
  }

  // ── COD ───────────────────────────────────────────────────────────────────────
  async function placeCodOrder(group) {
    const sid       = group.sellerId;
    const validated = validateCheckout(group);
    if (!validated) return;
    const { co, scheduledAt } = validated;

    setCheckoutField(sid, 'placing', true);
    try {
      await pb.collection('orders').create(
        buildOrderPayload(group, co, scheduledAt, scheduledAt ? 'scheduled' : 'pending')
      );
      pb.collection('notifications').create({
        user:        sid,
        triggeredBy: currentUser.id,
        type:        'message',
        message:     scheduledAt
          ? `${currentUser.username} placed a scheduled COD order for ${new Date(scheduledAt).toLocaleString()}.`
          : `${currentUser.username} placed a new COD order worth Rs. ${group.subtotal.toFixed(2)}.`,
        read: false,
      }).catch(() => {});

      removeSellerItems(sid);
      showToast(scheduledAt ? 'Order scheduled! ✓' : 'Order placed! ✓');
      setCheckoutField(sid, 'success', true);

      if ($cartBySeller.length === 0) {
        setTimeout(() => goto('/home'), 1800);
      }
    } catch (err) {
      showToast(err?.response?.message || err.message || 'Failed', 'error');
    } finally {
      setCheckoutField(sid, 'placing', false);
    }
  }

  function handlePlaceOrder(group) {
    const method = paymentMethod[group.sellerId] || 'esewa';
    if (method === 'esewa') initiateEsewaPayment(group);
    else placeCodOrder(group);
  }

  // ── Scheduled date display helper ─────────────────────────────────────────────
  function formatScheduledPreview(sid) {
    const d = scheduledDate[sid];
    const t = scheduledTime[sid] || '12:00';
    if (!d) return null;
    return new Date(`${d}T${t}:00`).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
  }
</script>

{#if toast}
  <div class="fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold text-white pointer-events-none"
    style={toast.type === 'error' ? 'background:#EF4444;' : 'background:#16a34a;'}>
    {#if toast.type === 'error'}<WarningCircleIcon size={15} weight="fill"/>{:else}<CheckCircleIcon size={15} weight="fill"/>{/if}
    {toast.msg}
  </div>
{/if}

<div class="min-h-screen bg-background text-foreground">
  <Header />

  <main class="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24">

    <!-- Page header -->
    <div class="flex items-center gap-3 mb-8">
      <button class="p-2 hover:bg-muted rounded-xl transition-colors border border-border" on:click={() => history.back()} aria-label="Go back">
        <ArrowLeftIcon size={18} />
      </button>
      <div>
        <h1 class="text-xl font-bold">Checkout</h1>
        <p class="text-xs text-muted-foreground mt-0.5">
          {$cartCount} item{$cartCount !== 1 ? 's' : ''} from {$cartBySeller.length} seller{$cartBySeller.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>

    {#if $cartBySeller.length === 0}
      <div class="flex flex-col items-center py-24 text-center">
        <div class="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <ShoppingCartIcon size={32} weight="duotone" class="text-muted-foreground" />
        </div>
        <p class="font-semibold text-lg mb-1">Your cart is empty</p>
        <p class="text-sm text-muted-foreground mb-6">Browse menus to add items before checking out.</p>
        <button class="px-6 py-2.5 rounded-xl text-white font-semibold text-sm hover:opacity-90" style="background-color:#FF6B35;" on:click={() => goto('/search')}>
          Browse Food
        </button>
      </div>

    {:else}
      <div class="space-y-4">
        {#each $cartBySeller as group (group.sellerId)}
          {@const co         = $checkoutState[group.sellerId] || {}}
          {@const isExpanded = !!expandedGroups[group.sellerId]}
          {@const method     = paymentMethod[group.sellerId] || 'esewa'}
          {@const isScheduled= !!scheduleEnabled[group.sellerId]}

          <div class="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">

            <!-- Seller header -->
            <button class="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
              on:click={() => toggleGroup(group.sellerId)}>
              {#if group.sellerRecord?.avatar}
                <img src={pb.files.getUrl(group.sellerRecord, group.sellerRecord.avatar)} alt={group.sellerName}
                  class="w-10 h-10 rounded-full object-cover ring-1 ring-border flex-shrink-0"/>
              {:else}
                <div class="w-10 h-10 rounded-full text-white font-bold text-sm flex items-center justify-center flex-shrink-0"
                  style="background-color:#FF6B35;">{group.sellerName.charAt(0).toUpperCase()}</div>
              {/if}
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm">{group.sellerName}</p>
                <p class="text-xs text-muted-foreground">
                  {group.entries.length} item{group.entries.length !== 1 ? 's' : ''} · Rs. {group.subtotal.toFixed(2)}
                  {#if isScheduled && scheduledDate[group.sellerId]} · <span style="color:#FF6B35;">Scheduled</span>{/if}
                </p>
              </div>
              {#if isExpanded}<CaretUpIcon size={16} class="text-muted-foreground flex-shrink-0"/>
              {:else}<CaretDownIcon size={16} class="text-muted-foreground flex-shrink-0"/>{/if}
            </button>

            {#if isExpanded}
              <div class="border-t border-border px-5 py-4 space-y-5">

                {#if co.success}
                  <div class="flex flex-col items-center py-8 text-center">
                    <div class="w-16 h-16 rounded-full flex items-center justify-center mb-3" style="background:#FF6B3515;">
                      <CheckCircleIcon size={40} weight="fill" style="color:#FF6B35;" />
                    </div>
                    <h3 class="font-bold text-lg mb-1">Order Placed!</h3>
                    <p class="text-sm text-muted-foreground">{isScheduled ? 'Scheduled order confirmed.' : 'The seller will confirm shortly.'}</p>
                  </div>

                {:else}

                  <!-- Items -->
                  <div>
                    <p class="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Items</p>
                    <div class="space-y-2">
                      {#each group.entries as entry}
                        {@const lineKey = Object.entries($cart).find(([k, e]) => e === entry)?.[0] || entry.item.id}
                        <div class="flex items-center gap-3 p-3 bg-background border border-border rounded-xl">
                          {#if entry.item.image}
                            <img src={pb.files.getUrl(entry.item, entry.item.image)} alt={entry.item.name} class="w-11 h-11 rounded-lg object-cover flex-shrink-0"/>
                          {:else}
                            <div class="w-11 h-11 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 text-lg">🍽️</div>
                          {/if}
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium truncate">{entry.item.name}</p>
                            {#if entry.selectionLabel}<p class="text-[11px] text-muted-foreground mt-0.5">{entry.selectionLabel}</p>{/if}
                            <p class="text-xs text-muted-foreground">Rs. {(entry.effectivePrice ?? entry.item.price).toFixed(0)} × {entry.quantity}</p>
                          </div>
                          <div class="flex items-center gap-1.5 flex-shrink-0">
                            <button class="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors" on:click={() => removeOne(lineKey)}>
                              <MinusIcon size={12} />
                            </button>
                            <span class="text-sm font-semibold w-4 text-center">{entry.quantity}</span>
                            <button class="w-7 h-7 rounded-full text-white flex items-center justify-center hover:opacity-90" style="background-color:#FF6B35;" on:click={() => addOne(entry.item)}>
                              <PlusIcon size={12} />
                            </button>
                          </div>
                          <p class="text-sm font-bold flex-shrink-0 w-16 text-right">
                            Rs. {((entry.effectivePrice ?? entry.item.price) * entry.quantity).toFixed(0)}
                          </p>
                        </div>
                      {/each}
                    </div>
                  </div>

                  <!-- Delivery address + map -->
                  <div>
                    <p class="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
                      Delivery Address <span class="text-red-500">*</span>
                    </p>
                    <textarea rows="2"
                      class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm resize-none mb-2 focus:outline-none focus:ring-2 focus:ring-orange-300"
                      value={co.address || ''}
                      on:input={e => setCheckoutField(group.sellerId, 'address', e.target.value)}
                      placeholder="Your delivery address (or click the map below)"
                    />
                    <div id="map-{group.sellerId}" class="w-full rounded-xl overflow-hidden border border-border" style="height:220px;z-index:0;"></div>
                    <p class="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
                      <InfoIcon size={11}/> Click the map or drag the pin to set your location.
                    </p>
                  </div>

                  <!-- Notes -->
                  <div>
                    <p class="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Notes</p>
                    <textarea rows="2"
                      class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm resize-none focus:outline-none"
                      value={co.notes || ''}
                      on:input={e => setCheckoutField(group.sellerId, 'notes', e.target.value)}
                      placeholder="Allergies, special requests…"
                    />
                  </div>

                  <!-- Schedule toggle -->
                  <div class="rounded-xl border border-border bg-background p-4">
                    <div class="flex items-center justify-between">
                      <div>
                        <p class="text-sm font-semibold flex items-center gap-1.5">
                          <CalendarIcon size={15} style="color:#FF6B35;"/>
                          Schedule for later
                        </p>
                        <p class="text-xs text-muted-foreground mt-0.5">Birthday cakes, event catering, advance orders…</p>
                      </div>
                      <button
                        class="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                        style={scheduleEnabled[group.sellerId] ? 'background-color:#FF6B35;' : 'background-color:hsl(var(--muted));'}
                        on:click={() => { scheduleEnabled[group.sellerId] = !scheduleEnabled[group.sellerId]; scheduleEnabled = {...scheduleEnabled}; }}
                        aria-label="Toggle schedule"
                      >
                        <span class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={scheduleEnabled[group.sellerId] ? 'transform:translateX(20px);' : ''}></span>
                      </button>
                    </div>

                    {#if scheduleEnabled[group.sellerId]}
                      {@const sid  = group.sellerId}
                      {@const yr   = calendarYear[sid]}
                      {@const mo   = calendarMonth[sid]}
                      {@const info = calDays(yr, mo)}

                      <div class="mt-4 pt-4 border-t border-border">

                        <!-- Calendar -->
                        <div class="rounded-xl border border-border bg-card overflow-hidden mb-3">

                          <!-- Month nav -->
                          <div class="flex items-center justify-between px-4 py-2.5 border-b border-border">
                            <button
                              class="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground disabled:opacity-30"
                              disabled={!canGoPrev(sid)}
                              on:click={() => calPrev(sid)}
                            >‹</button>
                            <span class="text-sm font-semibold">{MONTHS[mo]} {yr}</span>
                            <button class="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground" on:click={() => calNext(sid)}>›</button>
                          </div>

                          <!-- Day-of-week header -->
                          <div class="grid grid-cols-7 border-b border-border">
                            {#each DAYS as d}
                              <div class="py-1.5 text-center text-[10px] font-semibold text-muted-foreground">{d}</div>
                            {/each}
                          </div>

                          <!-- Day grid -->
                          <div class="grid grid-cols-7 p-2 gap-0.5">
                            <!-- Blank cells before first day -->
                            {#each Array(info.first) as _}
                              <div></div>
                            {/each}
                            <!-- Day cells -->
                            {#each Array(info.total) as _, idx}
                              {@const day = idx + 1}
                              {@const past     = isPast(sid, day)}
                              {@const selected = isSelected(sid, day)}
                              {@const todayDay = isToday(sid, day)}
                              <button
                                class="h-8 w-full rounded-lg text-xs font-medium transition-all relative
                                  {past     ? 'text-muted-foreground/30 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}
                                  {selected ? 'text-white font-bold' : ''}
                                  {todayDay && !selected ? 'font-bold' : ''}"
                                style={selected ? 'background-color:#FF6B35;' : ''}
                                disabled={past}
                                on:click={() => selectDay(sid, day)}
                              >
                                {day}
                                {#if todayDay && !selected}
                                  <span class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style="background:#FF6B35;"></span>
                                {/if}
                              </button>
                            {/each}
                          </div>
                        </div>

                        <!-- Time picker -->
                        <div class="flex items-center gap-3">
                          <label class="text-xs font-medium text-muted-foreground whitespace-nowrap">Delivery time</label>
                          <input
                            type="time"
                            bind:value={scheduledTime[group.sellerId]}
                            class="flex-1 border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                          />
                        </div>

                        <!-- Preview -->
                        {#if formatScheduledPreview(sid)}
                          <div class="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium" style="background:#FF6B3512;color:#FF6B35;">
                            <CalendarIcon size={13}/>
                            Scheduled for {formatScheduledPreview(sid)}
                          </div>
                        {:else}
                          <p class="mt-2 text-xs text-muted-foreground">Select a date above to schedule your order.</p>
                        {/if}
                      </div>
                    {/if}
                  </div>

                  <!-- Payment method -->
                  <div>
                    <p class="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Payment Method</p>
                    <div class="grid grid-cols-2 gap-2">
                      <!-- eSewa -->
                      <button
                        class="flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left"
                        style={method === 'esewa' ? 'border-color:#6EC747;background:#6EC74710;' : 'border-color:hsl(var(--border));'}
                        on:click={() => { paymentMethod[group.sellerId] = 'esewa'; paymentMethod = {...paymentMethod}; }}
                      >
                        <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style="background:#6EC747;">
                          <CreditCardIcon size={16} weight="fill" color="white"/>
                        </div>
                        <div class="min-w-0">
                          <p class="text-sm font-semibold leading-tight" style={method === 'esewa' ? 'color:#2e7d14;' : ''}>eSewa</p>
                          <p class="text-[10px] text-muted-foreground">Digital wallet</p>
                        </div>
                        {#if method === 'esewa'}<CheckCircleIcon size={14} class="ml-auto flex-shrink-0" style="color:#6EC747;" weight="fill"/>{/if}
                      </button>
                      <!-- COD -->
                      <button
                        class="flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left"
                        style={method === 'cod' ? 'border-color:#FF6B35;background:#FF6B3510;' : 'border-color:hsl(var(--border));'}
                        on:click={() => { paymentMethod[group.sellerId] = 'cod'; paymentMethod = {...paymentMethod}; }}
                      >
                        <div class="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                          <MoneyIcon size={18} weight="duotone" style="color:#D97706;"/>
                        </div>
                        <div class="min-w-0">
                          <p class="text-sm font-semibold leading-tight" style={method === 'cod' ? 'color:#FF6B35;' : ''}>Cash</p>
                          <p class="text-[10px] text-muted-foreground">Pay on delivery</p>
                        </div>
                        {#if method === 'cod'}<CheckCircleIcon size={14} class="ml-auto flex-shrink-0" style="color:#FF6B35;" weight="fill"/>{/if}
                      </button>
                    </div>
                  </div>

                  <!-- Order summary -->
                  <div class="rounded-xl border border-border bg-background px-4 py-3 space-y-1.5">
                    <div class="flex justify-between text-sm text-muted-foreground">
                      <span>Items ({group.entries.reduce((s,e) => s+e.quantity, 0)})</span>
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

                  <!-- Actions -->
                  <div class="flex gap-2">
                    <button class="p-3 rounded-xl border border-border hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 transition-colors flex-shrink-0"
                      title="Remove all items from {group.sellerName}"
                      on:click={() => removeSellerItems(group.sellerId)}>
                      <TrashIcon size={16}/>
                    </button>
                    <button
                      class="flex-1 py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-white"
                      style={method === 'esewa' ? 'background-color:#6EC747;' : 'background-color:#FF6B35;'}
                      disabled={co.placing}
                      on:click={() => handlePlaceOrder(group)}
                    >
                      {#if co.placing}
                        <span class="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>
                        {method === 'esewa' ? 'Redirecting to eSewa…' : 'Placing order…'}
                      {:else if method === 'esewa'}
                        <CreditCardIcon size={16} weight="fill"/>
                        Pay with eSewa · Rs. {group.subtotal.toFixed(2)}
                      {:else if isScheduled}
                        <CalendarIcon size={15}/>
                        Schedule Order · Rs. {group.subtotal.toFixed(2)}
                      {:else}
                        <MoneyIcon size={16} weight="fill"/>
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

      {#if $cartBySeller.length > 1}
        <div class="mt-4 px-5 py-4 bg-card border border-border rounded-2xl flex items-center justify-between">
          <div>
            <p class="text-xs text-muted-foreground">Grand total</p>
            <p class="text-xl font-bold">Rs. {$cartTotal.toFixed(2)}</p>
          </div>
          <p class="text-xs text-muted-foreground text-right">Expand each seller<br/>above to place orders</p>
        </div>
      {/if}
    {/if}
  </main>
</div>

<style>
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }
</style>