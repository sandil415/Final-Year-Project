<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { goto } from '$app/navigation';
  import Header from '$lib/components/Header.svelte';
  import PostModal from '$lib/components/PostModal.svelte';
  import {
    ArrowLeftIcon,
    MagnifyingGlassIcon,
    FireIcon,
    HeartIcon,
    ChatCircleIcon,
    CheckCircleIcon,
    WarningCircleIcon,
    BookmarkSimpleIcon,
  } from 'phosphor-svelte';

  let query = '';
  let userResults = [];
  let menuResults = [];
  let recipeResults = [];
  let loading = false;
  let searchError = '';

  let explorePosts = [];
  let loadingExplore = true;
  let currentUser = null;
  let selectedPostId = null;
  let favoriteRecords = {};
  let favoritePending = {};
  let toast = null;

  let debounceTimer = null;

  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => {
      if (toast?.msg === msg) toast = null;
    }, 3500);
  }

  function normalizeSearchText(value) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenizeSearchText(value) {
    return normalizeSearchText(value)
      .split(/[^a-z0-9]+/i)
      .filter(Boolean);
  }

  function matchesSearch(queryText, ...fields) {
    const normalizedQuery = normalizeSearchText(queryText);
    if (!normalizedQuery) return false;
    const combined = normalizeSearchText(fields.filter(Boolean).join(' '));
    if (!combined) return false;
    if (normalizedQuery.length < 3) {
      return tokenizeSearchText(combined).some((token) => token.startsWith(normalizedQuery));
    }
    return combined.includes(normalizedQuery);
  }

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.record ?? pb.authStore.model;
    await Promise.all([loadExplorePosts(), loadFavoriteIds()]);
  });

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else goto('/home');
  }

  function openProfile(username) {
    if (username) goto(`/profile/${username}`);
  }

  function markMenuResultFavorite(itemId, isFav) {
    menuResults = menuResults.map((entry) =>
      entry.id === itemId ? { ...entry, _isFavorite: isFav } : entry
    );
  }

  async function loadFavoriteIds() {
    try {
      const records = await pb.collection('favorites').getFullList({
        filter: `user = "${currentUser.id}"`,
        fields: 'id,menuItem',
        requestKey: 'search-favorites',
      });
      favoriteRecords = Object.fromEntries(records.map((f) => [f.menuItem, f.id]));
      menuResults = menuResults.map((entry) => ({
        ...entry,
        _isFavorite: !!favoriteRecords[entry.id],
      }));
    } catch (_) {
      favoriteRecords = {};
    }
  }

  function isFavorite(itemId) {
    const match = menuResults.find((entry) => entry.id === itemId);
    if (match && typeof match._isFavorite === 'boolean') return match._isFavorite;
    return !!favoriteRecords[itemId];
  }

  async function syncFavoriteItem(itemId) {
    if (!itemId || !currentUser?.id) return false;
    try {
      const record = await pb.collection('favorites').getFirstListItem(
        `user = "${currentUser.id}" && menuItem = "${itemId}"`,
        { fields: 'id,menuItem', requestKey: `search-favorite-${itemId}` }
      );
      favoriteRecords = { ...favoriteRecords, [itemId]: record.id };
      markMenuResultFavorite(itemId, true);
      return true;
    } catch (_) {
      const { [itemId]: _removed, ...rest } = favoriteRecords;
      favoriteRecords = rest;
      markMenuResultFavorite(itemId, false);
      return false;
    }
  }

  async function toggleFavorite(item) {
    if (!item?.id || !currentUser?.id || favoritePending[item.id]) return;
    const existingId = favoriteRecords[item.id];
    const previousRecords = favoriteRecords;
    favoritePending = { ...favoritePending, [item.id]: true };

    try {
      if (existingId) {
        const { [item.id]: _removed, ...rest } = favoriteRecords;
        favoriteRecords = rest;
        markMenuResultFavorite(item.id, false);
        await pb.collection('favorites').delete(existingId);
        showToast('Removed from saved');
      } else {
        favoriteRecords = { ...favoriteRecords, [item.id]: `pending-${item.id}` };
        markMenuResultFavorite(item.id, true);
        const saved = await pb.collection('favorites').create({
          user: currentUser.id,
          menuItem: item.id,
        });
        favoriteRecords = { ...favoriteRecords, [item.id]: saved.id };
        showToast('Saved');
      }
    } catch (err) {
      const recovered = await syncFavoriteItem(item.id);
      if (recovered) {
        showToast('Saved');
      } else {
        favoriteRecords = previousRecords;
        markMenuResultFavorite(item.id, !!previousRecords[item.id]);
        showToast(err?.response?.message || 'Could not update saved items', 'error');
      }
      console.error('Failed to update favorite:', err);
    } finally {
      const { [item.id]: _done, ...restPending } = favoritePending;
      favoritePending = restPending;
    }
  }

  async function loadExplorePosts() {
    loadingExplore = true;
    try {
      const [result, followingRaw, followerRaw] = await Promise.all([
        pb.collection('posts').getList(1, 60, {
          sort: '-created',
          filter: `image != ""`,
          expand: 'user',
        }),
        pb.collection('follows').getFullList({ filter: `follower = "${currentUser.id}"`, fields: 'following' }).catch(() => []),
        pb.collection('follows').getFullList({ filter: `following = "${currentUser.id}"`, fields: 'follower' }).catch(() => []),
      ]);

      const followingIds = new Set(followingRaw.map(f => f.following));
      const followerIds  = new Set(followerRaw.map(f => f.follower));
      const now = Date.now();

      const preScored = result.items.map(post => {
        const postUser = post.expand?.user?.id || post.user;
        if (postUser === currentUser.id) return { ...post, _score: -1, _likes: 0, _comments: 0 };
        const ageHours = (now - new Date(post.created).getTime()) / 3600000;
        const recency  = ageHours < 24 ? 50 : ageHours < 168 ? 20 : 0;
        const score    = recency + (followingIds.has(postUser) ? 30 : 0) + (followerIds.has(postUser) ? 15 : 0);
        return { ...post, _score: score, _likes: 0, _comments: 0 };
      });

      const candidates = preScored
        .filter(p => p._score >= 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 20);

      if (candidates.length === 0) {
        explorePosts = [];
        return;
      }

      const idList = candidates.map(p => `post = "${p.id}"`).join(' || ');
      const [allLikes, allComments] = await Promise.all([
        pb.collection('likes').getFullList({ filter: idList, fields: 'post' }),
        pb.collection('comments').getFullList({ filter: idList, fields: 'post' }),
      ]);

      const likeCountMap = new Map();
      const commentCountMap = new Map();
      for (const like of allLikes) likeCountMap.set(like.post, (likeCountMap.get(like.post) ?? 0) + 1);
      for (const comment of allComments) commentCountMap.set(comment.post, (commentCountMap.get(comment.post) ?? 0) + 1);

      const withStats = candidates.map(post => ({
        ...post,
        _likes:    likeCountMap.get(post.id) ?? 0,
        _comments: commentCountMap.get(post.id) ?? 0,
        _score:    post._score + (likeCountMap.get(post.id) ?? 0) * 3 + (commentCountMap.get(post.id) ?? 0) * 2,
      }));

      explorePosts = withStats.sort((a, b) => b._score - a._score).slice(0, 20);
    } catch (err) {
      console.error('Failed to load explore posts:', err);
      explorePosts = [];
    } finally {
      loadingExplore = false;
    }
  }

  function onLikeToggled(postId, delta) {
    explorePosts = explorePosts.map(p =>
      p.id === postId
        ? { ...p, _likes: Math.max(0, (p._likes ?? 0) + delta) }
        : p
    );
  }

  function onQueryInput() {
    clearTimeout(debounceTimer);
    searchError = '';
    if (!query.trim()) {
      userResults = []; menuResults = []; recipeResults = [];
      loading = false;
      return;
    }
    loading = true;
    debounceTimer = setTimeout(() => doSearch(query.trim()), 350);
  }

  async function doSearch(q) {
    const safe = q.replace(/['"\\]/g, '');
    if (!safe) { loading = false; return; }
    try {
      const shortQuery = safe.trim().length < 3;
      const [usersRes, menuRes, recipesRes] = await Promise.all([
        pb.collection('users').getList(1, shortQuery ? 40 : 10, {
          filter: shortQuery ? '' : `username ~ "${safe}" || businessName ~ "${safe}"`,
          sort: 'username',
        }).catch(e => { console.warn('users search:', e); return { items: [] }; }),

        pb.collection('menuItems').getList(1, shortQuery ? 60 : 10, {
          filter: shortQuery ? '' : `name ~ "${safe}" || description ~ "${safe}"`,
          expand: 'seller',
          sort: 'name',
        }).catch(e => { console.warn('menu search:', e); return { items: [] }; }),

        pb.collection('recipes').getList(1, shortQuery ? 40 : 8, {
          filter: shortQuery ? '' : `title ~ "${safe}"`,
          expand: 'user',
          sort: '-created',
        }).catch(e => { console.warn('recipes search:', e); return { items: [] }; }),
      ]);

      userResults = usersRes.items
        .filter((user) => matchesSearch(safe, user.username, user.businessName, user.bio))
        .slice(0, 10);

      menuResults = menuRes.items
        .filter((item) => matchesSearch(safe, item.name, item.description, item.category))
        .map((item) => ({ ...item, _isFavorite: !!favoriteRecords[item.id] }))
        .slice(0, 10);

      recipeResults = recipesRes.items
        .filter((recipe) => matchesSearch(safe, recipe.title, recipe.description, recipe.tags))
        .slice(0, 8);
    } catch (err) {
      console.error('Search failed:', err);
      searchError = 'Search failed. Please try again.';
      userResults = []; menuResults = []; recipeResults = [];
    } finally {
      loading = false;
    }
  }

  function openPost(postId) { selectedPostId = postId; }

  $: isSearching = query.trim().length > 0;
  $: hasResults = userResults.length > 0 || menuResults.length > 0 || recipeResults.length > 0;
</script>

<div class="min-h-screen flex flex-col bg-background text-foreground">
  {#if toast}
    <div
      class="fixed bottom-6 right-6 z-[200] flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold text-white pointer-events-none"
      style={toast.type === 'error' ? 'background:#EF4444;' : 'background:#16a34a;'}
    >
      {#if toast.type === 'error'}
        <WarningCircleIcon size={16} weight="fill" />
      {:else}
        <CheckCircleIcon size={16} weight="fill" />
      {/if}
      {toast.msg}
    </div>
  {/if}

  <Header/>

  <main class="flex-1">
    <div class="max-w-2xl mx-auto px-4 py-6">

      <!-- Search bar -->
      <div class="flex items-center gap-3 mb-6">
        <button
          class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          on:click={goBack}
        >
          <ArrowLeftIcon size={20} weight="bold"/>
        </button>
        <div class="flex-1 relative">
          <MagnifyingGlassIcon
            size={16}
            class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search people, dishes, recipes…"
            bind:value={query}
            on:input={onQueryInput}
            class="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted outline-none text-sm placeholder:text-muted-foreground"
            autocomplete="off"
            spellcheck="false"
          />
          {#if loading}
            <div
              class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
              style="border-color:#FF6B35;border-top-color:transparent;"
            ></div>
          {/if}
        </div>
      </div>

      <!-- ── SEARCH RESULTS ── -->
      {#if isSearching}

        {#if searchError}
          <p class="text-sm text-red-500 mb-4">{searchError}</p>
        {/if}

        <!-- People & Restaurants -->
        {#if userResults.length > 0}
          <div class="mb-6">
            <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">People & Restaurants</p>
            <div class="space-y-1">
              {#each userResults as u (u.id)}
                <button
                  class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left"
                  on:click={() => openProfile(u.username)}
                >
                  <img
                    src={u.avatar ? pb.files.getUrl(u, u.avatar) : '/images/profilePlaceholder.jpg'}
                    alt={u.username}
                    class="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-sm">{u.username}</span>
                      {#if u.accountType === 'business'}
                        <span
                          class="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white flex-shrink-0"
                          style="background-color:#FF6B35;"
                        >Business</span>
                      {/if}
                    </div>
                    {#if u.businessName}
                      <span class="text-xs text-muted-foreground truncate block">
                        {u.businessName}{u.businessType ? ` · ${u.businessType}` : ''}
                      </span>
                    {:else if u.bio}
                      <span class="text-xs text-muted-foreground truncate block">{u.bio}</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Dishes & Menu Items -->
        {#if menuResults.length > 0}
          <div class="mb-6">
            <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Dishes & Menu Items</p>
            <div class="space-y-1">
              {#each menuResults as item (item.id)}
                {@const saved = isFavorite(item.id)}
                {@const pending = !!favoritePending[item.id]}
                <div class="w-full flex items-center gap-2 rounded-xl hover:bg-muted transition-colors">

                  <!-- Clickable row area -->
                  <button
                    class="flex-1 flex items-center gap-3 p-3 text-left min-w-0"
                    on:click={() => openProfile(item.expand?.seller?.username)}
                  >
                    {#if item.image && item.image.length > 0}
                      <img
                        src={pb.files.getUrl(item, item.image)}
                        alt={item.name}
                        class="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                      />
                    {:else}
                      <div class="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-xl flex-shrink-0">🍽️</div>
                    {/if}
                    <div class="flex-1 min-w-0">
                      <span class="font-medium text-sm block">{item.name}</span>
                      <div class="flex items-center gap-2 mt-0.5">
                        <span class="text-sm font-bold" style="color:#FF6B35;">Rs. {item.price}</span>
                        {#if !item.isAvailable}
                          <span class="text-xs text-muted-foreground">(Unavailable)</span>
                        {/if}
                      </div>
                      {#if item.expand?.seller}
                        <span class="text-xs text-muted-foreground truncate block">
                          by {item.expand.seller.businessName || item.expand.seller.username}
                        </span>
                      {/if}
                    </div>
                  </button>

                  <!--
                    ── Bookmark / save button ──
                    Fixed min-width via .btn-save class so "Save" ↔ "Saved"
                    never causes a layout reflow. Saved = orange fill.
                    Unsaved = muted bg with foreground text (readable in both modes).
                  -->
                  <button
                    class="btn-save mr-2"
                    on:click|stopPropagation={() => toggleFavorite(item)}
                    title={pending ? 'Updating…' : saved ? 'Remove from saved' : 'Save'}
                    aria-label={pending ? 'Updating…' : saved ? 'Remove from saved' : 'Save'}
                    aria-pressed={saved}
                    disabled={pending}
                    style={saved
                      ? 'background-color:#FF6B35;color:white;'
                      : 'background-color:hsl(var(--muted));color:hsl(var(--foreground));border:1px solid hsl(var(--border));'}
                  >
                    <BookmarkSimpleIcon
                      size={13}
                      weight={saved ? 'fill' : 'regular'}
                    />
                    {saved ? 'Saved' : 'Save'}
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Recipes -->
        {#if recipeResults.length > 0}
          <div class="mb-6">
            <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Recipes</p>
            <div class="space-y-2">
              {#each recipeResults as recipe (recipe.id)}
                {@const rtags = Array.isArray(recipe.tags)
                  ? recipe.tags
                  : (() => { try { return JSON.parse(recipe.tags || '[]'); } catch { return []; } })()}
                <button
                  class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left"
                  on:click={() => openProfile(recipe.expand?.user?.username)}
                >
                  {#if recipe.cover_image}
                    <img
                      src={pb.files.getUrl(recipe, recipe.cover_image)}
                      alt={recipe.title}
                      class="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                    />
                  {:else}
                    <div
                      class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-lg"
                      style="background-color:#FF6B3515;"
                    >📖</div>
                  {/if}
                  <div class="flex-1 min-w-0">
                    <span class="font-medium text-sm block truncate">{recipe.title}</span>
                    {#if rtags.length}
                      <div class="flex flex-wrap gap-1 mt-0.5">
                        {#each rtags.slice(0, 3) as tag}
                          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{tag}</span>
                        {/each}
                      </div>
                    {/if}
                    {#if recipe.expand?.user}
                      <span class="text-xs text-muted-foreground">by {recipe.expand.user.username}</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- No results -->
        {#if !loading && !searchError && !hasResults}
          <div class="text-center py-16">
            <div class="flex items-center justify-center mb-3 text-muted-foreground">
              <MagnifyingGlassIcon size={32} weight="light" />
            </div>
            <p class="text-sm text-muted-foreground">No results for "<strong>{query}</strong>"</p>
            <p class="text-xs text-muted-foreground mt-2">Try a shorter or different keyword</p>
          </div>
        {/if}

      <!-- ── EXPLORE GRID ── -->
      {:else}
        <div class="flex items-center gap-2 mb-4">
          <h2 class="font-bold text-sm">Explore</h2>
        </div>

        {#if loadingExplore}
          <div class="explore-grid">
            {#each Array(12) as _, i}
              <div class="explore-cell skeleton rounded-2xl {i % 7 === 0 ? 'featured' : ''}"></div>
            {/each}
          </div>

        {:else if explorePosts.length === 0}
          <div class="text-center py-20">
            <p class="text-4xl mb-3">🍽️</p>
            <p class="text-muted-foreground text-sm">No posts to explore yet.</p>
          </div>

        {:else}
          <div class="explore-grid">
            {#each explorePosts as post, i (post.id)}
              {@const isFeatured = i % 7 === 0}
              <button
                class="explore-cell {isFeatured ? 'featured' : ''} relative overflow-hidden rounded-2xl group bg-muted"
                on:click={() => openPost(post.id)}
              >
                <img
                  src={pb.files.getUrl(post, post.image)}
                  alt={post.caption || ''}
                  class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 explore-overlay flex flex-col justify-end p-2.5">
                  <div class="flex items-center gap-3 mb-1.5">
                    <span class="flex items-center gap-1 text-white text-xs font-semibold">
                      <HeartIcon size={13} weight="fill"/>{post._likes ?? 0}
                    </span>
                    <span class="flex items-center gap-1 text-white text-xs font-semibold">
                      <ChatCircleIcon size={13} weight="fill"/>{post._comments ?? 0}
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <img
                      src={post.expand?.user?.avatar
                        ? pb.files.getUrl(post.expand.user, post.expand.user.avatar)
                        : '/images/profilePlaceholder.jpg'}
                      alt=""
                      class="w-5 h-5 rounded-full object-cover border border-white/40 flex-shrink-0"
                    />
                    <span class="text-white text-xs font-semibold truncate">{post.expand?.user?.username ?? ''}</span>
                  </div>
                </div>
                {#if isFeatured && post._score > 50}
                  <div
                    class="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-white text-xs font-bold"
                    style="background-color:#FF6B35;"
                  >
                    <FireIcon size={10} weight="fill"/>Hot
                  </div>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      {/if}

    </div>
  </main>
</div>

{#if selectedPostId}
  <PostModal
    postId={selectedPostId}
    posts={explorePosts}
    initialIndex={explorePosts.findIndex(p => p.id === selectedPostId)}
    onClose={() => { selectedPostId = null; }}
    onDelete={() => { selectedPostId = null; loadExplorePosts(); }}
    onLikeToggled={onLikeToggled}
  />
{/if}

<style>
  .explore-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    grid-auto-rows: 150px;
    gap: 0.5rem;
  }
  .explore-cell { width: 100%; height: 100%; }
  .explore-cell.featured { grid-row: span 2; height: 100%; }
  .skeleton {
    background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--secondary)) 50%, hsl(var(--muted)) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }
  .skeleton.featured { grid-row: span 2; }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .explore-overlay {
    background: linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.20) 50%, transparent 100%);
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }
</style>