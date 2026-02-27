<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import { page } from '$app/stores';
  import { Camera, Heart, MessageCircle, Store, ChefHat, Truck, UtensilsCrossed, Clock, ShoppingCart, Plus, Minus, X } from 'lucide-svelte';
  import Header from '$lib/components/Header.svelte';
  import PostModal from '$lib/components/PostModal.svelte';
  import HighlightsSection from '$lib/components/HighlightsSection.svelte';
  import { cart, cartItems, cartCount, cartTotal, addItem as addCartItem, removeItem as removeCartItem, clearCart as clearCartStore } from '$lib/stores/cart';

  let user = null;
  let loading = true;
  let isOwnProfile = false;
  let currentUser = null;
  let isFollowing = false;
  let followRecordId = null;

  // Posts
  let posts = [];
  let postsCount = 0;
  let loadingPosts = true;
  let selectedPostId = null;
  let postStats = {};

  // Stats
  let followersCount = 0;
  let followingCount = 0;

  // Profile tab: 'posts' | 'menu'
  let profileTab = 'posts';

  // Menu
  let menuItems = [];
  let loadingMenu = false;
  let menuLoaded = false;

  // Cart (for ordering from business profiles)
  let showCart = false;
  let orderNotes = '';
  let orderAddress = '';
  let placingOrder = false;
  let orderSuccess = false;

  // Toast
  let toast = null;
  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => toast = null, 3000);
  }

  const businessTypeLabels = {
    home_chef: 'Home Chef',
    restaurant: 'Restaurant',
    food_truck: 'Food Truck',
    catering: 'Catering'
  };

  const businessTypeIcons = {
    home_chef: ChefHat,
    restaurant: Store,
    food_truck: Truck,
    catering: UtensilsCrossed
  };

  async function loadFollowData() {
    try {
      const followersData = await pb.collection('follows').getList(1, 1, {
        filter: `following = "${user.id}"`
      });
      followersCount = followersData.totalItems;

      const followingData = await pb.collection('follows').getList(1, 1, {
        filter: `follower = "${user.id}"`
      });
      followingCount = followingData.totalItems;
    } catch (err) {
      console.error('Failed to load follow stats:', err);
    }
  }

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
    }
  });

  // async function loadUserProfile(username) {
  //   try {
  //     const records = await pb.collection('users').getList(1, 1, {
  //       filter: `username = "${username}"`
  //     });
  //     if (records.items.length > 0) {
  //       user = records.items[0];
  //     } else {
  //       goto('/search');
  //     }
  //   } catch (err) {
  //     console.error('Failed to load profile:', err);
  //     goto('/search');
  //   } finally {
  //     loading = false;
  //   }
  // }

  async function loadUserProfile(username) {
  try {
    const records = await pb.collection('users').getList(1, 1, {
      filter: `username = "${username}"`
    });
    if (records.items.length > 0) {
      user = records.items[0];
      // If own profile, sync the fresh data back into authStore
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
        const [likesResult, commentsResult] = await Promise.all([
          pb.collection('likes').getList(1, 1, { filter: `post = "${post.id}"` }),
          pb.collection('comments').getList(1, 1, { filter: `post = "${post.id}"` })
        ]);
        postStats[post.id] = {
          likes: likesResult.totalItems,
          comments: commentsResult.totalItems
        };
      } catch (err) {
        postStats[post.id] = { likes: 0, comments: 0 };
      }
    }
    postStats = postStats;
  }

  async function loadPublicMenu() {
    if (menuLoaded) return;
    loadingMenu = true;
    try {
      const result = await pb.collection('menuItems').getFullList({
        filter: `seller = "${user.id}" && isAvailable = true`,
        sort: 'category,name'
      });
      menuItems = result;
      menuLoaded = true;
    } catch (err) {
      console.error('Failed to load menu:', err);
      menuItems = [];
    } finally {
      loadingMenu = false;
    }
  }

  function switchTab(tab) {
    if (tab === 'menu' && user?.accountType !== 'business') {
      return;
    }
    profileTab = tab;
    if (tab === 'menu' && !menuLoaded) {
      loadPublicMenu();
    }
  }

  // Cart logic
  function addToCart(item) {
    addCartItem(item, 1);
    showToast(`${item.name} added to cart`);
  }

  function removeFromCart(itemId) {
    removeCartItem(itemId, 1);
  }

  function clearCart() {
    clearCartStore();
    showCart = false;
  }

  async function placeOrder() {
    if (cartItems.length === 0) return;
    if (!orderAddress.trim()) {
      showToast('Please enter a delivery address', 'error'); return;
    }
    placingOrder = true;
    try {
      const items = cartItems.map(c => ({
        menuItemId: c.item.id,
        name: c.item.name,
        price: c.item.price,
        quantity: c.quantity
      }));

      await pb.collection('orders').create({
        buyer: currentUser.id,
        seller: user.id,
        items: JSON.stringify(items),
        totalAmount: cartTotal,
        status: 'pending',
        deliveryAddress: orderAddress,
        notes: orderNotes
      });

      // Notify the seller
      await pb.collection('notifications').create({
        user: user.id,
        triggeredBy: currentUser.id,
        type: 'message',
        message: `${currentUser.username} placed a new order worth रु ${cartTotal.toFixed(2)}.`,
        read: false
      });

      orderSuccess = true;
      clearCart();
      showToast('Order placed successfully!');
      setTimeout(() => { orderSuccess = false; showCart = false; orderNotes = ''; orderAddress = ''; }, 3000);
    } catch (err) {
      showToast(err.message || 'Failed to place order', 'error');
    } finally {
      placingOrder = false;
    }
  }

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
          following: user.id
        });
        isFollowing = true;
        followRecordId = newFollow.id;
        followersCount += 1;

        await pb.collection('notifications').create({
          user: user.id,
          triggeredBy: currentUser.id,
          type: 'follow',
          message: `${currentUser.username} started following you.`,
          read: false
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
        filter: `participants.id ?= "${currentUser.id}" && participants.id ?= "${user.id}"`
      });
      if (existing.items.length > 0) {
        goto(`/messages/${existing.items[0].id}`); return;
      }
      const conversation = await pb.collection('conversations').create({
        participants: [currentUser.id, user.id],
        lastMessage: '',
        lastMessageTime: new Date().toISOString()
      });
      goto(`/messages/${conversation.id}`);
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  }

  function openPost(postId) { selectedPostId = postId; }
  function closePost() { selectedPostId = null; loadPosts(); }
  function handlePostDeleted(deletedPostId) {
    posts = posts.filter(p => p.id !== deletedPostId);
    postsCount = Math.max(0, postsCount - 1);
    delete postStats[deletedPostId];
  }

  // Group menu by category
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
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold text-white transition-all pointer-events-none"
    style={toast.type === 'error' ? 'background-color: #EF4444;' : 'background-color: #FF6B35;'}>
    {toast.msg}
  </div>
{/if}

