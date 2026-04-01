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
  let loading = false;

  let explorePosts = [];
  let loadingExplore = true;
  let currentUser = null;

  // Post viewer
  let selectedPostId = null;

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.record ?? pb.authStore.model;
    await loadExplorePosts();
  });

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else goto('/home');
  }

  async function loadExplorePosts() {
    loadingExplore = true;
    try {
      const result = await pb.collection('posts').getList(1, 60, {
        sort: '-created',
        filter: `image != ""`,
        expand: 'user'
      });

      const withStats = await Promise.all(
        result.items.map(async (post) => {
          try {
            const [likesRes, commentsRes] = await Promise.all([
              pb.collection('Likes').getList(1, 1, { filter: `post = "${post.id}"` }),
              pb.collection('comments').getList(1, 1, { filter: `post = "${post.id}"` })
            ]);
            return { ...post, _likes: likesRes.totalItems, _comments: commentsRes.totalItems };
          } catch {
            return { ...post, _likes: 0, _comments: 0 };
          }
        })
      );

      let followingIds = new Set();
      let followerIds  = new Set();
      try {
        const [fwing, fwers] = await Promise.all([
          pb.collection('follows').getFullList({ filter: `follower = "${currentUser.id}"` }),
          pb.collection('follows').getFullList({ filter: `following = "${currentUser.id}"` })
        ]);
        followingIds = new Set(fwing.map(f => f.following));
        followerIds  = new Set(fwers.map(f => f.follower));
      } catch {}

      const now = Date.now();
      const scored = withStats.map(post => {
        const ageHours  = (now - new Date(post.created).getTime()) / 3600000;
        const recency   = ageHours < 24 ? 50 : ageHours < 168 ? 20 : 0;
        const postUser  = post.expand?.user?.id || post.user;
        if (postUser === currentUser.id) return { ...post, _score: -1 };
        const score = post._likes * 3 + post._comments * 2 + recency
          + (followingIds.has(postUser) ? 30 : 0)
          + (followerIds.has(postUser)  ? 15 : 0);
        return { ...post, _score: score };
      });

      explorePosts = scored
        .filter(p => p._score >= 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 20);
    } catch (err) {
      console.error('Failed to load explore posts:', err);
      explorePosts = [];
    } finally {
      loadingExplore = false;
    }
  }

  async function search() {
    if (!query || query.trim().length === 0) {
      userResults = []; menuResults = []; return;
    }
    loading = true;
    const safeQuery = query.trim();
    try {
      const [usersRes, menuRes] = await Promise.all([
        pb.collection('users').getList(1, 10, {
          filter: `username ?~ "${safeQuery}" || businessName ?~ "${safeQuery}"`,
          sort: 'username'
        }),
        pb.collection('menuItems').getList(1, 10, {
          filter: `name ?~ "${safeQuery}" || description ?~ "${safeQuery}"`,
          expand: 'seller',
          sort: 'name'
        })
      ]);
      userResults = usersRes.items;
      menuResults = menuRes.items;
    } catch (err) {
      console.error('Search failed:', err);
      userResults = []; menuResults = [];
    } finally {
      loading = false;
    }
  }

  function openProfile(username) {
    if (username) goto(`/profile/${username}`);
  }

  function openPost(postId) {
    selectedPostId = postId;
  }

  function closePost() {
    selectedPostId = null;
    // Refresh explore scores after interaction
    loadExplorePosts();
  }

  $: isSearching = query.trim().length > 0;
</script>

