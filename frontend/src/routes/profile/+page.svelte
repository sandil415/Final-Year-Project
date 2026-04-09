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
  import {
    CameraIcon, HeartIcon, ChatCircleIcon, StorefrontIcon,
    CookingPotIcon, TruckIcon, ForkKnifeIcon, PhoneIcon,
    MapPinIcon, ClockIcon, ShoppingCartIcon, MinusIcon, PlusIcon,
    XIcon, BookOpenTextIcon, PencilSimpleIcon, TrashIcon,
    CaretUpIcon, CaretDownIcon, ToggleLeftIcon, ToggleRightIcon,
    CheckCircleIcon, WarningCircleIcon, SlidersIcon,
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

  // Lightbox (for browsing) + PostModal (for likes/comments)
  let lightboxIndex = null;
  let selectedPostId = null;   // opens PostModal with full like/comment support

  function openLightbox(idx) { lightboxIndex = idx; }
  function closeLightbox() { lightboxIndex = null; }
  function lightboxPrev() {
    if (lightboxIndex === null) return;
    lightboxIndex = (lightboxIndex - 1 + posts.length) % posts.length;
  }
  function lightboxNext() {
    if (lightboxIndex === null) return;
    lightboxIndex = (lightboxIndex + 1) % posts.length;
  }
  function handleLightboxKey(e) {
    if (lightboxIndex === null) return;
    if (e.key === 'ArrowLeft')  lightboxPrev();
    if (e.key === 'ArrowRight') lightboxNext();
    if (e.key === 'Escape')     closeLightbox();
  }
  function openPostModal(postId) {
    closeLightbox();
    selectedPostId = postId;
  }

  // Menu
  let menuItems = [], menuLoaded = false;
  let activeCategory = null;

  // Menu item form (owner only)
  let showMenuForm = false, editingMenuItem = null, savingMenuItem = false;
  let menuForm = {
    name: '', description: '', price: '', category: '', preparationTime: '15', isAvailable: true,
    modifiers: [],
  };
  let menuImageFile = null, menuImagePreview = null;
  const MENU_CATS = ['Momo','Thali','Chowmein','Snacks','Drinks','Desserts','Rice','Other'];

  // Modifier builder
  let editingModifierIdx = null;
  let draftModifier = { id: '', label: '', type: 'radio', required: false, options: [] };
  let draftOption = { id: '', name: '', price: '' };

  // Modifier selection modal (customer)
  let showModModal = false;
  let modModalItem = null;
  let modSelections = {};

  // Recipes
  let recipes = [];
  let showEditor = false, editingRecipe = null, viewingRecipe = null;
  let recipeTitle = '', recipeTags = '', recipeCoverPreview = null, recipeBlocks = [];

  // Active tab — 'posts' | 'recipes' | 'menu'
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
            filter: `follower="${currentUser.id}"&&following="${user.id}"`,
          });
          if (r.items.length) { isFollowing = true; followRecordId = r.items[0].id; }
        } catch (_) {}
      }
    }

    window.addEventListener('keydown', handleLightboxKey);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleLightboxKey);
  });

  async function loadProfile(uname) {
    try {
      const r = await pb.collection('users').getList(1, 1, { filter: `username="${uname}"` });
      user = r.items[0] ?? null;
      if (!user) goto('/search');
    } catch (_) { goto('/search'); }
    finally { loading = false; }
  }

  async function loadFollowData() {
    try {
      const [a, b] = await Promise.all([
        pb.collection('follows').getList(1, 1, { filter: `following="${user.id}"` }),
        pb.collection('follows').getList(1, 1, { filter: `follower="${user.id}"` }),
      ]);
      followersCount = a.totalItems; followingCount = b.totalItems;
    } catch (_) {}
  }

  async function loadPosts() {
    try {
      const r = await pb.collection('posts').getList(1, 50, { filter: `user="${user.id}"`, sort: '-created' });
      posts = r.items; postsCount = r.totalItems;
      for (const p of posts) {
        pb.collection('likes').getList(1, 1, { filter: `post="${p.id}"` }).then(r => {
          postStats[p.id] = { ...(postStats[p.id] || {}), likes: r.totalItems }; postStats = postStats;
        });
        pb.collection('comments').getList(1, 1, { filter: `post="${p.id}"` }).then(r => {
          postStats[p.id] = { ...(postStats[p.id] || {}), comments: r.totalItems }; postStats = postStats;
        });
      }
    } catch (_) { posts = []; }
  }

  async function loadMenu() {
    try {
      const filter = isOwnProfile ? `seller="${user.id}"` : `seller="${user.id}"&&isAvailable=true`;
      const r = await pb.collection('menuItems').getFullList({ filter, sort: 'category,name' });
      menuItems = r; menuLoaded = true;
      if (!activeCategory && r.length) activeCategory = r[0].category || 'Other';
    } catch (_) { menuItems = []; }
  }

  async function loadRecipes() {
    try {
      const r = await pb.collection('recipes').getList(1, 50, { filter: `user="${user.id}"`, sort: '-created' });
      recipes = r.items;
    } catch (err) {
      console.error('Failed to load recipes:', err);
      recipes = [];
    }
  }

  // ── Post helpers ──────────────────────────────────────────────────────────────
  function handlePostDeleted(id) {
    posts = posts.filter(p => p.id !== id);
    postsCount = Math.max(0, postsCount - 1);
    closeLightbox();
    selectedPostId = null;
  }

  function logout() { pb.authStore.clear(); goto('/auth/login'); }

  // ── Menu form (owner) ─────────────────────────────────────────────────────────
  function openNewMenuItem() {
    editingMenuItem = null;
    menuForm = { name: '', description: '', price: '', category: MENU_CATS[0], preparationTime: '15', isAvailable: true, modifiers: [] };
    menuImageFile = null; menuImagePreview = null;
    editingModifierIdx = null;
    showMenuForm = true;
  }

  function openEditMenuItem(item) {
    editingMenuItem = item;
    let mods = [];
    if (item.modifiers) {
      try { mods = typeof item.modifiers === 'string' ? JSON.parse(item.modifiers) : item.modifiers; } catch (_) {}
    }
    menuForm = {
      name: item.name, description: item.description || '',
      price: item.price, category: item.category || MENU_CATS[0],
      preparationTime: item.preparationTime || '15', isAvailable: item.isAvailable,
      modifiers: mods,
    };
    menuImageFile = null;
    menuImagePreview = item.image ? pb.files.getUrl(item, item.image) : null;
    editingModifierIdx = null;
    showMenuForm = true;
  }

  function handleMenuImg(e) {
    menuImageFile = e.target.files[0];
    if (menuImageFile) {
      const r = new FileReader(); r.onload = ev => menuImagePreview = ev.target.result; r.readAsDataURL(menuImageFile);
    }
  }

  async function saveMenuItem() {
    if (!menuForm.name.trim() || !menuForm.price) { showToast('Name and price are required', 'error'); return; }
    savingMenuItem = true;
    try {
      const fd = new FormData();
      fd.append('name', menuForm.name.trim());
      fd.append('description', menuForm.description);
      fd.append('price', parseFloat(menuForm.price));
      fd.append('category', menuForm.category);
      fd.append('preparationTime', parseInt(menuForm.preparationTime) || 15);
      fd.append('isAvailable', menuForm.isAvailable ? 'true' : 'false');
      fd.append('seller', user.id);
      fd.append('modifiers', JSON.stringify(menuForm.modifiers));
      if (menuImageFile) fd.append('image', menuImageFile);

      if (editingMenuItem) {
        const updated = await pb.collection('menuItems').update(editingMenuItem.id, fd);
        menuItems = menuItems.map(m => m.id === updated.id ? updated : m);
        showToast('Menu item updated ✓');
      } else {
        const created = await pb.collection('menuItems').create(fd);
        menuItems = [created, ...menuItems];
        if (!activeCategory) activeCategory = created.category || 'Other';
        showToast('Menu item added ✓');
      }
      showMenuForm = false;
    } catch (err) { showToast(err.message || 'Failed to save', 'error'); }
    finally { savingMenuItem = false; }
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

  // ── Modifier builder ──────────────────────────────────────────────────────────
  function startNewModifier() {
    draftModifier = { id: `mod_${Date.now()}`, label: '', type: 'radio', required: false, options: [] };
    draftOption = { id: '', name: '', price: '' };
    editingModifierIdx = 'new';
  }

  function startEditModifier(idx) {
    draftModifier = JSON.parse(JSON.stringify(menuForm.modifiers[idx]));
    draftOption = { id: '', name: '', price: '' };
    editingModifierIdx = idx;
  }

  function addDraftOption() {
    const name = draftOption.name.trim();
    if (!name) return;
    const opt = { id: `opt_${Date.now()}`, name, price: parseFloat(draftOption.price) || 0 };
    draftModifier = { ...draftModifier, options: [...draftModifier.options, opt] };
    draftOption = { id: '', name: '', price: '' };
  }

  function removeDraftOption(optId) {
    draftModifier = { ...draftModifier, options: draftModifier.options.filter(o => o.id !== optId) };
  }

  function saveDraftModifier() {
    if (!draftModifier.label.trim()) { showToast('Group label required', 'error'); return; }
    if (draftModifier.options.length === 0) { showToast('Add at least one option', 'error'); return; }
    if (editingModifierIdx === 'new') {
      menuForm = { ...menuForm, modifiers: [...menuForm.modifiers, { ...draftModifier }] };
    } else {
      const mods = [...menuForm.modifiers];
      mods[editingModifierIdx] = { ...draftModifier };
      menuForm = { ...menuForm, modifiers: mods };
    }
    editingModifierIdx = null;
  }

  function removeModifier(idx) {
    menuForm = { ...menuForm, modifiers: menuForm.modifiers.filter((_, i) => i !== idx) };
    if (editingModifierIdx === idx) editingModifierIdx = null;
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

  $: lightboxPost = lightboxIndex !== null ? posts[lightboxIndex] : null;
  $: hasMultiplePosts = posts.length > 1;
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

<!-- ════════ POST LIGHTBOX ════════════════════════════════════════════════════ -->
{#if lightboxIndex !== null && lightboxPost}
  <div
    class="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center"
    on:click|self={closeLightbox}
    role="dialog"
    aria-modal="true"
  >
    <!-- Close -->
    <button
      class="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white z-10"
      on:click={closeLightbox}
    >
      <XIcon size={18}/>
    </button>

    <!-- Prev -->
    {#if hasMultiplePosts}
      <button
        class="absolute left-3 sm:left-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white z-10"
        on:click|stopPropagation={lightboxPrev}
      >
        <ArrowLeftIcon size={20} weight="bold"/>
      </button>
    {/if}

    <!-- Image + action bar -->
    <div class="relative max-w-2xl w-full mx-16 flex flex-col items-center">
      <img
        src={pb.files.getUrl(lightboxPost, lightboxPost.image)}
        alt={lightboxPost.caption || ''}
        class="max-h-[75vh] w-full object-contain rounded-xl"
      />
      <!-- Bottom bar: stats + counter + like/comment button -->
      <div class="w-full mt-3 flex items-center justify-between px-1 gap-3">
        <div class="flex items-center gap-3 text-white/80 text-xs">
          <span class="flex items-center gap-1">
            <HeartIcon size={13} weight="fill"/>{postStats[lightboxPost.id]?.likes || 0}
          </span>
          <span class="flex items-center gap-1">
            <ChatCircleIcon size={13} weight="fill"/>{postStats[lightboxPost.id]?.comments || 0}
          </span>
        </div>
        {#if lightboxPost.caption}
          <p class="text-white/60 text-xs truncate flex-1">{lightboxPost.caption}</p>
        {/if}
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-white/50 text-xs">{lightboxIndex + 1} / {posts.length}</span>
          <!-- Opens PostModal so user can like, comment, delete -->
          <button
            class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90"
            style="background-color:#FF6B35;"
            on:click|stopPropagation={() => openPostModal(lightboxPost.id)}
          >
            Like &amp; comment
          </button>
        </div>
      </div>
    </div>

    <!-- Next -->
    {#if hasMultiplePosts}
      <button
        class="absolute right-3 sm:right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white z-10"
        on:click|stopPropagation={lightboxNext}
      >
        <ArrowRightIcon size={20} weight="bold"/>
      </button>
    {/if}
  </div>
{/if}

<!-- ════════ POST MODAL (likes / comments) ═══════════════════════════════════ -->
{#if selectedPostId}
  <PostModal
    postId={selectedPostId}
    onClose={() => { selectedPostId = null; loadPosts(); }}
    onDelete={handlePostDeleted}
  />
{/if}

<!-- ════════ MODIFIER SELECTION MODAL (customer) ═════════════════════════════ -->
{#if showModModal && modModalItem}
  <div class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" on:click|self={closeModModal}>
    <div class="bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden" style="max-height:88vh;">
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

<!-- ════════ MENU ITEM FORM MODAL (owner) ════════════════════════════════════ -->
{#if showMenuForm}
  <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" on:click|self={() => showMenuForm = false}>
    <div class="bg-background border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden" style="max-height:92vh;">
      <div class="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
        <h2 class="font-bold text-base">{editingMenuItem ? 'Edit item' : 'Add menu item'}</h2>
        <button class="p-1.5 hover:bg-muted rounded-lg" on:click={() => showMenuForm = false}><XIcon size={18}/></button>
      </div>
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-1">Name <span class="text-red-500">*</span></label>
          <input class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm" bind:value={menuForm.name} placeholder="e.g. Chicken Momo"/>
        </div>
        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-1">Description</label>
          <textarea rows="2" class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm resize-none" bind:value={menuForm.description} placeholder="What's special about this dish?"/>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1">Base price (Rs.) <span class="text-red-500">*</span></label>
            <input type="number" class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm" bind:value={menuForm.price} placeholder="0" min="0"/>
          </div>
          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1">Prep time (min)</label>
            <input type="number" class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm" bind:value={menuForm.preparationTime} placeholder="15" min="1"/>
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-1">Category</label>
          <select class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm" bind:value={menuForm.category}>
            {#each MENU_CATS as cat}<option value={cat}>{cat}</option>{/each}
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-2">Photo</label>
          {#if menuImagePreview}
            <div class="relative w-20 h-20 mb-2">
              <img src={menuImagePreview} alt="" class="w-full h-full rounded-xl object-cover"/>
              <button class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"
                on:click={() => { menuImageFile = null; menuImagePreview = null; }}>
                <XIcon size={10}/>
              </button>
            </div>
          {/if}
          <label class="cursor-pointer inline-flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-muted">
            Choose photo
            <input type="file" accept="image/*" class="hidden" on:change={handleMenuImg}/>
          </label>
        </div>
        <div class="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-xl">
          <span class="text-sm font-medium">Available to order</span>
          <button on:click={() => menuForm.isAvailable = !menuForm.isAvailable}>
            {#if menuForm.isAvailable}<ToggleRightIcon size={28} style="color:#FF6B35;"/>
            {:else}<ToggleLeftIcon size={28} class="text-muted-foreground"/>{/if}
          </button>
        </div>
        <!-- Modifiers -->
        <div class="border-t border-border pt-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="text-sm font-semibold">Add-ons & options</p>
              <p class="text-xs text-muted-foreground">Let customers customise their order</p>
            </div>
            {#if editingModifierIdx === null}
              <button class="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white hover:opacity-90"
                style="background-color:#FF6B35;" on:click={startNewModifier}>
                + Add group
              </button>
            {/if}
          </div>
          {#if menuForm.modifiers.length > 0 && editingModifierIdx === null}
            <div class="space-y-2 mb-3">
              {#each menuForm.modifiers as mod, idx}
                <div class="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-card">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">{mod.label}</p>
                    <p class="text-xs text-muted-foreground">
                      {mod.type === 'radio' ? 'Pick one' : 'Pick any'} · {mod.options.length} option{mod.options.length !== 1 ? 's' : ''}{mod.required ? ' · Required' : ''}
                    </p>
                  </div>
                  <button class="p-1.5 hover:bg-muted rounded-lg text-muted-foreground" on:click={() => startEditModifier(idx)}><PencilSimpleIcon size={14}/></button>
                  <button class="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg text-red-500" on:click={() => removeModifier(idx)}><TrashIcon size={14}/></button>
                </div>
              {/each}
            </div>
          {/if}
          {#if editingModifierIdx !== null}
            <div class="border border-[#FF6B35]/30 bg-[#FF6B3504] rounded-xl p-3 space-y-3">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[11px] font-semibold text-muted-foreground mb-1">Group label <span class="text-red-500">*</span></label>
                  <input class="w-full border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground text-sm" bind:value={draftModifier.label} placeholder="e.g. Choose filling"/>
                </div>
                <div>
                  <label class="block text-[11px] font-semibold text-muted-foreground mb-1">Selection type</label>
                  <select class="w-full border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground text-sm" bind:value={draftModifier.type}>
                    <option value="radio">Pick one only</option>
                    <option value="multi">Pick any (multi)</option>
                  </select>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <input type="checkbox" id="modRequired" bind:checked={draftModifier.required} class="rounded"/>
                <label for="modRequired" class="text-sm font-medium cursor-pointer">Required (customer must choose)</label>
              </div>
              {#if draftModifier.options.length > 0}
                <div class="space-y-1">
                  {#each draftModifier.options as opt}
                    <div class="flex items-center gap-2 text-sm px-2 py-1.5 bg-background rounded-lg border border-border">
                      <span class="flex-1 truncate">{opt.name}</span>
                      {#if opt.price !== 0}<span class="text-xs text-muted-foreground">{opt.price > 0 ? '+' : ''}Rs.{opt.price}</span>{/if}
                      <button class="text-red-500 p-0.5 rounded" on:click={() => removeDraftOption(opt.id)}><XIcon size={13}/></button>
                    </div>
                  {/each}
                </div>
              {/if}
              <div class="flex gap-2">
                <input class="flex-1 border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground text-sm"
                  bind:value={draftOption.name} placeholder="Option name" on:keydown={e => e.key === 'Enter' && addDraftOption()}/>
                <div class="relative">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rs.</span>
                  <input type="number" class="w-24 border border-border rounded-lg pl-8 pr-2 py-1.5 bg-background text-foreground text-sm" bind:value={draftOption.price} placeholder="0"/>
                </div>
                <button class="px-2.5 py-1.5 rounded-lg text-white text-xs font-semibold hover:opacity-90" style="background-color:#FF6B35;" on:click={addDraftOption}>Add</button>
              </div>
              <p class="text-[11px] text-muted-foreground">Use negative price (e.g. -20) for cheaper variants.</p>
              <div class="flex gap-2 pt-1">
                <button class="flex-1 border border-border py-1.5 rounded-lg text-sm font-medium hover:bg-muted" on:click={() => editingModifierIdx = null}>Cancel</button>
                <button class="flex-1 py-1.5 rounded-lg text-white text-sm font-semibold hover:opacity-90" style="background-color:#FF6B35;" on:click={saveDraftModifier}>Save group</button>
              </div>
            </div>
          {/if}
        </div>
      </div>
      <div class="px-5 py-4 border-t border-border flex gap-2 flex-shrink-0">
        <button class="flex-1 border border-border py-2 rounded-xl text-sm font-medium hover:bg-muted" on:click={() => showMenuForm = false}>Cancel</button>
        <button class="flex-1 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50" style="background-color:#FF6B35;" disabled={savingMenuItem} on:click={saveMenuItem}>
          {savingMenuItem ? 'Saving…' : editingMenuItem ? 'Save changes' : 'Add item'}
        </button>
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
            <span><strong>{postsCount}</strong> posts</span>
            <button class="hover:opacity-70"><strong>{followersCount}</strong> followers</button>
            <button class="hover:opacity-70"><strong>{followingCount}</strong> following</button>
            {#if menuItems.length > 0}<span><strong>{menuItems.length}</strong> menu items</span>{/if}
            {#if recipes.length > 0}<span><strong>{recipes.length}</strong> recipes</span>{/if}
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

      <!-- ══════════════════════════════════════════════════════════════════
           UNIFIED TAB BAR + CONTENT
           Layout: on desktop with business profiles, the tab bar spans the
           full width and the content below is split into a 60/40 grid.
           The menu column is ALWAYS visible on desktop (not hidden behind a tab).
           On mobile, Menu appears as a tab that replaces the left column.
      ═══════════════════════════════════════════════════════════════════ -->

      <!-- Tab bar — full width, all tabs in one row -->
      <div class="flex items-center border-b border-border mb-0">
        <!-- Posts tab -->
        <button
          class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex-shrink-0"
          style={activeTab === 'posts' ? 'border-color:#FF6B35;color:#FF6B35;' : 'border-color:transparent;color:var(--muted-foreground);'}
          on:click={() => activeTab = 'posts'}
        >
          Posts{#if postsCount > 0}<span class="opacity-60 text-xs ml-1">{postsCount}</span>{/if}
        </button>

        <!-- Recipes tab -->
        <button
          class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex-shrink-0"
          style={activeTab === 'recipes' ? 'border-color:#FF6B35;color:#FF6B35;' : 'border-color:transparent;color:var(--muted-foreground);'}
          on:click={() => activeTab = 'recipes'}
        >
          Recipes{#if recipes.length > 0}<span class="opacity-60 text-xs ml-1">{recipes.length}</span>{/if}
        </button>

        <!-- Menu tab — mobile only (on desktop the menu is always in the sidebar column) -->
        {#if isBusiness}
          <button
            class="lg:hidden flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex-shrink-0"
            style={activeTab === 'menu' ? 'border-color:#FF6B35;color:#FF6B35;' : 'border-color:transparent;color:var(--muted-foreground);'}
            on:click={() => activeTab = 'menu'}
          >
            Menu{#if menuItems.length > 0}<span class="opacity-60 text-xs ml-1">{menuItems.length}</span>{/if}
          </button>
        {/if}

        <!-- Spacer + right-side CTA -->
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

      <!-- Content area: CSS grid on desktop for true 60/40 column layout -->
      <!--
        On desktop + business: grid with two columns (posts/recipes | menu).
        The columns start at the same vertical position — no header mismatch.
        On mobile or non-business: single column.
      -->
      <div class="{isBusiness ? 'lg:grid lg:grid-cols-[1fr_280px]' : ''} lg:gap-6 items-start mt-5">

        <!-- ── LEFT COLUMN: Posts / Recipes / Mobile Menu ── -->
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
                    on:click={() => openLightbox(i)}
                  >
                    <img
                      src={pb.files.getUrl(post, post.image)}
                      alt=""
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div class="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white text-sm font-semibold">
                      <span class="flex items-center gap-1"><HeartIcon size={15} weight="fill"/>{postStats[post.id]?.likes || 0}</span>
                      <span class="flex items-center gap-1"><ChatCircleIcon size={15} weight="fill"/>{postStats[post.id]?.comments || 0}</span>
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

          <!-- MENU TAB (mobile only — the tab only appears on mobile for business) -->
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

        <!-- ── RIGHT COLUMN: Menu sidebar — desktop only, business only ── -->
        <!--
          This column sits in the CSS grid alongside the posts/recipes column.
          Both columns start at exactly the same y position (no card header offset).
          The "Add item" button is in the tab bar's right CTA area (not here),
          keeping this column purely about browsing/ordering.
        -->
        {#if isBusiness}
          <div class="hidden lg:block">
            <div class="sticky top-20 bg-card border border-border rounded-2xl overflow-hidden flex flex-col" style="max-height: calc(100vh - 120px);">

              <!-- Column header — aligned with the tab bar bottom -->
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

              <!-- Category pills -->
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

              <!-- Scrollable items -->
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
                                  <button
                                    class="px-2 py-1 rounded-lg text-white text-[11px] font-semibold hover:opacity-90"
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
              </div><!-- end scrollable items -->

            </div><!-- end sticky card -->
          </div><!-- end right column -->
        {/if}

      </div><!-- end grid content area -->

    </main>
  {:else}
    <div class="flex items-center justify-center py-32">
      <p class="text-muted-foreground">Profile not found</p>
    </div>
  {/if}
</div>

<!-- Floating cart button -->
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
</style>s