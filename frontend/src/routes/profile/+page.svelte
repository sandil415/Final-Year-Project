<script>
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';
  import PostModal from '$lib/components/PostModal.svelte';
  import HighlightsSection from '$lib/components/HighlightsSection.svelte';
  import RecipeEditor from '$lib/components/RecipeEditor.svelte';
  import RecipeView from '$lib/components/RecipeView.svelte';
  import MenuItemForm from '$lib/components/MenuItemForm.svelte';
  import {
    CameraIcon, HeartIcon, ChatCircleIcon, StorefrontIcon,
    CookingPotIcon, TruckIcon, ForkKnifeIcon, PhoneIcon,
    MapPinIcon, ClockIcon, ShoppingCartIcon, MinusIcon, PlusIcon,
    XIcon, BookOpenTextIcon, PencilSimpleIcon, TrashIcon,
    CaretUpIcon, CaretDownIcon, ToggleLeftIcon, ToggleRightIcon,
    CheckCircleIcon, WarningCircleIcon,
    ArrowLeftIcon, ArrowRightIcon, SignOutIcon,
  } from 'phosphor-svelte';
  import {
    cart, cartCount, cartTotal, cartBySeller, checkoutState,
    addItem as addCartItem, removeItem as removeCartItem,
    removeSellerItems, cacheSellerRecord, initCheckout, setCheckoutField,
    computeEffectivePrice,
  } from '$lib/stores/cart';
  import { showCartDrawer } from '$lib/stores/ui';

  // ── Core state ────────────────────────────────────────────────────────────────
  let user = null, currentUser = null, loading = true;
  let isOwnProfile = false, isFollowing = false, followRecordId = null;
  let followersCount = 0, followingCount = 0;

  // Posts
  let posts = [], postsCount = 0, postStats = {};

  // PostModal
  let selectedPostId = null;
  let selectedPostIndex = null;

  function openPostModal(postId, index) {
    selectedPostId = postId;
    selectedPostIndex = index;
  }
  function closePostModal() {
    selectedPostId = null;
    selectedPostIndex = null;
  }

  function onLikeToggled(postId, delta) {
    postStats = {
      ...postStats,
      [postId]: {
        ...(postStats[postId] || {}),
        likes: Math.max(0, (postStats[postId]?.likes ?? 0) + delta),
      },
    };
  }

  // Menu
  let menuItems = [], menuLoaded = false;
  let activeCategory = null;

  // Menu item form — now uses MenuItemForm component
  let showMenuForm = false, editingMenuItem = null;

  // Modifier selection modal (customer)
  let showModModal = false;
  let modModalItem = null;
  let modSelections = {};

  // Recipes
  let recipes = [];
  let showEditor = false, editingRecipe = null, viewingRecipe = null;
  let recipeTitle = '', recipeTags = '', recipeCoverPreview = null, recipeBlocks = [];

  // Active tab
  let activeTab = 'posts';

  // Cart
  let showCart = false, expandedSeller = null;

  // Toast
  let toast = null;
  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => (toast = null), 3500);
  }

  // ── Business helpers ──────────────────────────────────────────────────────────
  const bizLabels = { home_chef: 'Home Chef', restaurant: 'Restaurant', food_truck: 'Food Truck', catering: 'Catering' };
  const bizIcons  = { home_chef: CookingPotIcon, restaurant: StorefrontIcon, food_truck: TruckIcon, catering: ForkKnifeIcon };

  // ── Mount ─────────────────────────────────────────────────────────────────────
  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.record ?? pb.authStore.model;
    const uname = $page.params?.username || currentUser.username;
    isOwnProfile = uname === currentUser.username;
    if (isOwnProfile) { user = currentUser; loading = false; }
    else await loadProfile(uname);

    if (user) {
      await Promise.all([loadFollowData(), loadPosts(), loadRecipes()]);
      if (user.accountType === 'business') {
        cacheSellerRecord(user);
        await loadMenu();
      }
      if (!isOwnProfile) {
        try {
          const r = await pb.collection('follows').getList(1, 1, {
            filter: `follower = "${currentUser.id}" && following = "${user.id}"`,
          });
          if (r.items.length) { isFollowing = true; followRecordId = r.items[0].id; }
        } catch (_) {}
      }
    }
  });

  async function loadProfile(uname) {
    try {
      const r = await pb.collection('users').getList(1, 1, { filter: `username = "${uname}"` });
      user = r.items[0] ?? null;
      if (!user) goto('/search');
    } catch (_) { goto('/search'); }
    finally { loading = false; }
  }

  async function loadFollowData() {
    try {
      const [a, b] = await Promise.all([
        pb.collection('follows').getList(1, 1, { filter: `following = "${user.id}"` }),
        pb.collection('follows').getList(1, 1, { filter: `follower = "${user.id}"` }),
      ]);
      followersCount = a.totalItems; followingCount = b.totalItems;
    } catch (_) {}
  }

  async function loadPosts() {
    try {
      const r = await pb.collection('posts').getList(1, 50, {
        filter: `user = "${user.id}"`,
        sort: '-created',
      });
      posts = r.items;
      postsCount = r.totalItems;

      if (posts.length === 0) return;

      const idFilter = posts.map(p => `post = "${p.id}"`).join(' || ');
      const [allLikes, allComments] = await Promise.all([
        pb.collection('likes').getFullList({ filter: idFilter, fields: 'post' }),
        pb.collection('comments').getFullList({ filter: idFilter, fields: 'post' }),
      ]);

      const stats = {};
      for (const p of posts) stats[p.id] = { likes: 0, comments: 0 };
      for (const l of allLikes)    stats[l.post].likes++;
      for (const c of allComments) stats[c.post].comments++;
      postStats = stats;
    } catch (_) { posts = []; }
  }

  async function loadMenu() {
    try {
      const filter = isOwnProfile ? `seller = "${user.id}"` : `seller = "${user.id}" && isAvailable = true`;
      const r = await pb.collection('menuItems').getFullList({ filter, sort: 'category,name' });
      menuItems = r; menuLoaded = true;
      if (!activeCategory && r.length) activeCategory = r[0].category || 'Other';
    } catch (_) { menuItems = []; }
  }

  async function loadRecipes() {
    try {
      const r = await pb.collection('recipes').getList(1, 50, { filter: `user = "${user.id}"`, sort: '-created' });
      recipes = r.items;
    } catch (_) { recipes = []; }
  }

  // ── Post helpers ──────────────────────────────────────────────────────────────
  function handlePostDeleted(id) {
    posts = posts.filter(p => p.id !== id);
    postsCount = Math.max(0, postsCount - 1);
    closePostModal();
  }

  function logout() { pb.authStore.clear(); goto('/auth/login'); }

  // ── Menu form handlers (now delegated to MenuItemForm component) ──────────────
  function openNewMenuItem() {
    editingMenuItem = null;
    showMenuForm = true;
  }

  function openEditMenuItem(item) {
    editingMenuItem = item;
    showMenuForm = true;
  }

  function handleMenuFormClose() {
    showMenuForm = false;
    editingMenuItem = null;
  }

  // Called by MenuItemForm after a successful save
  function handleMenuItemSaved(savedItem) {
    if (editingMenuItem) {
      menuItems = menuItems.map(m => m.id === savedItem.id ? savedItem : m);
      showToast('Menu item updated ✓');
    } else {
      menuItems = [savedItem, ...menuItems];
      if (!activeCategory) activeCategory = savedItem.category || 'Other';
      showToast('Menu item added ✓');
    }
    showMenuForm = false;
    editingMenuItem = null;
  }

  async function deleteMenuItem(item) {
    if (!confirm(`Delete "${item.name}" from menu?`)) return;
    try {
      await pb.collection('menuItems').delete(item.id);
      menuItems = menuItems.filter(m => m.id !== item.id);
      showToast('Menu item deleted');
    } catch (_) { showToast('Failed to delete', 'error'); }
  }

  async function toggleMenuAvailability(item) {
    try {
      const updated = await pb.collection('menuItems').update(item.id, { isAvailable: !item.isAvailable });
      menuItems = menuItems.map(m => m.id === item.id ? updated : m);
    } catch (_) { showToast('Failed to update', 'error'); }
  }

  // ── Modifier selection modal (customer) ───────────────────────────────────────
  function openModModal(item) {
    modModalItem = item;
    modSelections = {};
    const mods = parseMods(item);
    for (const mod of mods) {
      if (mod.type === 'radio' && mod.required && mod.options.length) {
        modSelections[mod.id] = mod.options[0].id;
      }
    }
    showModModal = true;
  }

  function closeModModal() { showModModal = false; modModalItem = null; modSelections = {}; }

  function parseMods(item) {
    if (!item?.modifiers) return [];
    try { return typeof item.modifiers === 'string' ? JSON.parse(item.modifiers) : item.modifiers; }
    catch (_) { return []; }
  }

  function toggleModOption(modId, optId, type) {
    if (type === 'radio') {
      modSelections = { ...modSelections, [modId]: modSelections[modId] === optId ? null : optId };
    } else {
      const cur = Array.isArray(modSelections[modId]) ? [...modSelections[modId]] : [];
      const idx = cur.indexOf(optId);
      if (idx >= 0) cur.splice(idx, 1); else cur.push(optId);
      modSelections = { ...modSelections, [modId]: cur };
    }
  }

  function modIsChosen(modId, optId, type) {
    const sel = modSelections[modId];
    if (type === 'radio') return sel === optId;
    return Array.isArray(sel) && sel.includes(optId);
  }

  $: modModalMods  = modModalItem ? parseMods(modModalItem) : [];
  $: modModalTotal = modModalItem ? computeEffectivePrice(modModalItem.price ?? 0, modModalMods, modSelections) : 0;
  $: modModalValid = modModalMods.every(m => !m.required || (m.type === 'radio' ? !!modSelections[m.id] : true));

  function confirmModAdd() {
    if (!modModalItem || !modModalValid) return;
    const mods = parseMods(modModalItem);
    addCartItem(modModalItem, 1, modSelections, mods);
    initCheckout(modModalItem.seller);
    showToast(`${modModalItem.name} added to cart`);
    closeModModal();
  }

  // ── Cart helpers ──────────────────────────────────────────────────────────────
  function handleAddToCart(item) {
    const mods = parseMods(item);
    if (mods.length > 0) {
      openModModal(item);
    } else {
      addCartItem(item, 1, {}, []);
      initCheckout(item.seller);
      showToast(`${item.name} added to cart`);
    }
  }

  function removeFromCart(lineKey) { removeCartItem(lineKey, 1); }

  function getItemCartLines(itemId) {
    return Object.entries($cart)
      .filter(([key, entry]) => entry.item?.id === itemId)
      .map(([key, entry]) => ({ key, ...entry }));
  }

  function totalQtyInCart(itemId) {
    return getItemCartLines(itemId).reduce((s, e) => s + e.quantity, 0);
  }

  // ── Place order ───────────────────────────────────────────────────────────────
  async function placeOrder(group) {
    const sid = group.sellerId;
    const addr = $checkoutState[sid]?.address?.trim();
    if (!addr) { showToast('Enter a delivery address', 'error'); return; }
    setCheckoutField(sid, 'placing', true);
    try {
      await pb.collection('orders').create({
        buyer: currentUser.id, seller: sid,
        items: group.entries.map(e => ({
          menuItemId: e.item.id, name: e.item.name,
          basePrice: e.item.price, effectivePrice: e.effectivePrice ?? e.item.price,
          quantity: e.quantity, selectionLabel: e.selectionLabel || '',
          selections: e.selections || {},
        })),
        totalAmount: group.subtotal, status: 'pending',
        deliveryAddress: addr, notes: $checkoutState[sid].notes || '',
      });
      pb.collection('notifications').create({
        user: sid, triggeredBy: currentUser.id, type: 'message',
        message: `${currentUser.username} placed a new order worth Rs. ${group.subtotal.toFixed(2)}.`,
        read: false,
      }).catch(() => {});
      removeSellerItems(sid);
      showToast(`Order placed with ${group.sellerName}! ✓`);
      if ($cartBySeller.length === 0) showCart = false;
    } catch (err) { showToast(err.message || 'Failed', 'error'); }
    finally { setCheckoutField(sid, 'placing', false); }
  }

  // ── Follow / Message ──────────────────────────────────────────────────────────
  async function toggleFollow() {
    if (isFollowing) {
      try {
        await pb.collection('follows').delete(followRecordId);
        isFollowing = false; followRecordId = null; followersCount = Math.max(0, followersCount - 1);
        showToast('Unfollowed');
      } catch (_) {}
    } else {
      try {
        const f = await pb.collection('follows').create({ follower: currentUser.id, following: user.id });
        isFollowing = true; followRecordId = f.id; followersCount++;
        showToast(`Following ${user.username}`);
        pb.collection('notifications').create({
          user: user.id, triggeredBy: currentUser.id, type: 'follow',
          message: `${currentUser.username} started following you.`, read: false
        }).catch(() => {});
      } catch (_) {}
    }
  }

  async function messageUser() {
    const me = pb.authStore.record ?? pb.authStore.model;
    if (!me?.id || !user?.id || me.id === user.id) return;
    try {
      const ex = await pb.collection('conversations').getFirstListItem(
        `participants?="${me.id}"&&participants?="${user.id}"`
      );
      goto(`/messages/${ex.id}`);
    } catch (err) {
      if (err?.status === 404) {
        const c = await pb.collection('conversations').create({
          participants: [me.id, user.id], lastMessage: '', lastMessageTime: new Date().toISOString()
        });
        goto(`/messages/${c.id}`);
      }
    }
  }

  // ── Recipe CRUD ───────────────────────────────────────────────────────────────
  function openNewRecipe() {
    editingRecipe = null; recipeTitle = ''; recipeTags = ''; recipeCoverPreview = null;
    recipeBlocks = [{ id: `b${Date.now()}`, type: 'paragraph', content: '', file: null, preview: null }];
    showEditor = true;
  }

  function openEditRecipe(recipe) {
    editingRecipe = recipe; recipeTitle = recipe.title || '';
    recipeTags = (Array.isArray(recipe.tags) ? recipe.tags : (() => { try { return JSON.parse(recipe.tags || '[]'); } catch { return []; } })()).join(', ');
    recipeCoverPreview = recipe.cover_image ? pb.files.getUrl(recipe, recipe.cover_image) : null;
    const blocks = Array.isArray(recipe.blocks) ? recipe.blocks : (() => { try { return JSON.parse(recipe.blocks || '[]'); } catch { return []; } })();
    recipeBlocks = blocks.map((b, i) => ({ ...b, id: `b${i}${Date.now()}`, file: null, preview: null }));
    if (!recipeBlocks.length) recipeBlocks = [{ id: `b${Date.now()}`, type: 'paragraph', content: '', file: null, preview: null }];
    showEditor = true;
  }

  async function handleSave(fd) {
    fd.append('user', currentUser.id);
    try {
      if (editingRecipe) {
        const saved = await pb.collection('recipes').update(editingRecipe.id, fd);
        recipes = recipes.map(r => r.id === saved.id ? saved : r);
        showToast('Recipe updated ✓');
      } else {
        const saved = await pb.collection('recipes').create(fd);
        recipes = [saved, ...recipes];
        showToast('Recipe published ✓');
      }
      showEditor = false;
    } catch (err) { showToast(err.message || 'Failed to save', 'error'); throw err; }
  }

  async function deleteRecipe(recipe) {
    if (!confirm(`Delete "${recipe.title}"?`)) return;
    try {
      await pb.collection('recipes').delete(recipe.id);
      recipes = recipes.filter(r => r.id !== recipe.id);
      if (viewingRecipe?.id === recipe.id) viewingRecipe = null;
      showToast('Recipe deleted');
    } catch (_) { showToast('Failed', 'error'); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  $: isBusiness    = user?.accountType === 'business';
  $: BizIcon       = bizIcons[user?.businessType] || StorefrontIcon;

  $: groupedMenu   = menuItems.reduce((acc, item) => {
    const cat = item.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  $: menuCategories    = Object.keys(groupedMenu);
  $: filteredMenuItems = activeCategory && groupedMenu[activeCategory]
    ? { [activeCategory]: groupedMenu[activeCategory] }
    : groupedMenu;
</script>

<!-- ════════ TOAST ════════════════════════════════════════════════════════════ -->
{#if toast}
  <div class="fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2.5 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold text-white pointer-events-none"
    style={toast.type === 'error' ? 'background-color:#EF4444;' : 'background-color:#16a34a;'}>
    {#if toast.type === 'error'}<WarningCircleIcon size={16} weight="fill"/>
    {:else}<CheckCircleIcon size={16} weight="fill"/>{/if}
    {toast.msg}
  </div>
{/if}

<!-- ════════ POST MODAL ════════════════════════════════════════════════════════ -->
{#if selectedPostId}
  <PostModal
    postId={selectedPostId}
    posts={posts}
    initialIndex={selectedPostIndex}
    onClose={closePostModal}
    onDelete={handlePostDeleted}
    onLikeToggled={onLikeToggled}
  />
{/if}

<!-- ════════ MENU ITEM FORM (shared component) ═══════════════════════════════ -->
{#if showMenuForm && user}
  <MenuItemForm
    editingItem={editingMenuItem}
    userId={user.id}
    onSave={handleMenuItemSaved}
    onClose={handleMenuFormClose}
  />
{/if}

<!-- ════════ MODIFIER SELECTION MODAL (customer) ═════════════════════════════ -->
{#if showModModal && modModalItem}
  <div class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 pt-20 sm:pt-4 overflow-y-auto" on:click|self={closeModModal}>
    <div class="bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden my-auto" style="max-height: calc(100vh - 80px);">
      <div class="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <div>
          <h2 class="font-bold text-base">{modModalItem.name}</h2>
          <p class="text-xs text-muted-foreground">Customise your order</p>
        </div>
        <button class="p-1.5 hover:bg-muted rounded-lg" on:click={closeModModal}><XIcon size={18}/></button>
      </div>
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {#each modModalMods as mod}
          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-sm font-semibold">{mod.label}</p>
              <span class="text-[11px] font-medium px-2 py-0.5 rounded-full {mod.required ? 'text-white' : 'text-muted-foreground bg-muted'}"
                style={mod.required ? 'background-color:#FF6B35;' : ''}>
                {mod.required ? 'Required' : mod.type === 'radio' ? 'Pick one' : 'Optional'}
              </span>
            </div>
            <div class="space-y-2">
              {#each mod.options as opt}
                {@const chosen = modIsChosen(mod.id, opt.id, mod.type)}
                <button
                  class="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left
                    {chosen ? 'border-[#FF6B35] bg-[#FF6B3508]' : 'border-border hover:bg-muted/40'}"
                  on:click={() => toggleModOption(mod.id, opt.id, mod.type)}
                >
                  <div class="flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center
                    {chosen ? 'border-[#FF6B35] bg-[#FF6B35]' : 'border-border'}">
                    {#if chosen}<div class="w-1.5 h-1.5 rounded-full bg-white"></div>{/if}
                  </div>
                  <span class="flex-1 text-sm">{opt.name}</span>
                  {#if opt.price !== 0}
                    <span class="text-xs font-medium text-muted-foreground">{opt.price > 0 ? '+' : ''}Rs. {opt.price}</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      <div class="flex items-center justify-between gap-3 px-5 py-4 border-t border-border flex-shrink-0">
        <div>
          <p class="text-xs text-muted-foreground">Total</p>
          <p class="text-lg font-bold">Rs. {modModalTotal.toFixed(0)}</p>
        </div>
        <button
          class="flex-1 py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style="background-color:#FF6B35;"
          disabled={!modModalValid}
          on:click={confirmModAdd}
        >Add to cart</button>
      </div>
    </div>
  </div>
{/if}

<!-- ════════ RECIPE EDITOR / VIEW ═════════════════════════════════════════════ -->
{#if showEditor}
  <RecipeEditor {editingRecipe} bind:recipeTitle bind:recipeTags bind:recipeCoverPreview bind:recipeBlocks onSave={handleSave} onClose={() => showEditor = false}/>
{/if}

{#if viewingRecipe}
  <RecipeView recipe={viewingRecipe} {isOwnProfile} onClose={() => viewingRecipe = null}
    onEdit={() => { const r = viewingRecipe; viewingRecipe = null; tick().then(() => openEditRecipe(r)); }}
    onDelete={() => { const r = viewingRecipe; viewingRecipe = null; deleteRecipe(r); }}/>
{/if}

<!-- ════════ CART DRAWER ══════════════════════════════════════════════════════ -->
{#if showCart || $showCartDrawer}
  <div class="fixed inset-0 z-50 flex">
    <div class="flex-1 bg-black/50 backdrop-blur-sm" on:click={() => { showCart = false; showCartDrawer.set(false); }} role="presentation"></div>
    <div class="w-full max-w-sm bg-background border-l border-border flex flex-col shadow-2xl overflow-hidden">
      <div class="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
        <h2 class="font-bold">Cart · {$cartCount} item{$cartCount !== 1 ? 's' : ''}</h2>
        <button class="p-2 hover:bg-muted rounded-full" on:click={() => { showCart = false; showCartDrawer.set(false); }}><XIcon size={18}/></button>
      </div>
      <div class="flex-1 overflow-y-auto">
        {#each $cartBySeller as group (group.sellerId)}
          {@const co = $checkoutState[group.sellerId] || {}}
          {@const expanded = expandedSeller === group.sellerId}
          <div class="border-b border-border">
            <button class="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/40 text-left transition-colors"
              on:click={() => expandedSeller = expanded ? null : group.sellerId}>
              <div class="w-9 h-9 rounded-full text-white text-sm font-bold flex items-center justify-center flex-shrink-0" style="background-color:#FF6B35;">
                {group.sellerName.charAt(0).toUpperCase()}
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm truncate">{group.sellerName}</p>
                <p class="text-xs text-muted-foreground">{group.entries.length} item{group.entries.length !== 1 ? 's' : ''} · Rs. {group.subtotal.toFixed(2)}</p>
              </div>
              {#if expanded}<CaretUpIcon size={16} class="flex-shrink-0 text-muted-foreground"/>
              {:else}<CaretDownIcon size={16} class="flex-shrink-0 text-muted-foreground"/>{/if}
            </button>
            {#if expanded}
              <div class="px-4 pb-4 space-y-3">
                {#each group.entries as entry}
                  <div class="flex items-start gap-3 p-2.5 bg-card border border-border rounded-xl">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate">{entry.item.name}</p>
                      {#if entry.selectionLabel}
                        <p class="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{entry.selectionLabel}</p>
                      {/if}
                      <p class="text-xs text-muted-foreground">Rs. {(entry.effectivePrice ?? entry.item.price).toFixed(0)} × {entry.quantity} = Rs. {((entry.effectivePrice ?? entry.item.price) * entry.quantity).toFixed(0)}</p>
                    </div>
                    <div class="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                      <button class="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:bg-muted"
                        on:click={() => removeFromCart(Object.entries($cart).find(([k, e]) => e === entry)?.[0] || entry.item.id)}>
                        <MinusIcon size={12}/>
                      </button>
                      <span class="text-sm font-semibold w-4 text-center">{entry.quantity}</span>
                      <button class="w-6 h-6 rounded-full text-white flex items-center justify-center" style="background-color:#FF6B35;"
                        on:click={() => handleAddToCart(entry.item)}>
                        <PlusIcon size={12}/>
                      </button>
                    </div>
                  </div>
                {/each}
                <input class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm"
                  value={co.address || ''} on:input={e => setCheckoutField(group.sellerId, 'address', e.target.value)} placeholder="Delivery address *"/>
                <textarea rows="2" class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm resize-none"
                  value={co.notes || ''} on:input={e => setCheckoutField(group.sellerId, 'notes', e.target.value)} placeholder="Notes / special requests"/>
                <div class="flex justify-between text-sm py-1">
                  <span class="text-muted-foreground">Subtotal</span>
                  <span class="font-bold">Rs. {group.subtotal.toFixed(2)}</span>
                </div>
                <div class="flex gap-2">
                  <button class="p-2 border border-border rounded-xl hover:bg-muted text-muted-foreground"
                    on:click={() => removeSellerItems(group.sellerId)}>
                    <TrashIcon size={16}/>
                  </button>
                  <button class="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50"
                    style="background-color:#FF6B35;" disabled={co.placing} on:click={() => placeOrder(group)}>
                    {co.placing ? 'Placing…' : `Order from ${group.sellerName}`}
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
        {#if $cartBySeller.length === 0}
          <div class="flex flex-col items-center py-20 text-center px-8">
            <ShoppingCartIcon size={40} weight="duotone" class="text-muted-foreground mb-3"/>
            <p class="font-semibold">Cart is empty</p>
          </div>
        {/if}
      </div>
      {#if $cartBySeller.length > 0}
        <div class="px-5 py-4 border-t border-border flex-shrink-0">
          <div class="flex justify-between text-sm font-bold"><span>Grand total</span><span>Rs. {$cartTotal.toFixed(2)}</span></div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- ══════════════════════════════════════ PAGE ══════════════════════════════ -->
<div class="min-h-screen bg-background text-foreground">
  <Header/>

  {#if loading}
    <div class="flex items-center justify-center py-32">
      <div class="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style="border-color:#FF6B35;border-top-color:transparent;"></div>
    </div>

  {:else if user}
    <main class="max-w-5xl mx-auto px-4 sm:px-6 py-8">

      <!-- ── PROFILE HEADER ── -->
      <div class="flex flex-col sm:flex-row gap-6 items-start mb-6 pb-6 border-b border-border">
        <div class="relative flex-shrink-0">
          <img
            src={user.avatar ? pb.files.getUrl(user, user.avatar) : '/images/profilePlaceholder.jpg'}
            alt={user.username}
            class="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover ring-2 ring-border"
          />
          {#if isBusiness}
            <div class="absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-2 border-background flex items-center justify-center" style="background-color:#FF6B35;">
              <svelte:component this={BizIcon} size={14} color="white"/>
            </div>
          {/if}
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <h1 class="text-xl font-bold">{user.username}</h1>
            {#if isBusiness}
              <span class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white" style="background-color:#FF6B35;">
                <svelte:component this={BizIcon} size={10} color="white"/>{bizLabels[user.businessType] || 'Business'}
              </span>
            {/if}
          </div>

          <div class="flex gap-5 text-sm mb-2 flex-wrap">
            <button class="hover:opacity-70"><strong>{followersCount}</strong> followers</button>
            <button class="hover:opacity-70"><strong>{followingCount}</strong> following</button>
          </div>

          <p class="text-sm text-muted-foreground leading-relaxed mb-3">{user.bio || 'No bio yet'}</p>

          {#if isBusiness && (user.businessPhone || user.businessAddress)}
            <div class="flex flex-wrap gap-4 text-xs text-muted-foreground mb-3">
              {#if user.businessPhone}
                <span class="flex items-center gap-1.5"><PhoneIcon size={12}/>{user.businessPhone}</span>
              {/if}
              {#if user.businessAddress}
                <span class="flex items-center gap-1.5"><MapPinIcon size={12}/>{user.businessAddress}</span>
              {/if}
            </div>
          {/if}

          <div class="flex flex-wrap gap-2">
            {#if isOwnProfile}
              <button class="border border-border px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                on:click={() => goto('/profile/edit')}>Edit profile</button>
              {#if isBusiness}
                <button class="px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-90"
                  style="background-color:#FF6B35;" on:click={() => goto('/business/dashboard')}>Dashboard</button>
              {/if}
              <button
                class="flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                on:click={logout}>
                <SignOutIcon size={14}/>Log out
              </button>
            {:else}
              <button
                class="px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors {isFollowing ? 'border border-border hover:bg-muted' : 'text-white hover:opacity-90'}"
                style={!isFollowing ? 'background-color:#FF6B35;' : ''}
                on:click={toggleFollow}>
                {isFollowing ? 'Following' : 'Follow'}
              </button>
              <button class="border border-border px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                on:click={messageUser}>Message</button>
            {/if}
          </div>
        </div>
      </div>

      <!-- ── HIGHLIGHTS ── -->
      <div class="mb-4">
        <HighlightsSection userId={user.id} {isOwnProfile}/>
      </div>

      <!-- ── TAB BAR ── -->
      <div class="flex items-center border-b border-border mb-0">
        <button
          class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex-shrink-0"
          style={activeTab === 'posts' ? 'border-color:#FF6B35;color:#FF6B35;' : 'border-color:transparent;color:var(--muted-foreground);'}
          on:click={() => activeTab = 'posts'}
        >
          Posts{#if postsCount > 0}<span class="opacity-60 text-xs ml-1">{postsCount}</span>{/if}
        </button>

        <button
          class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex-shrink-0"
          style={activeTab === 'recipes' ? 'border-color:#FF6B35;color:#FF6B35;' : 'border-color:transparent;color:var(--muted-foreground);'}
          on:click={() => activeTab = 'recipes'}
        >
          Recipes{#if recipes.length > 0}<span class="opacity-60 text-xs ml-1">{recipes.length}</span>{/if}
        </button>

        {#if isBusiness}
          <button
            class="lg:hidden flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex-shrink-0"
            style={activeTab === 'menu' ? 'border-color:#FF6B35;color:#FF6B35;' : 'border-color:transparent;color:var(--muted-foreground);'}
            on:click={() => activeTab = 'menu'}
          >
            Menu{#if menuItems.length > 0}<span class="opacity-60 text-xs ml-1">{menuItems.length}</span>{/if}
          </button>
        {/if}

        <div class="flex-1"></div>
        <div class="pr-1 flex-shrink-0">
          {#if isOwnProfile}
            {#if activeTab === 'posts'}
              <a href="/create" class="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-white" style="background-color:#FF6B35;">+ New post</a>
            {:else if activeTab === 'recipes'}
              <button class="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-white" style="background-color:#FF6B35;" on:click={openNewRecipe}>+ New recipe</button>
            {:else if activeTab === 'menu' && isBusiness}
              <button class="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-white" style="background-color:#FF6B35;" on:click={openNewMenuItem}>+ Add item</button>
            {/if}
          {/if}
        </div>
      </div>

      <!-- ── CONTENT AREA ── -->
      <div class="{isBusiness ? 'lg:grid lg:grid-cols-[1fr_280px]' : ''} lg:gap-6 items-start mt-5">

        <!-- LEFT COLUMN -->
        <div class="min-w-0">

          <!-- POSTS TAB -->
          {#if activeTab === 'posts'}
            {#if posts.length === 0}
              <div class="flex flex-col items-center py-20 text-center">
                <div class="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                  <CameraIcon size={28} class="text-muted-foreground"/>
                </div>
                <p class="font-semibold mb-1">{isOwnProfile ? 'Share your first photo' : 'No posts yet'}</p>
                {#if isOwnProfile}
                  <a href="/create" class="text-sm font-semibold mt-3 hover:opacity-70" style="color:#FF6B35;">Create post →</a>
                {/if}
              </div>
            {:else}
              <div class="grid grid-cols-3 gap-px">
                {#each posts as post, i (post.id)}
                  <button
                    class="aspect-square bg-muted overflow-hidden relative group"
                    on:click={() => openPostModal(post.id, i)}
                  >
                    <img
                      src={pb.files.getUrl(post, post.image)}
                      alt=""
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div class="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white text-sm font-semibold">
                      <span class="flex items-center gap-1">
                        <HeartIcon size={15} weight="fill"/>{postStats[post.id]?.likes ?? 0}
                      </span>
                      <span class="flex items-center gap-1">
                        <ChatCircleIcon size={15} weight="fill"/>{postStats[post.id]?.comments ?? 0}
                      </span>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}

          <!-- RECIPES TAB -->
          {:else if activeTab === 'recipes'}
            {#if recipes.length === 0}
              <div class="flex flex-col items-center py-20 text-center">
                <div class="w-14 h-14 rounded-full flex items-center justify-center mb-4" style="background-color:#FF6B3515;">
                  <BookOpenTextIcon size={28} style="color:#FF6B35;" weight="duotone"/>
                </div>
                <p class="font-semibold mb-1">{isOwnProfile ? 'Create your first recipe' : 'No recipes yet'}</p>
                {#if isOwnProfile}
                  <button class="text-sm font-semibold mt-3 hover:opacity-70" style="color:#FF6B35;" on:click={openNewRecipe}>Create recipe →</button>
                {/if}
              </div>
            {:else}
              <div class="grid gap-3">
                {#each recipes as recipe (recipe.id)}
                  {@const rtags = Array.isArray(recipe.tags) ? recipe.tags : (() => { try { return JSON.parse(recipe.tags || '[]'); } catch { return []; } })()}
                  <div
                    class="group flex bg-card border border-border rounded-2xl overflow-hidden cursor-pointer hover:border-orange-300 dark:hover:border-orange-700 transition-all"
                    on:click={() => viewingRecipe = recipe}
                  >
                    {#if recipe.cover_image}
                      <img src={pb.files.getUrl(recipe, recipe.cover_image)} alt="" class="w-28 object-cover flex-shrink-0"/>
                    {:else}
                      <div class="w-28 flex items-center justify-center flex-shrink-0" style="background:#FF6B3508;">
                        <BookOpenTextIcon size={28} style="color:#FF6B35;opacity:0.3;" weight="duotone"/>
                      </div>
                    {/if}
                    <div class="flex-1 p-3 min-w-0 flex flex-col justify-between">
                      <div>
                        <span class="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white mb-1" style="background-color:#FF6B35;">RECIPE</span>
                        <p class="font-semibold text-sm">{recipe.title}</p>
                        {#if rtags.length}
                          <div class="flex flex-wrap gap-1 mt-1">
                            {#each rtags.slice(0, 3) as tag}
                              <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{tag}</span>
                            {/each}
                          </div>
                        {/if}
                      </div>
                      {#if isOwnProfile}
                        <div class="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" on:click|stopPropagation>
                          <button class="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-border text-muted-foreground hover:bg-muted"
                            on:click={() => openEditRecipe(recipe)}><PencilSimpleIcon size={11}/>Edit</button>
                          <button class="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                            on:click={() => deleteRecipe(recipe)}><TrashIcon size={11}/>Delete</button>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

          <!-- MENU TAB (mobile only) -->
          {:else if activeTab === 'menu' && isBusiness}
            <div class="space-y-1">
              {#if menuCategories.length > 1}
                <div class="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
                  <button
                    class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap
                      {activeCategory === null ? 'text-white border-transparent' : 'border-border text-muted-foreground'}"
                    style={activeCategory === null ? 'background-color:#FF6B35;' : ''}
                    on:click={() => activeCategory = null}>All</button>
                  {#each menuCategories as cat}
                    <button
                      class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap
                        {activeCategory === cat ? 'text-white border-transparent' : 'border-border text-muted-foreground'}"
                      style={activeCategory === cat ? 'background-color:#FF6B35;' : ''}
                      on:click={() => activeCategory = cat}>{cat}</button>
                  {/each}
                </div>
              {/if}
              {#if menuItems.length === 0}
                <div class="flex flex-col items-center py-16 text-center border-2 border-dashed border-border rounded-2xl">
                  <div class="text-3xl mb-2">🍽️</div>
                  <p class="text-sm text-muted-foreground">{isOwnProfile ? 'Add your first menu item' : 'No menu items yet'}</p>
                  {#if isOwnProfile}
                    <button class="text-sm font-semibold mt-3" style="color:#FF6B35;" on:click={openNewMenuItem}>Add first item →</button>
                  {/if}
                </div>
              {:else}
                {#each Object.entries(filteredMenuItems) as [category, items]}
                  <p class="text-[11px] font-bold text-muted-foreground uppercase tracking-widest px-1 mb-2 mt-4">{category}</p>
                  <div class="space-y-2">
                    {#each items as item (item.id)}
                      {@const inCartQty = totalQtyInCart(item.id)}
                      {@const hasMods = parseMods(item).length > 0}
                      <div class="flex items-center gap-3 p-3 bg-card border border-border rounded-2xl {!item.isAvailable && !isOwnProfile ? 'opacity-50' : ''}">
                        {#if item.image}
                          <img src={pb.files.getUrl(item, item.image)} alt={item.name} class="w-14 h-14 rounded-xl object-cover flex-shrink-0"/>
                        {:else}
                          <div class="w-14 h-14 rounded-xl bg-muted flex items-center justify-center text-xl flex-shrink-0">🍽️</div>
                        {/if}
                        <div class="flex-1 min-w-0">
                          <p class="font-semibold text-sm truncate">{item.name}</p>
                          {#if item.description}<p class="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.description}</p>{/if}
                          <div class="flex items-center gap-3 mt-1">
                            <span class="text-sm font-bold" style="color:#c04a20;">Rs. {item.price}</span>
                            {#if item.preparationTime}
                              <span class="flex items-center gap-1 text-xs text-muted-foreground"><ClockIcon size={11}/>{item.preparationTime}m</span>
                            {/if}
                          </div>
                        </div>
                        {#if isOwnProfile}
                          <div class="flex items-center gap-1 flex-shrink-0">
                            <button class="p-1.5 rounded-lg hover:bg-muted" on:click={() => toggleMenuAvailability(item)}>
                              {#if item.isAvailable}<ToggleRightIcon size={20} style="color:#FF6B35;"/>
                              {:else}<ToggleLeftIcon size={20} class="text-muted-foreground"/>{/if}
                            </button>
                            <button class="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" on:click={() => openEditMenuItem(item)}><PencilSimpleIcon size={14}/></button>
                            <button class="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500" on:click={() => deleteMenuItem(item)}><TrashIcon size={14}/></button>
                          </div>
                        {:else if item.isAvailable}
                          <div class="flex-shrink-0">
                            {#if inCartQty === 0}
                              <button class="px-3 py-1.5 rounded-xl text-white text-sm font-semibold hover:opacity-90" style="background-color:#FF6B35;" on:click={() => handleAddToCart(item)}>Add</button>
                            {:else if hasMods}
                              <div class="flex flex-col items-center gap-0.5">
                                <button class="px-2 py-1 rounded-lg text-white text-xs font-semibold hover:opacity-90" style="background-color:#FF6B35;" on:click={() => openModModal(item)}>+More</button>
                                <span class="text-[10px] text-muted-foreground">{inCartQty} in cart</span>
                              </div>
                            {:else}
                              <div class="flex items-center gap-1.5">
                                <button class="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted"
                                  on:click={() => { const lines = getItemCartLines(item.id); if(lines.length) removeFromCart(lines[0].key); }}>
                                  <MinusIcon size={12}/>
                                </button>
                                <span class="text-sm font-bold w-4 text-center">{inCartQty}</span>
                                <button class="w-7 h-7 rounded-full text-white flex items-center justify-center" style="background-color:#FF6B35;" on:click={() => handleAddToCart(item)}>
                                  <PlusIcon size={12}/>
                                </button>
                              </div>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/each}
              {/if}
            </div>
          {/if}

        </div><!-- end left column -->

        <!-- RIGHT COLUMN: Menu sidebar — desktop only, business only -->
        {#if isBusiness}
          <div class="hidden lg:block">
            <div class="sticky top-20 bg-card border border-border rounded-2xl overflow-hidden flex flex-col" style="max-height: calc(100vh - 120px);">
              <div class="flex items-center justify-between px-3 py-2.5 border-b border-border flex-shrink-0">
                <div>
                  <p class="text-sm font-bold">Menu</p>
                  <p class="text-xs text-muted-foreground">{menuItems.length} item{menuItems.length !== 1 ? 's' : ''}</p>
                </div>
                {#if isOwnProfile}
                  <button
                    class="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg text-white hover:opacity-90"
                    style="background-color:#FF6B35;" on:click={openNewMenuItem}>
                    + Add
                  </button>
                {/if}
              </div>
              {#if menuCategories.length > 1}
                <div class="flex gap-1 px-2 py-2 border-b border-border overflow-x-auto scrollbar-hide flex-shrink-0">
                  <button
                    class="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border transition-all whitespace-nowrap
                      {activeCategory === null ? 'text-white border-transparent' : 'border-border text-muted-foreground'}"
                    style={activeCategory === null ? 'background-color:#FF6B35;' : ''}
                    on:click={() => activeCategory = null}>All</button>
                  {#each menuCategories as cat}
                    <button
                      class="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full border transition-all whitespace-nowrap
                        {activeCategory === cat ? 'text-white border-transparent' : 'border-border text-muted-foreground'}"
                      style={activeCategory === cat ? 'background-color:#FF6B35;' : ''}
                      on:click={() => activeCategory = cat}>{cat}</button>
                  {/each}
                </div>
              {/if}
              <div class="flex-1 overflow-y-auto p-2 space-y-3">
                {#if menuItems.length === 0}
                  <div class="flex flex-col items-center py-8 text-center">
                    <div class="text-2xl mb-2">🍽️</div>
                    <p class="text-xs text-muted-foreground">{isOwnProfile ? 'Add your first item' : 'No items yet'}</p>
                  </div>
                {:else}
                  {#each Object.entries(filteredMenuItems) as [category, items]}
                    <div>
                      <p class="text-[9px] font-bold text-muted-foreground uppercase tracking-widest px-1 mb-1.5">{category}</p>
                      <div class="space-y-1">
                        {#each items as item (item.id)}
                          {@const inCartQty = totalQtyInCart(item.id)}
                          {@const hasMods = parseMods(item).length > 0}
                          <div class="flex items-center gap-2 p-2 rounded-xl border border-border bg-background {!item.isAvailable && !isOwnProfile ? 'opacity-50' : ''}">
                            {#if item.image}
                              <img src={pb.files.getUrl(item, item.image)} alt={item.name} class="w-9 h-9 rounded-lg object-cover flex-shrink-0"/>
                            {:else}
                              <div class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-sm flex-shrink-0">🍽️</div>
                            {/if}
                            <div class="flex-1 min-w-0">
                              <p class="font-medium text-xs truncate leading-tight">{item.name}</p>
                              <p class="text-[11px] font-bold mt-0.5" style="color:#c04a20;">Rs. {item.price}</p>
                            </div>
                            {#if isOwnProfile}
                              <div class="flex items-center gap-0.5 flex-shrink-0">
                                <button class="p-1 rounded hover:bg-muted" on:click={() => toggleMenuAvailability(item)}>
                                  {#if item.isAvailable}<ToggleRightIcon size={16} style="color:#FF6B35;"/>
                                  {:else}<ToggleLeftIcon size={16} class="text-muted-foreground"/>{/if}
                                </button>
                                <button class="p-1 rounded hover:bg-muted text-muted-foreground" on:click={() => openEditMenuItem(item)}><PencilSimpleIcon size={12}/></button>
                                <button class="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500" on:click={() => deleteMenuItem(item)}><TrashIcon size={12}/></button>
                              </div>
                            {:else if item.isAvailable}
                              <div class="flex-shrink-0">
                                {#if inCartQty === 0}
                                  <button class="px-2 py-1 rounded-lg text-white text-[11px] font-semibold hover:opacity-90"
                                    style="background-color:#FF6B35;" on:click={() => handleAddToCart(item)}>Add</button>
                                {:else if hasMods}
                                  <div class="flex flex-col items-center gap-0.5">
                                    <button class="px-1.5 py-0.5 rounded text-white text-[10px] font-semibold" style="background-color:#FF6B35;" on:click={() => openModModal(item)}>+More</button>
                                    <span class="text-[9px] text-muted-foreground">{inCartQty}</span>
                                  </div>
                                {:else}
                                  <div class="flex items-center gap-1">
                                    <button class="w-5 h-5 rounded-full border border-border flex items-center justify-center hover:bg-muted"
                                      on:click={() => { const lines = getItemCartLines(item.id); if(lines.length) removeFromCart(lines[0].key); }}>
                                      <MinusIcon size={9}/>
                                    </button>
                                    <span class="text-xs font-bold w-3 text-center">{inCartQty}</span>
                                    <button class="w-5 h-5 rounded-full text-white flex items-center justify-center" style="background-color:#FF6B35;" on:click={() => handleAddToCart(item)}>
                                      <PlusIcon size={9}/>
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
                {/if}
              </div>
            </div>
          </div>
        {/if}

      </div><!-- end grid -->

    </main>
  {:else}
    <div class="flex items-center justify-center py-32">
      <p class="text-muted-foreground">Profile not found</p>
    </div>
  {/if}
</div>

{#if !isOwnProfile && $cartCount > 0}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
    <button
      class="flex items-center gap-3 px-6 py-3.5 rounded-2xl text-white font-semibold shadow-2xl hover:opacity-95 transition-all"
      style="background-color:#FF6B35;"
      on:click={() => { expandedSeller = $cartBySeller.length === 1 ? $cartBySeller[0].sellerId : null; showCart = true; }}>
      <ShoppingCartIcon size={20} weight="fill"/>
      <span>{$cartCount} item{$cartCount !== 1 ? 's' : ''}</span>
      <span class="font-bold">Rs. {$cartTotal.toFixed(2)}</span>
    </button>
  </div>
{/if}

<style>
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }
</style>