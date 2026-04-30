<script>
  /**
   * Shows three sections:
   *   1. For You         — personalised (or popular if cold-start)
   *   2. Healthy Picks   — items with healthScore ≥ 2.5 (Thali, Rice, Other qualify)
   *   3. Trending Now    — most ordered, falls back through 24h → 7d → 30d → newest
   *
   * Usage: <RecommendedFeed userId={currentUser?.id} />
   */

  import { onMount } from 'svelte';
  import pb from '$lib/pocketbase';
  import { goto } from '$app/navigation';
  import {
    getRecommendations,
    getHealthyPicks,
    getTrending,
  } from '$lib/recommendations';
  import {
    addItem as addCartItem,
    cacheSellerRecord,
    initCheckout,
  } from '$lib/stores/cart';
  import {
    SparkleIcon,
    LeafIcon,
    FireIcon,
    ArrowRightIcon,
    ShoppingCartIcon,
    CheckCircleIcon,
    WarningCircleIcon,
    ClockIcon,
  } from 'phosphor-svelte';

  export let userId = null;

  // Each section loads independently so a slow section doesn't block others
  let personalised    = [];
  let healthy         = [];
  let trending        = [];
  let loadingFor      = true;
  let loadingHealthy  = true;
  let loadingTrending = true;

  let toast = null;
  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => (toast = null), 2500);
  }

  onMount(() => {
    // Fire all three independently — no waiting for each other
    loadForYou();
    loadHealthy();
    loadTrendingNow();
  });

  async function loadForYou() {
    try {
      personalised = userId
        ? await getRecommendations(userId, { limit: 6 })
        : await getTrending(6);   // guest fallback
    } catch (_) { personalised = []; }
    loadingFor = false;
  }

  async function loadHealthy() {
    loadingHealthy = true;
    try {
      healthy = userId
        ? await getHealthyPicks(userId, 4)
        : await getHealthyPicks('', 4).catch(() => []);
    } catch (_) { healthy = []; }
    loadingHealthy = false;
  }

  async function loadTrendingNow() {
    loadingTrending = true;
    try {
      trending = await getTrending(8);
    } catch (_) { trending = []; }
    loadingTrending = false;
  }

  // ── helpers ────────────────────────────────────────────────────────
  function imgUrl(item) {
    if (!item?.image) return null;
    try { return pb.files.getUrl(item, item.image); } catch (_) { return null; }
  }

  function sellerName(item) {
    return item.expand?.seller?.businessName
      || item.expand?.seller?.username
      || '';
  }

  function openSeller(item) {
    const uname = item.expand?.seller?.username;
    if (uname) goto(`/profile/${uname}`);
  }

  function addToCart(item, e) {
    e?.stopPropagation();
    if (item.expand?.seller) cacheSellerRecord(item.expand.seller);
    addCartItem(item, 1, {}, []);
    initCheckout(item.seller);
    showToast(`${item.name} added to cart`);
  }

  // Health colour: green for healthy, amber for moderate, muted for indulgent
  function healthColor(score) {
    if (score >= 4) return '#16a34a';
    if (score >= 3) return '#65a30d';
    return '#d97706';
  }
</script>