<div class="min-h-screen flex flex-col bg-background text-foreground">
  <Header />

  <main class="flex-1">
    <div class="max-w-2xl mx-auto px-4 py-6">

      <!-- Top bar -->
      <div class="flex items-center gap-3 mb-6">
        <button
          class="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          on:click={goBack}
          aria-label="Go back"
        >
          <ArrowLeftIcon size={20} weight="bold" />
        </button>
        <div class="flex-1 relative">
          <MagnifyingGlassIcon
            size={16}
            class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search people, dishes, restaurants..."
            bind:value={query}
            on:input={search}
            class="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted outline-none text-sm placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <!-- SEARCH RESULTS -->
      {#if isSearching}

        {#if loading}
          <p class="text-sm text-muted-foreground">Searching for "{query}"…</p>
        {/if}

        {#if userResults.length > 0}
          <div class="mb-6">
            <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              People & Restaurants
            </p>
            <div class="space-y-1">
              {#each userResults as user (user.id)}
                <button
                  class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left"
                  on:click={() => openProfile(user.username)}
                >
                  <img
                    src={user.avatar
                      ? pb.files.getUrl(user, user.avatar)
                      : '/images/profilePlaceholder.jpg'}
                    alt={user.username}
                    class="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  />
                  <div class="flex flex-col min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-sm">{user.username}</span>
                      <!-- Show business badge only for business accounts -->
                      {#if user.accountType === 'business'}
                        <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white flex-shrink-0"
                          style="background-color: #FF6B35;">
                          Business
                        </span>
                      {/if}
                    </div>
                    {#if user.businessName}
                      <span class="text-xs text-muted-foreground truncate">
                        {user.businessName}{user.businessType ? ` · ${user.businessType}` : ''}
                      </span>
                    {:else if user.bio}
                      <span class="text-xs text-muted-foreground truncate">{user.bio}</span>
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
            <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Dishes & Menu Items
            </p>
            <div class="space-y-1">
              {#each menuResults as item (item.id)}
                <button
                  class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left"
                  on:click={() => openProfile(item.expand?.seller?.username)}
                >
                  {#if item.image && item.image.length > 0}
                    <img
                      src={pb.files.getUrl(item, item.image[0])}
                      alt={item.name}
                      class="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                    />
                  {:else}
                    <div class="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-xl flex-shrink-0">🍽️</div>
                  {/if}
                  <div class="flex-1 flex flex-col min-w-0">
                    <span class="font-medium text-sm">{item.name}</span>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-sm font-bold" style="color: #FF6B35;">Rs {item.price}</span>
                      {#if !item.isAvailable}
                        <span class="text-xs text-muted-foreground">(Unavailable)</span>
                      {/if}
                    </div>
                    {#if item.expand?.seller}
                      <span class="text-xs text-muted-foreground truncate">
                        by {item.expand.seller.businessName || item.expand.seller.username}
                      </span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if !loading && userResults.length === 0 && menuResults.length === 0}
          <div class="text-center py-12">
            <p class="text-2xl mb-2">🔍</p>
            <p class="text-sm text-muted-foreground">No results for "{query}".</p>
          </div>
        {/if}

      {:else}
        <!-- EXPLORE GRID -->
        <div class="flex items-center gap-2 mb-4">
          <h2 class="font-bold text-sm">Posts</h2>
        </div>

        {#if loadingExplore}
          <div class="explore-grid">
            {#each Array(12) as _, i}
              <div
                class="rounded-2xl skeleton {i % 7 === 0 ? 'row-span-2' : ''}"
                style="aspect-ratio: {i % 7 === 0 ? '1/2' : '1/1'};"
              ></div>
            {/each}
          </div>

        {:else if explorePosts.length === 0}
          <div class="text-center py-20">
            <p class="text-4xl mb-3">🍽️</p>
            <p class="text-muted-foreground text-sm">No posts to explore yet.</p>
          </div>

        {:else}
          <div class="explore-grid">
            {#each explorePosts as post, i}
              {@const isFeatured = i % 7 === 0}
              <button
                class="relative overflow-hidden rounded-2xl group bg-muted {isFeatured ? 'row-span-2' : ''}"
                style="aspect-ratio: {isFeatured ? '1/2' : '1/1'};"
                on:click={() => openPost(post.id)}
                aria-label={post.caption || 'View post'}
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
                      <HeartIcon size={13} weight="fill" />{post._likes}
                    </span>
                    <span class="flex items-center gap-1 text-white text-xs font-semibold">
                      <ChatCircleIcon size={13} weight="fill" />{post._comments}
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
                    <span class="text-white text-xs font-semibold truncate">
                      {post.expand?.user?.username ?? ''}
                    </span>
                  </div>
                </div>

                {#if isFeatured && post._score > 50}
                  <div class="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-white text-xs font-bold"
                    style="background-color: #FF6B35;">
                    <FireIcon size={10} weight="fill" />
                    Hot
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

<!-- Post modal — opens when a grid card is clicked -->
{#if selectedPostId}
  <PostModal
    postId={selectedPostId}
    onClose={closePost}
    onDelete={() => { selectedPostId = null; loadExplorePosts(); }}
  />
{/if}

<style>
  .explore-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    grid-auto-rows: 140px;
    gap: 0.5rem;
  }

  .explore-overlay {
    background: linear-gradient(
      to top,
      rgba(0, 0, 0, 0.80) 0%,
      rgba(0, 0, 0, 0.20) 50%,
      transparent 100%
    );
  }

  .skeleton {
    background: linear-gradient(
      90deg,
      hsl(var(--muted)) 25%,
      hsl(var(--secondary)) 50%,
      hsl(var(--muted)) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>