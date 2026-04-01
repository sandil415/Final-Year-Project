<script>
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import { page } from '$app/stores';
  import {
    Camera, Heart, MessageCircle, Store, ChefHat, Truck,
    UtensilsCrossed, Clock, ShoppingCart, Plus, Minus, X,
    MapPinIcon, PhoneIcon, Trash2, ChevronDown, ChevronUp, MapPin
  } from 'lucide-svelte';
  import Header from '$lib/components/Header.svelte';
  import PostModal from '$lib/components/PostModal.svelte';
  import HighlightsSection from '$lib/components/HighlightsSection.svelte';
  import { BowlFoodIcon } from 'phosphor-svelte';
  import {
    cart,
    cartItems,
    cartCount,
    cartTotal,
    cartBySeller,
    checkoutState,
    sellerCache,
    addItem as addCartItem,
    removeItem as removeCartItem,
    clearCart as clearCartStore,
    removeSellerItems,
    cacheSellerRecord,
    initCheckout,
    setCheckoutField,
  } from '$lib/stores/cart';
  import { showCartDrawer } from '$lib/stores/ui';

  // ── Profile state 
  let user = null;
  let currentUser = null;
  let loading = true;
  let isOwnProfile = false;
  let isFollowing = false;
  let followRecordId = null;

  // ── Posts ─────────────────────────────────────────────────────────────────────
  let posts = [];
  let postsCount = 0;
  let loadingPosts = true;
  let selectedPostId = null;
  let postStats = {};

  // ── Stats ─────────────────────────────────────────────────────────────────────
  let followersCount = 0;
  let followingCount = 0;

  // ── Tabs ──────────────────────────────────────────────────────────────────────
  let profileTab = 'posts';

  // ── Menu ──────────────────────────────────────────────────────────────────────
  let menuItems = [];
  let loadingMenu = false;
  let menuLoaded = false;

  // ── Cart drawer ───────────────────────────────────────────────────────────────
  let showCart = false;

  // Which seller group is expanded in the drawer (null = all collapsed)
  let expandedSeller = null;

  // ── Leaflet map (per-seller) ──────────────────────────────────────────────────
  // Keyed by sellerId → { map, marker }  — populated lazily when a map opens
  let leafletInstances = {};

  // ── Toast ─────────────────────────────────────────────────────────────────────
  let toast = null;
  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => (toast = null), 3000);
  }

  // ── Constants 
  const businessTypeLabels = {
    home_chef: 'Home Chef',
    restaurant: 'Restaurant',
    food_truck: 'Food Truck',
    catering: 'Catering',
  };

  const businessTypeIcons = {
    home_chef: ChefHat,
    restaurant: Store,
    food_truck: Truck,
    catering: UtensilsCrossed,
  };

  // ── Follow data 
  async function loadFollowData() {
    try {
      const [fd, fing] = await Promise.all([
        pb.collection('follows').getList(1, 1, { filter: `following = "${user.id}"` }),
        pb.collection('follows').getList(1, 1, { filter: `follower = "${user.id}"` }),
      ]);
      followersCount = fd.totalItems;
      followingCount = fing.totalItems;
    } catch (err) {
      console.error('Failed to load follow stats:', err);
    }
  }

  // ── Mount 
  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.record;

    const username = $page.params?.username || currentUser.username;
    isOwnProfile = username === currentUser.username;

    if (isOwnProfile) {
      user = currentUser;
      loading = false;
    } else {
      await loadUserProfile(username);
    }

    if (user) {
      await loadFollowData();
      await loadPosts();

      // Check follow status
      if (!isOwnProfile) {
        try {
          const res = await pb.collection('follows').getList(1, 1, {
            filter: `follower = "${currentUser.id}" && following = "${user.id}"`,
          });
          if (res.items.length > 0) {
            isFollowing = true;
            followRecordId = res.items[0].id;
          }
        } catch (_) {}
      }

      // Cache the seller record so cartBySeller can resolve names
      if (user.accountType === 'business') {
        cacheSellerRecord(user);
      }
    }
  });

  onDestroy(() => {
    // Clean up all Leaflet instances
    for (const inst of Object.values(leafletInstances)) {
      try { inst.map?.remove(); } catch (_) {}
    }
  });

  // ── Profile load 
  async function loadUserProfile(username) {
    try {
      const records = await pb.collection('users').getList(1, 1, {
        filter: `username = "${username}"`,
      });
      if (records.items.length > 0) {
        user = records.items[0];
        if (isOwnProfile) {
          pb.authStore.save(pb.authStore.token, user);
          currentUser = user;
        }
      } else {
        goto('/search');
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      goto('/search');
    } finally {
      loading = false;
    }
  }

  // ── Posts ─────────────────────────────────────────────────────────────────────
  async function loadPosts() {
    try {
      loadingPosts = true;
      const result = await pb.collection('posts').getList(1, 50, {
        filter: `user = "${user.id}"`,
        sort: '-created',
      });
      posts = result.items;
      postsCount = result.totalItems;
      await loadPostsStats();
    } catch (err) {
      console.error('Failed to load posts:', err);
      posts = [];
      postsCount = 0;
    } finally {
      loadingPosts = false;
    }
  }

  async function loadPostsStats() {
    for (const post of posts) {
      try {
        const [l, c] = await Promise.all([
          pb.collection('likes').getList(1, 1, { filter: `post = "${post.id}"` }),
          pb.collection('comments').getList(1, 1, { filter: `post = "${post.id}"` }),
        ]);
        postStats[post.id] = { likes: l.totalItems, comments: c.totalItems };
      } catch (_) {
        postStats[post.id] = { likes: 0, comments: 0 };
      }
    }
    postStats = postStats;
  }

  // ── Menu 
  async function loadPublicMenu() {
    if (menuLoaded) return;
    loadingMenu = true;
    try {
      const result = await pb.collection('menuItems').getFullList({
        filter: `seller = "${user.id}" && isAvailable = true`,
        sort: 'category,name',
      });
      menuItems = result;
      menuLoaded = true;
      // Cache seller for cart grouping display
      cacheSellerRecord(user);
    } catch (err) {
      console.error('Failed to load menu:', err);
      menuItems = [];
    } finally {
      loadingMenu = false;
    }
  }

  function payWithEsewa(order) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://uat.esewa.com.np/epay/main'; // test URL

  const fields = {
    amt: order.totalAmount,
    psc: 0,
    pdc: 0,
    txAmt: 0,
    tAmt: order.totalAmount,
    pid: order.id, // unique order ID
    scd: 'EPAYTEST',
    su: 'http://localhost:5173/payment/success',
    fu: 'http://localhost:5173/payment/failure',
  };

  for (let key in fields) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = fields[key];
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

  function switchTab(tab) {
    if (tab === 'menu' && user?.accountType !== 'business') return;
    profileTab = tab;
    if (tab === 'menu' && !menuLoaded) loadPublicMenu();
  }

  // ── Cart helpers ──────────────────────────────────────────────────────────────
  function addToCart(item) {
    addCartItem(item, 1);
    initCheckout(item.seller);
    showToast(`${item.name} added to cart`);
  }

  function removeFromCart(itemId) {
    removeCartItem(itemId, 1);
  }

  function openCart() {
    // Auto-expand the current page's seller if there's only one
    const groups = $cartBySeller;
    if (groups.length === 1) expandedSeller = groups[0].sellerId;
    else expandedSeller = null;
    showCart = true;
  }

  function toggleSellerExpand(sellerId) {
    expandedSeller = expandedSeller === sellerId ? null : sellerId;
    if (expandedSeller === sellerId) {
      // Init checkout state if missing
      initCheckout(sellerId);
    }
  }

  // ── Leaflet map 
  async function initLeafletMap(sellerId, containerId) {
    if (leafletInstances[sellerId]) return; // already inited

    await tick(); // ensure DOM is rendered

    if (typeof window === 'undefined') return;

    // Dynamically load Leaflet if not already loaded
    if (!window.L) {
      await new Promise((resolve, reject) => {
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
    const el = document.getElementById(containerId);
    if (!el) return;

    // Default center: Kathmandu (fallback if no geolocation)
    const defaultCenter = [27.7172, 85.324];
    const map = L.map(el, { zoomControl: true }).setView(defaultCenter, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Custom pin icon
    const pinIcon = L.divIcon({
      className: '',
      html: `<div style="width:32px;height:32px;background:#FF6B35;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });

    const marker = L.marker(defaultCenter, { icon: pinIcon, draggable: true }).addTo(map);

    // Try geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], 15);
          marker.setLatLng([latitude, longitude]);
          reverseGeocode(sellerId, latitude, longitude);
        },
        () => {} // silently ignore denial
      );
    }

    // On marker drag end → reverse geocode
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng();
      setCheckoutField(sellerId, 'lat', lat);
      setCheckoutField(sellerId, 'lng', lng);
      reverseGeocode(sellerId, lat, lng);
    });

    // On map click → move marker
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      setCheckoutField(sellerId, 'lat', lat);
      setCheckoutField(sellerId, 'lng', lng);
      reverseGeocode(sellerId, lat, lng);
    });

    leafletInstances[sellerId] = { map, marker };

    // Invalidate size after initial render
    setTimeout(() => map.invalidateSize(), 200);
  }

  async function reverseGeocode(sellerId, lat, lng) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
      );
      const data = await res.json();
      const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      setCheckoutField(sellerId, 'address', addr);
    } catch (_) {
      setCheckoutField(sellerId, 'address', `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }
  }

  // Called when address map section becomes visible
  async function onMapSectionOpen(sellerId) {
    const containerId = `leaflet-map-${sellerId}`;
    await initLeafletMap(sellerId, containerId);
    // Invalidate again in case transition was playing
    setTimeout(() => leafletInstances[sellerId]?.map?.invalidateSize(), 300);
  }

  // ── Map visibility toggle per seller ─────────────────────────────────────────
  let showMapFor = {}; // sellerId → boolean

  function toggleMap(sellerId) {
    showMapFor[sellerId] = !showMapFor[sellerId];
    showMapFor = showMapFor;
    if (showMapFor[sellerId]) {
      onMapSectionOpen(sellerId);
    }
  }

  // ── Place order (per seller) ──────────────────────────────────────────────────
  // async function placeOrderForSeller(group) {
  //   const sid = group.sellerId;
  //   const co = $checkoutState[sid];

  //   if (!co?.address?.trim()) {
  //     showToast('Please enter a delivery address', 'error');
  //     return;
  //   }

  //   setCheckoutField(sid, 'placing', true);

  //   try {
  //     const items = group.entries.map((e) => ({
  //       menuItemId: e.item.id,
  //       name: e.item.name,
  //       price: e.item.price,
  //       quantity: e.quantity,
  //     }));

  //     await pb.collection('orders').create({
  //       buyer: currentUser.id,
  //       seller: sid,
  //       items,
  //       totalAmount: group.subtotal,
  //       status: 'pending',
  //       deliveryAddress: co.address,
  //       notes: co.notes || '',
  //     });

  //     await pb.collection('notifications').create({
  //       user: sid,
  //       triggeredBy: currentUser.id,
  //       type: 'message',
  //       message: `${currentUser.username} placed a new order worth Rs. ${group.subtotal.toFixed(2)}.`,
  //       read: false,
  //     });

  //     setCheckoutField(sid, 'success', true);
  //     removeSellerItems(sid);
  //     showToast(`Order placed with ${group.sellerName}!`);

  //     setTimeout(() => {
  //       setCheckoutField(sid, 'success', false);
  //       if ($cartBySeller.length === 0) showCart = false;
  //     }, 3000);
  //   } catch (err) {
  //     showToast(err.message || 'Failed to place order', 'error');
  //   } finally {
  //     setCheckoutField(sid, 'placing', false);
  //   }
  // }

  async function placeOrderForSeller(group) {
  const sid = group.sellerId;
  const co = $checkoutState[sid];

  if (!co?.address?.trim()) {
    showToast('Please enter a delivery address', 'error');
    return;
  }

  const amount = group.subtotal;
  const transactionId = `ORDER_${Date.now()}`;

  // Save temporary order in localStorage (or DB if you want)
  localStorage.setItem('pendingOrder', JSON.stringify({
    buyer: currentUser.id,
    seller: sid,
    items: group.entries,
    totalAmount: amount,
    address: co.address,
    notes: co.notes,
    transactionId
  }));

  // eSewa test URL
  const esewaUrl = "https://rc-epay.esewa.com.np/api/epay/main/v2/form";

  const form = document.createElement("form");
  form.method = "POST";
  form.action = esewaUrl;

  const fields = {
    amt: amount,
    psc: 0,
    pdc: 0,
    txAmt: 0,
    tAmt: amount,
    pid: transactionId,
    scd: "EPAYTEST", // test merchant code
    su: "http://localhost:5173/payment-success",
    fu: "http://localhost:5173/payment-failure"
  };

  for (let key in fields) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = fields[key];
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

  // Follow / Message 
  async function toggleFollow() {
    if (isFollowing) {
      try {
        await pb.collection('follows').delete(followRecordId);
        isFollowing = false;
        followRecordId = null;
        followersCount = Math.max(0, followersCount - 1);
      } catch (err) {
        console.error('Failed to unfollow:', err);
      }
    } else {
      try {
        const newFollow = await pb.collection('follows').create({
          follower: currentUser.id,
          following: user.id,
        });
        isFollowing = true;
        followRecordId = newFollow.id;
        followersCount += 1;
        await pb.collection('notifications').create({
          user: user.id,
          triggeredBy: currentUser.id,
          type: 'follow',
          message: `${currentUser.username} started following you.`,
          read: false,
        });
      } catch (err) {
        console.error('Failed to follow:', err);
      }
    }
  }

  async function messageUser() {
    if (!currentUser || !user) return;
    try {
      const existing = await pb.collection('conversations').getList(1, 1, {
        filter: `participants.id ?= "${currentUser.id}" && participants.id ?= "${user.id}"`,
      });
      if (existing.items.length > 0) {
        goto(`/messages/${existing.items[0].id}`);
        return;
      }
      const conversation = await pb.collection('conversations').create({
        participants: [currentUser.id, user.id],
        lastMessage: '',
        lastMessageTime: new Date().toISOString(),
      });
      goto(`/messages/${conversation.id}`);
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  }

  // Post modal
  function openPost(postId) { selectedPostId = postId; }
  function closePost() { selectedPostId = null; loadPosts(); }
  function handlePostDeleted(deletedPostId) {
    posts = posts.filter((p) => p.id !== deletedPostId);
    postsCount = Math.max(0, postsCount - 1);
    delete postStats[deletedPostId];
  }

  // Derived
  $: groupedMenu = menuItems.reduce((acc, item) => {
    const cat = item.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  $: isBusiness = user?.accountType === 'business';
  $: BusinessIcon = businessTypeIcons[user?.businessType] || Store;
</script>

<!-- Toast -->
{#if toast}
  <div
    class="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold text-white transition-all pointer-events-none"
    style={toast.type === 'error'
      ? 'background-color: #EF4444;'
      : 'background-color: hsl(var(--activeColor));'}
  >
    {toast.msg}
  </div>
{/if}

<!-- Multi-seller Cart Drawer -->
{#if showCart}
  <div class="fixed inset-0 z-50 flex">
    <!-- Backdrop -->
    <div
      class="flex-1 bg-black/50 backdrop-blur-sm"
      on:click={() => (showCart = false)}
      role="presentation"
    ></div>

    <!-- Drawer -->
    <div class="w-full max-w-sm bg-background border-l border-border flex flex-col shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 class="font-bold text-lg">Your cart</h2>
          <p class="text-xs text-muted-foreground">
            {$cartBySeller.length} seller{$cartBySeller.length !== 1 ? 's' : ''}
            · {$cartCount} item{$cartCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button class="p-2 hover:bg-muted rounded-full" on:click={() => (showCart = false)}>
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Scrollable seller groups -->
      <div class="flex-1 overflow-y-auto">
        {#each $cartBySeller as group (group.sellerId)}
          {@const co = $checkoutState[group.sellerId] || {}}
          {@const isExpanded = expandedSeller === group.sellerId}

          <div class="border-b border-border">
            <!-- Seller header row (click to expand/collapse) -->
            <button
              class="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/40 transition-colors text-left"
              on:click={() => toggleSellerExpand(group.sellerId)}
            >
              <!-- Seller avatar -->
              {#if group.sellerRecord?.avatar}
                <img
                  src={pb.files.getUrl(group.sellerRecord, group.sellerRecord.avatar)}
                  alt={group.sellerName}
                  class="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-1 ring-border"
                />
              {:else}
                <div
                  class="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style="background-color: #FF6B35;"
                >
                  {group.sellerName.charAt(0).toUpperCase()}
                </div>
              {/if}

              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm truncate">{group.sellerName}</p>
                <p class="text-xs text-muted-foreground">
                  {group.entries.length} item{group.entries.length !== 1 ? 's' : ''}
                  · Rs. {group.subtotal.toFixed(2)}
                </p>
              </div>

              <!-- Expand chevron -->
              <div class="flex-shrink-0 text-muted-foreground">
                {#if isExpanded}
                  <ChevronUp class="w-4 h-4" />
                {:else}
                  <ChevronDown class="w-4 h-4" />
                {/if}
              </div>
            </button>

            <!-- Expanded section -->
            {#if isExpanded}
              <div class="px-4 pb-4 space-y-3">

                {#if co.success}
                  <!-- Success state -->
                  <div class="flex flex-col items-center py-8 text-center">
                    <div class="w-14 h-14 rounded-full flex items-center justify-center mb-3 text-3xl" style="background-color: #FF6B3520;">🎉</div>
                    <h3 class="font-bold mb-1">Order placed!</h3>
                    <p class="text-sm text-muted-foreground">Seller will confirm shortly.</p>
                  </div>

                {:else}
                  <!-- Items list -->
                  {#each group.entries as { item, quantity }}
                    <div class="flex items-center gap-3 p-3 bg-card border border-border rounded-xl">
                      {#if item.image}
                        <img
                          src={pb.files.getUrl(item, item.image)}
                          alt={item.name}
                          class="w-11 h-11 rounded-lg object-cover flex-shrink-0"
                        />
                      {:else}
                        <div class="w-11 h-11 rounded-lg bg-muted flex items-center justify-center text-lg flex-shrink-0">🍽️</div>
                      {/if}

                      <div class="flex-1 min-w-0">
                        <p class="font-medium text-sm truncate">{item.name}</p>
                        <p class="text-xs text-muted-foreground">Rs. {(item.price * quantity).toFixed(2)}</p>
                      </div>

                      <!-- Qty controls -->
                      <div class="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          class="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                          on:click={() => removeFromCart(item.id)}
                        >
                          <Minus class="w-3 h-3" />
                        </button>
                        <span class="text-sm font-semibold w-4 text-center">{quantity}</span>
                        <button
                          class="w-6 h-6 rounded-full flex items-center justify-center text-white hover:opacity-90 transition-opacity"
                          style="background-color: #FF6B35;"
                          on:click={() => addToCart(item)}
                        >
                          <Plus class="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  {/each}

                  <!-- ── Delivery Address ── -->
                  <div class="pt-1 space-y-2">
                    <div class="flex items-center justify-between">
                      <label class="text-sm font-medium">
                        Delivery address <span class="text-red-500">*</span>
                      </label>
                      <!-- Toggle map button -->
                      <button
                        class="flex items-center gap-1 text-xs font-semibold hover:opacity-80 transition-opacity"
                        style="color: #FF6B35;"
                        on:click={() => toggleMap(group.sellerId)}
                      >
                        <MapPin class="w-3.5 h-3.5" />
                        {showMapFor[group.sellerId] ? 'Hide map' : 'Pin on map'}
                      </button>
                    </div>

                    <!-- Address text input -->
                    <input
                      class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm"
                      value={co.address || ''}
                      on:input={(e) => setCheckoutField(group.sellerId, 'address', e.target.value)}
                      placeholder="Your delivery address"
                    />

                    <!-- Leaflet map (conditionally shown) -->
                    {#if showMapFor[group.sellerId]}
                      <div
                        id="leaflet-map-{group.sellerId}"
                        class="w-full rounded-xl overflow-hidden border border-border"
                        style="height: 200px;"
                      ></div>
                      <p class="text-xs text-muted-foreground">
                        Click the map or drag the pin to set your delivery location.
                      </p>
                    {/if}

                    <!-- Notes -->
                    <textarea
                      rows="2"
                      class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm resize-none"
                      value={co.notes || ''}
                      on:input={(e) => setCheckoutField(group.sellerId, 'notes', e.target.value)}
                      placeholder="Special requests or allergies?"
                    />
                  </div>

                  <!-- ── Subtotal + Place Order ── -->
                  <div class="pt-1 space-y-2">
                    <div class="flex items-center justify-between text-sm">
                      <span class="text-muted-foreground">Subtotal</span>
                      <span class="font-bold">Rs. {group.subtotal.toFixed(2)}</span>
                    </div>

                    <div class="flex items-center gap-2">
                      <!-- Remove seller items -->
                      <button
                        class="p-2.5 rounded-xl border border-border hover:bg-muted transition-colors text-muted-foreground"
                        title="Remove all items from {group.sellerName}"
                        on:click={() => removeSellerItems(group.sellerId)}
                      >
                        <Trash2 class="w-4 h-4" />
                      </button>

                      <!-- Place order -->
                      <button
                        class="flex-1 py-2.5 rounded-xl text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        style="background-color: #FF6B35;"
                        disabled={co.placing}
                        on:click={() => placeOrderForSeller(group)}
                      >
                        {co.placing ? 'Placing…' : `Order from ${group.sellerName}`}
                      </button>
                    </div>
                  </div>
                {/if}

              </div>
            {/if}
          </div>
        {/each}

        <!-- Empty state -->
        {#if $cartBySeller.length === 0}
          <div class="flex flex-col items-center py-20 text-center px-8">
            <div class="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4 text-2xl"><ShoppingCart/></div>
            <p class="font-semibold text-foreground mb-1">Your cart is empty</p>
            <p class="text-sm text-muted-foreground">Add items from a seller's menu to get started.</p>
          </div>
        {/if}
      </div>

      <!-- Grand total footer -->
      {#if $cartBySeller.length > 0}
        <div class="px-5 py-4 border-t border-border flex-shrink-0">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground font-medium">Grand total</span>
            <span class="font-bold text-base">Rs. {$cartTotal.toFixed(2)}</span>
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            Expand each seller above to place individual orders.
          </p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- ── Page ───────────────────────────────────────────────────────────────────── -->
<div class="min-h-screen flex flex-col bg-background text-foreground">
  <Header />

  <main class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="max-w-4xl mx-auto p-10 text-center py-20">
        <div
          class="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto"
          style="border-color: #FF6B35; border-top-color: transparent;"
        ></div>
      </div>

    {:else if user}
      <div class="max-w-4xl mx-auto px-6 py-10">

        <!-- PROFILE HEADER -->
        <div class="flex gap-10 items-start mb-8">
          <!-- Avatar -->
          <div class="relative flex-shrink-0">
            <img
              src={user.avatar
                ? pb.files.getUrl(user, user.avatar)
                : '/images/profilePlaceholder.jpg'}
              alt={user.username}
              class="w-24 h-24 rounded-full object-cover ring-2 ring-border"
            />
            {#if isBusiness}
              <div
                class="absolute -bottom-1 -right-1 w-8 h-8 rounded-full border-2 border-background flex items-center justify-center"
                style="background-color: #FF6B35;"
                title={businessTypeLabels[user.businessType] || 'Business'}
              >
                <svelte:component this={BusinessIcon} class="w-4 h-4 text-white" />
              </div>
            {/if}
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-3 mb-3">
              <h1 class="text-xl font-bold text-foreground">{user.username}</h1>

              {#if isBusiness}
                <span
                  class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white flex-shrink-0"
                  style="background-color: #FF6B35;"
                >
                  <svelte:component this={BusinessIcon} class="w-3 h-3" />
                  {businessTypeLabels[user.businessType] || 'Business'}
                </span>
              {/if}

              {#if isOwnProfile}
                <button
                  class="border border-border text-foreground px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                  on:click={() => goto('/profile/edit')}
                >
                  Edit profile
                </button>
                {#if isBusiness}
                  <button
                    class="text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                    style="background-color: #FF6B35;"
                    on:click={() => goto('/business/dashboard')}
                  >
                    Dashboard
                  </button>
                {/if}
              {:else}
                <div class="flex gap-2">
                  <button
                    class="px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors
                      {isFollowing
                        ? 'border border-border text-foreground hover:bg-muted'
                        : 'text-white hover:opacity-90'}"
                    style={!isFollowing ? 'background-color: #FF6B35;' : ''}
                    on:click={toggleFollow}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  <button
                    class="border border-border text-foreground px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                    on:click={messageUser}
                  >
                    Message
                  </button>
                </div>
              {/if}
            </div>

            <div class="flex gap-6 text-sm mb-3">
              <span class="text-foreground"><strong>{postsCount}</strong> posts</span>
              <button class="hover:opacity-70 text-foreground"><strong>{followersCount}</strong> followers</button>
              <button class="hover:opacity-70 text-foreground"><strong>{followingCount}</strong> following</button>
            </div>

            <p class="text-sm text-muted-foreground leading-relaxed">{user.bio || 'No bio yet'}</p>

            {#if isBusiness && !isOwnProfile && (user.businessDescription || user.businessPhone || user.businessAddress)}
              <div class="mt-4 p-4 rounded-xl border border-border bg-card space-y-1.5">
                {#if user.businessDescription}
                  <p class="text-sm text-foreground">{user.businessDescription}</p>
                {/if}
                <div class="flex flex-wrap items-center gap-5 text-xs text-muted-foreground">
                  {#if user.businessPhone}
                    <span class="flex items-center gap-2"><PhoneIcon />{user.businessPhone}</span>
                  {/if}
                  {#if user.businessAddress}
                    <span class="flex items-center gap-2"><MapPinIcon /> {user.businessAddress}</span>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- HIGHLIGHTS -->
        <div class="border-t border-border">
          <HighlightsSection userId={user.id} isOwnProfile={isOwnProfile} />
        </div>

        <!-- TABS -->
        {#if isBusiness}
          <div class="flex border-b border-border mb-0">
            <button
              class="flex-1 py-3 text-sm font-semibold border-b-2 transition-colors
                {profileTab === 'posts'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'}"
              on:click={() => switchTab('posts')}
            >
              Posts
            </button>
            <button
              class="flex-1 py-3 text-sm font-semibold border-b-2 transition-colors"
              style={profileTab === 'menu'
                ? 'border-color: #FF6B35; color: #FF6B35;'
                : 'border-color: transparent; color: var(--muted-foreground);'}
              on:click={() => switchTab('menu')}
            >
              Menu
            </button>
          </div>
        {:else}
          <div class="border-t border-border mt-0 mb-6"></div>
        {/if}

        <!-- ── POSTS TAB ─────────────────────────────────────────────────────── -->
        {#if profileTab === 'posts'}
          <div class="mt-6">
            {#if loadingPosts}
              <div class="text-center py-20">
                <div
                  class="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin mx-auto"
                  style="border-color: #FF6B35; border-top-color: transparent;"
                ></div>
              </div>
            {:else if postsCount === 0}
              <div class="flex flex-col items-center mt-16 text-center">
                <div class="w-16 h-16 border border-border rounded-full flex items-center justify-center mb-6">
                  <Camera class="w-8 h-8 text-muted-foreground" />
                </div>
                <h2 class="text-xl font-semibold mb-2 text-foreground">
                  {isOwnProfile ? 'Share photos' : 'No posts yet'}
                </h2>
                <p class="text-sm text-muted-foreground mb-4">
                  {isOwnProfile
                    ? "When you share photos, they'll appear on your profile."
                    : `${user.username} hasn't shared any photos yet.`}
                </p>
                {#if isOwnProfile}
                  <a href="/create" class="text-sm font-semibold hover:opacity-70" style="color: #FF6B35;">
                    Share your first photo
                  </a>
                {/if}
              </div>
            {:else}
              <div class="grid grid-cols-3 gap-1 md:gap-1">
                {#each posts as post}
                  <button
                    class="aspect-square bg-muted overflow-hidden hover:opacity-90 transition-opacity relative group"
                    on:click={() => openPost(post.id)}
                  >
                    <img
                      src={pb.files.getUrl(post, post.image)}
                      alt={post.caption || 'Post'}
                      class="w-full h-full object-cover"
                    />
                    <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white font-semibold text-sm">
                      <span class="flex items-center gap-1.5">
                        <Heart class="w-5 h-5 fill-white" />
                        {postStats[post.id]?.likes || 0}
                      </span>
                      <span class="flex items-center gap-1.5">
                        <MessageCircle class="w-5 h-5" />
                        {postStats[post.id]?.comments || 0}
                      </span>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

        <!-- ── MENU TAB ─────────────────────────────────────────────────────── -->
        {:else if profileTab === 'menu'}
          <div class="mt-6">
            {#if loadingMenu}
              <div class="text-center py-20">
                <div
                  class="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin mx-auto"
                  style="border-color: #FF6B35; border-top-color: transparent;"
                ></div>
              </div>
            {:else if menuItems.length === 0}
              <div class="flex flex-col items-center py-20 text-center">
                <div class="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4 text-2xl">
                  <BowlFoodIcon />
                </div>
                <p class="font-semibold text-foreground mb-1">No menu items yet</p>
                <p class="text-sm text-muted-foreground">
                  {isOwnProfile
                    ? 'Add items from your business dashboard.'
                    : "This seller hasn't added their menu yet."}
                </p>
                {#if isOwnProfile}
                  <button
                    class="mt-4 px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90"
                    style="background-color: #FF6B35;"
                    on:click={() => goto('/business/menu')}
                  >
                    Add menu items
                  </button>
                {/if}
              </div>
            {:else}
              <div class="space-y-8 pb-8">
                {#each Object.entries(groupedMenu) as [category, items]}
                  <div>
                    <h3 class="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">
                      {category}
                    </h3>
                    <div class="space-y-2">
                      {#each items as item}
                        {@const inCart = $cart[item.id]?.quantity || 0}
                        <div class="flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-border/60 transition-colors">
                          {#if item.image}
                            <img
                              src={pb.files.getUrl(item, item.image)}
                              alt={item.name}
                              class="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                            />
                          {:else}
                            <div class="w-16 h-16 rounded-xl bg-muted flex items-center justify-center text-2xl flex-shrink-0">🍽️</div>
                          {/if}

                          <div class="flex-1 min-w-0">
                            <p class="font-semibold text-sm text-foreground">{item.name}</p>
                            {#if item.description}
                              <p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                            {/if}
                            <div class="flex items-center gap-3 mt-1.5">
                              <span class="text-sm font-bold text-foreground">Rs. {item.price}</span>
                              {#if item.preparationTime}
                                <span class="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock class="w-3 h-3" />
                                  {item.preparationTime} min
                                </span>
                              {/if}
                            </div>
                          </div>

                          {#if !isOwnProfile}
                            <div class="flex-shrink-0">
                              {#if inCart === 0}
                                <button
                                  class="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                                  style="background-color: #FF6B35;"
                                  on:click={() => addToCart(item)}
                                >
                                  Add
                                </button>
                              {:else}
                                <div class="flex items-center gap-2">
                                  <button
                                    class="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                                    on:click={() => removeFromCart(item.id)}
                                  >
                                    <Minus class="w-3 h-3" />
                                  </button>
                                  <span class="text-sm font-bold w-4 text-center">{inCart}</span>
                                  <button
                                    class="w-8 h-8 rounded-full flex items-center justify-center text-white hover:opacity-90 transition-opacity"
                                    style="background-color: #FF6B35;"
                                    on:click={() => addToCart(item)}
                                  >
                                    <Plus class="w-3 h-3" />
                                  </button>
                                </div>
                              {/if}
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

      </div>
    {:else}
      <div class="max-w-4xl mx-auto p-10 text-center py-20">
        <p class="text-muted-foreground">Profile not found</p>
      </div>
    {/if}
  </main>
</div>

<!-- Floating Cart Button -->
{#if profileTab === 'menu' && !isOwnProfile && $cartCount > 0}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
    <button
      class="flex items-center gap-3 px-6 py-3.5 rounded-2xl text-white font-semibold shadow-2xl hover:opacity-95 transition-all"
      style="background-color: #FF6B35;"
      on:click={openCart}
    >
      <ShoppingCart class="w-5 h-5" />
      <span>View order · {$cartCount} item{$cartCount !== 1 ? 's' : ''}</span>
      <span class="font-bold">Rs. {$cartTotal.toFixed(2)}</span>
    </button>
  </div>
{/if}

<!-- Post Modal -->
{#if selectedPostId}
  <PostModal postId={selectedPostId} onClose={closePost} onDelete={handlePostDeleted} />
{/if}