<!-- ── TOAST ─────────────────────────────────────────────────────────────────── -->
{#if toast}
  <div
    class="fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-5 py-3 rounded-xl text-white text-sm font-semibold shadow-xl pointer-events-none"
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

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!--  SECTION 1 — FOR YOU                                                       -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<section class="mb-14">
  <div class="flex items-center justify-between mb-6">
    <div class="flex items-center gap-2">
      <SparkleIcon size={20} weight="fill" style="color:#FF6B35;" />
      <h3 class="h3">For You</h3>
    </div>
    <button
      class="text-sm font-semibold hover:opacity-70 flex items-center gap-1"
      style="color:#FF6B35;"
      on:click={() => goto('/search')}
    >
      See all <ArrowRightIcon size={14} weight="bold" />
    </button>
  </div>

  {#if loadingFor}
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
      {#each Array(6) as _}
        <div class="skeleton rounded-2xl" style="height:220px;"></div>
      {/each}
    </div>

  {:else if personalised.length === 0}
    <div class="text-center py-10 text-muted-foreground text-sm border-2 border-dashed border-border rounded-2xl">
      No recommendations yet — start ordering to get personalised picks!
    </div>

  {:else}
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
      {#each personalised as item (item.id)}
        <div
          class="rec-card group bg-card border border-border rounded-2xl overflow-hidden flex flex-col cursor-pointer"
          on:click={() => openSeller(item)}
          role="button"
          tabindex="0"
          on:keydown={e => e.key === 'Enter' && openSeller(item)}
        >
          <!-- Image -->
          <div class="relative h-36 bg-muted flex-shrink-0 overflow-hidden">
            {#if imgUrl(item)}
              <img
                src={imgUrl(item)}
                alt={item.name}
                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            {:else}
              <div class="w-full h-full flex items-center justify-center text-4xl select-none">🍽️</div>
            {/if}

            <!-- Healthy badge -->
            {#if item._isHealthy}
              <div
                class="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                style="background:{healthColor(item._healthScore)};"
              >
                <LeafIcon size={9} weight="fill" />
                {item._healthLabel || 'Healthy'}
              </div>
            {/if}

            <!-- Category pill -->
            {#if item.category}
              <div class="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-black/50 text-white">
                {item.category}
              </div>
            {/if}
          </div>

          <!-- Body -->
          <div class="p-3 flex flex-col flex-1">
            <p class="font-semibold text-sm text-foreground mb-0.5 truncate">{item.name}</p>
            <p class="text-xs text-muted-foreground truncate mb-1">{sellerName(item)}</p>

            <!-- Reason pill -->
            {#if item._reason}
              <p class="text-[10px] italic text-muted-foreground mb-2 truncate flex items-center gap-1">
                <ClockIcon size={9} />
                {item._reason}
              </p>
            {/if}

            <div class="flex items-center justify-between mt-auto">
              <span class="font-bold text-sm" style="color:#c04a20;">Rs. {item.price}</span>
              <button
                class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-white text-xs font-semibold hover:opacity-90 active:scale-95 transition-all"
                style="background-color:#FF6B35;"
                on:click={e => addToCart(item, e)}
              >
                <ShoppingCartIcon size={11} weight="fill" /> Add
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!--  SECTION 2 — HEALTHY PICKS                                                 -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<section class="mb-14">
  <div class="flex items-center gap-2 mb-6">
    <LeafIcon size={20} weight="fill" style="color:#16a34a;" />
    <h3 class="h3">Healthy Picks</h3>
  </div>

  {#if loadingHealthy}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      {#each Array(4) as _}
        <div class="skeleton rounded-2xl" style="height:170px;"></div>
      {/each}
    </div>

  {:else if healthy.length === 0}
    <div class="text-center py-8 text-muted-foreground text-sm border-2 border-dashed border-green-200 dark:border-green-900 rounded-2xl">
      No healthy items available right now
    </div>

  {:else}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      {#each healthy as item (item.id)}
        <div
          class="group bg-card border rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-md"
          style="border-color:{healthColor(item._healthScore)}33;"
          on:click={() => openSeller(item)}
          role="button"
          tabindex="0"
          on:keydown={e => e.key === 'Enter' && openSeller(item)}
        >
          <!-- Image -->
          <div class="relative h-28 bg-muted overflow-hidden flex-shrink-0">
            {#if imgUrl(item)}
              <img
                src={imgUrl(item)}
                alt={item.name}
                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            {:else}
              <div class="w-full h-full flex items-center justify-center text-3xl select-none">🥗</div>
            {/if}

            <!-- Health score dot -->
            <div
              class="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
              style="background:{healthColor(item._healthScore)};"
              title={item._healthLabel}
            >
              <LeafIcon size={12} weight="fill" color="white" />
            </div>
          </div>

          <!-- Body -->
          <div class="p-2.5 flex flex-col flex-1">
            <p class="font-semibold text-xs text-foreground truncate mb-0.5">{item.name}</p>
            <p
              class="text-[10px] font-medium mb-auto"
              style="color:{healthColor(item._healthScore)};"
            >
              {item._healthLabel || 'Balanced'}
            </p>
            <div class="flex items-center justify-between mt-2">
              <span class="font-bold text-xs" style="color:#c04a20;">Rs. {item.price}</span>
              <button
                class="px-2 py-0.5 rounded-lg text-white text-[10px] font-semibold hover:opacity-90 active:scale-95 transition-all"
                style="background:{healthColor(item._healthScore)};"
                on:click={e => addToCart(item, e)}
              >Add</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<!--  SECTION 3 — TRENDING NOW                                                  -->
<!-- ══════════════════════════════════════════════════════════════════════════ -->
<section class="mb-14">
  <div class="flex items-center justify-between mb-6">
    <div class="flex items-center gap-2">
      <FireIcon size={20} weight="fill" style="color:#FF6B35;" />
      <h3 class="h3">Trending Now</h3>
    </div>
    <button
      class="text-sm font-semibold hover:opacity-70 flex items-center gap-1"
      style="color:#FF6B35;"
      on:click={() => goto('/search')}
    >
      Browse all <ArrowRightIcon size={14} weight="bold" />
    </button>
  </div>

  {#if loadingTrending}
    <div class="flex gap-3 overflow-x-auto pb-2">
      {#each Array(6) as _}
        <div class="skeleton flex-shrink-0 rounded-2xl" style="width:160px;height:200px;"></div>
      {/each}
    </div>

  {:else if trending.length === 0}
    <div class="text-center py-8 text-muted-foreground text-sm border-2 border-dashed border-border rounded-2xl">
      No trending items yet
    </div>

  {:else}
    <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
      {#each trending as item, i (item.id)}
        <div
          class="flex-shrink-0 w-44 bg-card border border-border rounded-2xl overflow-hidden cursor-pointer group transition-all hover:shadow-md"
          on:click={() => openSeller(item)}
          role="button"
          tabindex="0"
          on:keydown={e => e.key === 'Enter' && openSeller(item)}
        >
          <!-- Image -->
          <div class="h-28 bg-muted relative overflow-hidden">
            {#if imgUrl(item)}
              <img
                src={imgUrl(item)}
                alt={item.name}
                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            {:else}
              <div class="w-full h-full flex items-center justify-center text-3xl select-none">🔥</div>
            {/if}

            <!-- Rank badge for top 3 -->
            {#if i < 3}
              <div
                class="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                style="background:#FF6B35;"
              >
                #{i + 1}
              </div>
            {/if}

            <!-- Healthy tag overlay -->
            {#if item._isHealthy}
              <div class="absolute bottom-2 left-2">
                <LeafIcon size={14} weight="fill" style="color:#16a34a;" />
              </div>
            {/if}
          </div>

          <!-- Body -->
          <div class="p-2.5">
            <p class="font-semibold text-xs truncate text-foreground">{item.name}</p>
            <p class="text-[10px] text-muted-foreground truncate mb-1.5">{sellerName(item)}</p>
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold" style="color:#c04a20;">Rs. {item.price}</span>
              <button
                class="px-2 py-0.5 rounded-md text-white text-[10px] font-semibold hover:opacity-90 active:scale-95 transition-all"
                style="background-color:#FF6B35;"
                on:click={e => addToCart(item, e)}
              >Add</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .rec-card {
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }
  .rec-card:hover {
    box-shadow: 0 6px 24px rgba(0,0,0,0.10);
    transform: translateY(-2px);
  }

  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  .scrollbar-hide::-webkit-scrollbar { display: none; }

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
</style>s