<!-- Cart Drawer -->
{#if showCart}
  <div class="fixed inset-0 z-50 flex">
    <!-- Backdrop -->
    <div class="flex-1 bg-black/50 backdrop-blur-sm" on:click={() => showCart = false} role="presentation"></div>

    <!-- Drawer -->
    <div class="w-full max-w-sm bg-background border-l border-border flex flex-col shadow-2xl">
      <!-- Cart Header -->
      <div class="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 class="font-bold text-lg">Your order</h2>
          <p class="text-xs text-muted-foreground">from {user?.businessName}</p>
        </div>
        <button class="p-2 hover:bg-muted rounded-full" on:click={() => showCart = false}>
          <X class="w-5 h-5" />
        </button>
      </div>

      {#if orderSuccess}
        <div class="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div class="w-16 h-16 rounded-full flex items-center justify-center mb-4 text-3xl" style="background-color: #FF6B3520;">🎉</div>
          <h3 class="text-lg font-bold mb-1">Order placed!</h3>
          <p class="text-sm text-muted-foreground">The seller will confirm your order shortly.</p>
        </div>
      {:else}
        <!-- Cart Items -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          {#each cartItems as { item, quantity }}
            <div class="flex items-center gap-3 p-3 bg-card border border-border rounded-xl">
              {#if item.image}
                <img src={pb.files.getUrl(item, item.image)} alt={item.name} class="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              {:else}
                <div class="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-xl flex-shrink-0">🍽️</div>
              {/if}
              <div class="flex-1 min-w-0">
                <p class="font-medium text-sm truncate">{item.name}</p>
                <p class="text-sm text-muted-foreground">रु {(item.price * quantity).toFixed(2)}</p>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <button
                  class="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                  on:click={() => removeFromCart(item.id)}
                >
                  <Minus class="w-3 h-3" />
                </button>
                <span class="text-sm font-semibold w-4 text-center">{quantity}</span>
                <button
                  class="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                  on:click={() => addToCart(item)}
                >
                  <Plus class="w-3 h-3" />
                </button>
              </div>
            </div>
          {/each}

          <!-- Delivery details -->
          <div class="pt-2 space-y-3">
            <div>
              <label class="block text-sm font-medium mb-1">Delivery address <span class="text-red-500">*</span></label>
              <input
                class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm"
                bind:value={orderAddress}
                placeholder="Your delivery address"
              />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Special notes</label>
              <textarea
                rows="2"
                class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground text-sm resize-none"
                bind:value={orderNotes}
                placeholder="Any allergies or special requests?"
              />
            </div>
          </div>
        </div>

        <!-- Cart Footer -->
        <div class="p-4 border-t border-border space-y-3">
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">{cartCount} item{cartCount !== 1 ? 's' : ''}</span>
            <span class="font-bold text-lg">रु {cartTotal.toFixed(2)}</span>
          </div>
          <button
            class="w-full py-3 rounded-xl text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style="background-color: #FF6B35;"
            disabled={placingOrder || cartItems.length === 0}
            on:click={placeOrder}
          >
            {placingOrder ? 'Placing order...' : 'Place Order'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<div class="min-h-screen flex flex-col bg-background text-foreground">
  <Header />

  <main class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="max-w-4xl mx-auto p-10 text-center py-20">
        <div class="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto" style="border-color: #FF6B35; border-top-color: transparent;"></div>
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
            <!-- Username row -->
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
                      {isFollowing ? 'border border-border text-foreground hover:bg-muted' : 'text-white hover:opacity-90'}"
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

            <!-- Stats -->
            <div class="flex gap-6 text-sm mb-3">
              <span class="text-foreground"><strong>{postsCount}</strong> posts</span>
              <button class="hover:opacity-70 text-foreground"><strong>{followersCount}</strong> followers</button>
              <button class="hover:opacity-70 text-foreground"><strong>{followingCount}</strong> following</button>
            </div>

            <!-- Bio -->
            <p class="text-sm text-muted-foreground leading-relaxed">
              {user.bio || 'No bio yet'}
            </p>

            <!-- Business info card (non-owner view) -->
            {#if isBusiness && !isOwnProfile && (user.businessDescription || user.businessPhone || user.businessAddress)}
              <div class="mt-4 p-4 rounded-xl border border-border bg-card space-y-1.5">
                {#if user.businessDescription}
                  <p class="text-sm text-foreground">{user.businessDescription}</p>
                {/if}
                <div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {#if user.businessPhone}
                    <span>📞 {user.businessPhone}</span>
                  {/if}
                  {#if user.businessAddress}
                    <span>📍 {user.businessAddress}</span>
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

        <!-- TABS (only for business accounts) -->
        {#if isBusiness}
          <div class="flex border-b border-border mb-0">
            <button
              class="flex-1 py-3 text-sm font-semibold border-b-2 transition-colors
                {profileTab === 'posts' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
              on:click={() => switchTab('posts')}
            >
              Posts
            </button>
            <button
              class="flex-1 py-3 text-sm font-semibold border-b-2 transition-colors"
              style={profileTab === 'menu' ? 'border-color: #FF6B35; color: #FF6B35;' : 'border-color: transparent; color: var(--muted-foreground);'}
              on:click={() => switchTab('menu')}
            >
              Menu
            </button>
          </div>
        {:else}
          <div class="border-t border-border mt-0 mb-6"></div>
        {/if}

        <!-- ── POSTS TAB ── -->
        {#if profileTab === 'posts'}
          <div class="mt-6">
            {#if loadingPosts}
              <div class="text-center py-20">
                <div class="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin mx-auto" style="border-color: #FF6B35; border-top-color: transparent;"></div>
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

        <!-- ── MENU TAB ── -->
        {:else if profileTab === 'menu'}
          <div class="mt-6">
            {#if loadingMenu}
              <div class="text-center py-20">
                <div class="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin mx-auto" style="border-color: #FF6B35; border-top-color: transparent;"></div>
              </div>
            {:else if menuItems.length === 0}
              <div class="flex flex-col items-center py-20 text-center">
                <div class="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4 text-2xl">🍽️</div>
                <p class="font-semibold text-foreground mb-1">No menu items yet</p>
                <p class="text-sm text-muted-foreground">
                  {isOwnProfile ? 'Add items from your business dashboard.' : 'This seller hasn\'t added their menu yet.'}
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
              <!-- Menu grouped by category -->
              <div class="space-y-8 pb-8">
                {#each Object.entries(groupedMenu) as [category, items]}
                  <div>
                    <h3 class="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">{category}</h3>
                    <div class="space-y-2">
                      {#each items as item}
                        {@const inCart = $cart[item.id]?.quantity || 0}
                        <div class="flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-border/60 transition-colors">
                          <!-- Food image -->
                          {#if item.image}
                            <img
                              src={pb.files.getUrl(item, item.image)}
                              alt={item.name}
                              class="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                            />
                          {:else}
                            <div class="w-16 h-16 rounded-xl bg-muted flex items-center justify-center text-2xl flex-shrink-0">🍽️</div>
                          {/if}

                          <!-- Info -->
                          <div class="flex-1 min-w-0">
                            <p class="font-semibold text-sm text-foreground">{item.name}</p>
                            {#if item.description}
                              <p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
                            {/if}
                            <div class="flex items-center gap-3 mt-1.5">
                              <span class="text-sm font-bold text-foreground">रु {item.price}</span>
                              {#if item.preparationTime}
                                <span class="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock class="w-3 h-3" />
                                  {item.preparationTime} min
                                </span>
                              {/if}
                            </div>
                          </div>

                          <!-- Add to cart -->
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

<!-- Floating Cart Button (only on menu tab, non-owner, items in cart) -->
{#if profileTab === 'menu' && !isOwnProfile && cartCount > 0}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
    <button
      class="flex items-center gap-3 px-6 py-3.5 rounded-2xl text-white font-semibold shadow-2xl hover:opacity-95 transition-all"
      style="background-color: #FF6B35;"
      on:click={() => showCart = true}
    >
      <ShoppingCart class="w-5 h-5" />
      <span>View order · {cartCount} item{cartCount !== 1 ? 's' : ''}</span>
      <span class="font-bold">रु {cartTotal.toFixed(2)}</span>
    </button>
  </div>
{/if}

<!-- Post Modal -->
{#if selectedPostId}
  <PostModal
    postId={selectedPostId}
    onClose={closePost}
    onDelete={handlePostDeleted}
  />
{/if}