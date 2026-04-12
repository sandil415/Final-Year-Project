<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { goto } from '$app/navigation';
  import Header from '$lib/components/Header.svelte';
  import PostModal from '$lib/components/PostModal.svelte';
  import { ArrowLeftIcon, MagnifyingGlassIcon, FireIcon, HeartIcon, ChatCircleIcon } from 'phosphor-svelte';

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

  let debounceTimer = null;

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.record ?? pb.authStore.model;
    await loadExplorePosts();
  });

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else goto('/home');
  }

  function openProfile(username) {
    if (username) goto(`/profile/${username}`);
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

      // ── FIX: Batch fetch all likes + comments in just 2 requests ──────────────
      // Build one filter string covering all candidate post IDs
      const idList = candidates.map(p => `post = "${p.id}"`).join(' || ');

      const [allLikes, allComments] = await Promise.all([
        pb.collection('likes').getFullList({ filter: idList, fields: 'post' }),
        pb.collection('comments').getFullList({ filter: idList, fields: 'post' }),
      ]);

      // Count per post id using Maps
      const likeCountMap = new Map();
      const commentCountMap = new Map();

      for (const like of allLikes) {
        likeCountMap.set(like.post, (likeCountMap.get(like.post) ?? 0) + 1);
      }
      for (const comment of allComments) {
        commentCountMap.set(comment.post, (commentCountMap.get(comment.post) ?? 0) + 1);
      }

      const withStats = candidates.map(post => {
        const likes    = likeCountMap.get(post.id) ?? 0;
        const comments = commentCountMap.get(post.id) ?? 0;
        return {
          ...post,
          _likes: likes,
          _comments: comments,
          _score: post._score + likes * 3 + comments * 2,
        };
      });

      explorePosts = withStats.sort((a, b) => b._score - a._score).slice(0, 20);

    } catch (err) {
      console.error('Failed to load explore posts:', err);
      explorePosts = [];
    } finally {
      loadingExplore = false;
    }
  }

  // ── Called by PostModal when a like is toggled ─────────────────────────────
  // delta: +1 when liked, -1 when unliked
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
      const [usersRes, menuRes, recipesRes] = await Promise.all([
        pb.collection('users').getList(1, 10, {
          filter: `username ~ "${safe}" || businessName ~ "${safe}"`,
          sort: 'username',
        }).catch(e => { console.warn('users search:', e); return { items: [] }; }),

        pb.collection('menuItems').getList(1, 10, {
          filter: `name ~ "${safe}" || description ~ "${safe}"`,
          expand: 'seller',
          sort: 'name',
        }).catch(e => { console.warn('menu search:', e); return { items: [] }; }),

        pb.collection('recipes').getList(1, 8, {
          filter: `title ~ "${safe}"`,
          expand: 'user',
          sort: '-created',
        }).catch(e => { console.warn('recipes search:', e); return { items: [] }; }),
      ]);

      userResults   = usersRes.items;
      menuResults   = menuRes.items;
      recipeResults = recipesRes.items;
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
  <Header/>

  <main class="flex-1">
    <div class="max-w-2xl mx-auto px-4 py-6">

      <div class="flex items-center gap-3 mb-6">
        <button class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors" on:click={goBack}>
          <ArrowLeftIcon size={20} weight="bold"/>
        </button>
        <div class="flex-1 relative">
          <MagnifyingGlassIcon size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"/>
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
            <div class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style="border-color:#FF6B35;border-top-color:transparent;"></div>
          {/if}
        </div>
      </div>

      {#if isSearching}

        {#if searchError}
          <p class="text-sm text-red-500 mb-4">{searchError}</p>
        {/if}

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
                        <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white flex-shrink-0" style="background-color:#FF6B35;">Business</span>
                      {/if}
                    </div>
                    {#if u.businessName}
                      <span class="text-xs text-muted-foreground truncate block">{u.businessName}{u.businessType ? ` · ${u.businessType}` : ''}</span>
                    {:else if u.bio}
                      <span class="text-xs text-muted-foreground truncate block">{u.bio}</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if menuResults.length > 0}
          <div class="mb-6">
            <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Dishes & Menu Items</p>
            <div class="space-y-1">
              {#each menuResults as item (item.id)}
                <button
                  class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left"
                  on:click={() => openProfile(item.expand?.seller?.username)}
                >
                  {#if item.image && item.image.length > 0}
                    <img src={pb.files.getUrl(item, item.image)} alt={item.name} class="w-12 h-12 rounded-xl object-cover flex-shrink-0"/>
                  {:else}
                    <div class="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-xl flex-shrink-0">🍽️</div>
                  {/if}
                  <div class="flex-1 min-w-0">
                    <span class="font-medium text-sm block">{item.name}</span>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-sm font-bold" style="color:#FF6B35;">Rs. {item.price}</span>
                      {#if !item.isAvailable}<span class="text-xs text-muted-foreground">(Unavailable)</span>{/if}
                    </div>
                    {#if item.expand?.seller}
                      <span class="text-xs text-muted-foreground truncate block">by {item.expand.seller.businessName || item.expand.seller.username}</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if recipeResults.length > 0}
          <div class="mb-6">
            <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Recipes</p>
            <div class="space-y-2">
              {#each recipeResults as recipe (recipe.id)}
                {@const rtags = Array.isArray(recipe.tags) ? recipe.tags : (() => { try { return JSON.parse(recipe.tags || '[]'); } catch { return []; } })()}
                <button
                  class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left"
                  on:click={() => openProfile(recipe.expand?.user?.username)}
                >
                  {#if recipe.cover_image}
                    <img src={pb.files.getUrl(recipe, recipe.cover_image)} alt={recipe.title} class="w-12 h-12 rounded-xl object-cover flex-shrink-0"/>
                  {:else}
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-lg" style="background-color:#FF6B3515;">📖</div>
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

        {#if !loading && !searchError && !hasResults}
          <div class="text-center py-16">
            <p class="text-3xl mb-3">🔍</p>
            <p class="text-sm text-muted-foreground">No results for "<strong>{query}</strong>"</p>
            <p class="text-xs text-muted-foreground mt-2">Try a shorter or different keyword</p>
          </div>
        {/if}

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
                      src={post.expand?.user?.avatar ? pb.files.getUrl(post.expand.user, post.expand.user.avatar) : '/images/profilePlaceholder.jpg'}
                      alt=""
                      class="w-5 h-5 rounded-full object-cover border border-white/40 flex-shrink-0"
                    />
                    <span class="text-white text-xs font-semibold truncate">{post.expand?.user?.username ?? ''}</span>
                  </div>
                </div>
                {#if isFeatured && post._score > 50}
                  <div class="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-white text-xs font-bold" style="background-color:#FF6B35;">
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