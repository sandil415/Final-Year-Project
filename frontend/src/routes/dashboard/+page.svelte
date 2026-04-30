<script>
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import { cartBySeller, cartCount, cartTotal } from '$lib/stores/cart';
  import { getRecommendations, getTrending } from '$lib/recommendations';
  import {
    ArrowRightIcon,
    CalendarBlankIcon,
    ChartBarIcon,
    CheckCircleIcon,
    ClockIcon,
    CompassIcon,
    CreditCardIcon,
    ForkKnifeIcon,
    PackageIcon,
    ShoppingBagIcon,
    SparkleIcon,
    StorefrontIcon,
    TrendUpIcon,
    WarningCircleIcon,
  } from 'phosphor-svelte';

  let user = null;
  let loading = true;
  let orders = [];
  let recommendations = [];
  let menuLookup = {};
  let graphRange = '30';
  let unsubscribe = null;

  const ACTIVE_STATUSES = ['scheduled', 'pending', 'confirmed', 'preparing', 'ready'];
  const STATUS_ORDER = ['scheduled', 'pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
  const STATUS_META = {
    scheduled: { label: 'Scheduled', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
    pending: { label: 'Pending', color: '#F59E0B', bg: 'rgba(245,158,11,0.14)' },
    confirmed: { label: 'Confirmed', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
    preparing: { label: 'Preparing', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
    ready: { label: 'Ready', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    delivered: { label: 'Delivered', color: '#16A34A', bg: 'rgba(22,163,74,0.12)' },
    cancelled: { label: 'Cancelled', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  };

  onMount(async () => {
    if (!requireAuth()) {
      loading = false;
      return;
    }
    user = pb.authStore.record ?? pb.authStore.model;
    if (!user) {
      loading = false;
      return;
    }
    if (user.accountType === 'business') {
      goto('/business/dashboard');
      return;
    }

    await Promise.all([loadOrders(), loadRecommendations()]);
    loading = false;

    try {
      unsubscribe = await pb.collection('orders').subscribe('*', async (e) => {
        if (e.record?.buyer === user.id) await loadOrders();
      });
    } catch (_) {}
  });

  onDestroy(() => {
    try { unsubscribe?.(); } catch (_) {}
  });

  async function loadOrders() {
    try {
      const result = await pb.collection('orders').getFullList({
        filter: `buyer.id = "${user.id}"`,
        sort: '-created',
        expand: 'seller',
        requestKey: 'user-dashboard-orders',
      });
      orders = result;
      await loadMenuLookup(result);
    } catch (err) {
      console.error('Failed to load dashboard orders:', err);
      orders = [];
      menuLookup = {};
    }
  }

  async function loadMenuLookup(orderRows) {
    const ids = [];
    for (const order of orderRows) {
      for (const item of order.items || []) {
        if (item.menuItemId && !ids.includes(item.menuItemId)) ids.push(item.menuItemId);
      }
    }
    if (!ids.length) {
      menuLookup = {};
      return;
    }

    const next = {};
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      try {
        const rows = await pb.collection('menuItems').getFullList({
          filter: chunk.map((id) => `id = "${id}"`).join(' || '),
          fields: 'id,name,category,cuisineType',
          requestKey: `dashboard-menu-${i}`,
        });
        for (const row of rows) next[row.id] = row;
      } catch (_) {}
    }
    menuLookup = next;
  }

  async function loadRecommendations() {
    try {
      let items = await getRecommendations(user.id, { limit: 6 });
      if (!items.length) items = await getTrending(6);
      recommendations = items;
    } catch (_) {
      recommendations = await getTrending(6).catch(() => []);
    }
  }

  function sellerName(order) {
    return order.expand?.seller?.businessName || order.expand?.seller?.username || 'Seller';
  }

  function orderSummary(order) {
    const items = order.items || [];
    if (!items.length) return 'Order';
    return items.slice(0, 2).map((i) => `${i.quantity || 1}x ${i.name}`).join(', ') + (items.length > 2 ? ` +${items.length - 2}` : '');
  }

  function formatDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function formatTime(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function imageUrl(item) {
    if (!item?.image) return null;
    try { return pb.files.getUrl(item, item.image); } catch (_) { return null; }
  }

  function recSellerName(item) {
    return item.expand?.seller?.businessName || item.expand?.seller?.username || '';
  }

  function openSellerFromItem(item) {
    const username = item.expand?.seller?.username;
    if (username) goto(`/profile/${username}`);
  }

  function statusMeta(status) {
    return STATUS_META[status] || { label: status || 'Pending', color: '#6B7280', bg: 'rgba(107,114,128,0.12)' };
  }

  function progressFor(status) {
    const steps = ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];
    if (status === 'scheduled') return 12;
    if (status === 'cancelled') return 100;
    const idx = steps.indexOf(status);
    return idx < 0 ? 8 : ((idx + 1) / steps.length) * 100;
  }

  $: activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  $: recentOrders = orders.slice(0, 6);
  $: deliveredOrders = orders.filter((o) => o.status === 'delivered');
  $: totalSpent = deliveredOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
  $: avgOrder = deliveredOrders.length ? totalSpent / deliveredOrders.length : 0;

  $: spendingData = (() => {
    const days = parseInt(graphRange);
    const buckets = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets[d.toLocaleDateString('en-CA')] = 0;
    }
    for (const order of orders) {
      if (order.status === 'cancelled') continue;
      const key = new Date(order.created).toLocaleDateString('en-CA');
      if (key in buckets) buckets[key] += order.totalAmount || 0;
    }
    const entries = Object.entries(buckets);
    const stride = days <= 14 ? 1 : Math.ceil(days / 10);
    return entries
      .filter((_, idx) => idx % stride === 0 || idx === entries.length - 1)
      .map(([date, amount]) => ({
        date,
        label: new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        amount,
      }));
  })();

  $: maxSpend = Math.max(...spendingData.map((d) => d.amount), 1);

  $: statusData = (() => {
    const counts = {};
    for (const status of STATUS_ORDER) counts[status] = 0;
    for (const order of orders) counts[order.status] = (counts[order.status] || 0) + 1;
    const total = Math.max(orders.length, 1);
    return STATUS_ORDER
      .filter((status) => counts[status] > 0)
      .map((status) => ({ status, count: counts[status], pct: Math.round((counts[status] / total) * 100), ...statusMeta(status) }));
  })();

  $: tasteData = (() => {
    const tally = {};
    for (const order of orders) {
      if (order.status === 'cancelled') continue;
      for (const item of order.items || []) {
        const menuItem = menuLookup[item.menuItemId] || {};
        const key = menuItem.cuisineType || menuItem.category || 'Other';
        const amount = (item.effectivePrice ?? item.basePrice ?? 0) * (item.quantity || 1);
        tally[key] = (tally[key] || 0) + amount;
      }
    }
    const max = Math.max(...Object.values(tally), 1);
    return Object.entries(tally)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([label, amount]) => ({ label, amount, pct: Math.round((amount / max) * 100) }));
  })();
</script>

<div class="min-h-screen bg-background text-foreground">
  <Header />

  <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24">
    {#if loading}
      <div class="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div class="h-72 rounded-2xl border border-border bg-card skeleton"></div>
        <div class="h-72 rounded-2xl border border-border bg-card skeleton"></div>
      </div>
    {:else}
      <section class="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="text-sm font-medium text-muted-foreground">Dashboard</p>
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Hi {user?.username}, here is your food activity</h1>
        </div>
        <button
          class="self-start md:self-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          style="background:#FF6B35;"
          on:click={() => goto('/search')}
        >
          Find something good
        </button>
      </section>

      <section class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div class="dash-card">
          <span class="dash-kpi-label">Active orders</span>
          <strong>{activeOrders.length}</strong>
        </div>
        <div class="dash-card">
          <span class="dash-kpi-label">Total spent</span>
          <strong>Rs. {totalSpent.toFixed(0)}</strong>
        </div>
        <div class="dash-card">
          <span class="dash-kpi-label">Delivered</span>
          <strong>{deliveredOrders.length}</strong>
        </div>
        <div class="dash-card">
          <span class="dash-kpi-label">Avg. order</span>
          <strong>Rs. {avgOrder.toFixed(0)}</strong>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] items-start">
        <div class="space-y-6">
          <section class="dash-panel">
            <div class="dash-section-head">
              <div>
                <h2>Ongoing actions</h2>
                <p>Track orders and finish checkout from one place.</p>
              </div>
              <ClockIcon size={20} style="color:#FF6B35;" weight="duotone" />
            </div>

            {#if activeOrders.length === 0 && $cartCount === 0}
              <div class="empty-state">
                <PackageIcon size={28} weight="duotone" />
                <p>No active orders right now.</p>
                <span>Your next order will show here as soon as it is placed.</span>
              </div>
            {:else}
              <div class="space-y-3">
                {#if $cartCount > 0}
                  <div class="cart-action">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="dash-icon" style="background:rgba(255,107,53,0.12);color:#FF6B35;">
                        <ShoppingBagIcon size={18} weight="duotone" />
                      </div>
                      <div class="min-w-0">
                        <p class="font-semibold text-sm">Cart waiting</p>
                        <p class="text-xs text-muted-foreground truncate">
                          {$cartCount} item{$cartCount !== 1 ? 's' : ''} from {$cartBySeller.length} seller{$cartBySeller.length !== 1 ? 's' : ''} · Rs. {$cartTotal.toFixed(0)}
                        </p>
                      </div>
                    </div>
                    <button on:click={() => goto('/checkout')}>Checkout</button>
                  </div>
                {/if}

                {#each activeOrders as order (order.id)}
                  {@const meta = statusMeta(order.status)}
                  <article class="order-card">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-xs text-muted-foreground mb-0.5">{sellerName(order)}</p>
                        <h3 class="font-semibold text-sm truncate">{orderSummary(order)}</h3>
                      </div>
                      <span class="status-pill" style="background:{meta.bg};color:{meta.color};">{meta.label}</span>
                    </div>
                    <div class="progress-track">
                      <span style="width:{progressFor(order.status)}%;background:{meta.color};"></span>
                    </div>
                    <div class="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatDate(order.created)} · {formatTime(order.created)}</span>
                      <strong class="text-foreground">Rs. {(order.totalAmount || 0).toFixed(0)}</strong>
                    </div>
                  </article>
                {/each}
              </div>
            {/if}
          </section>

          <section class="dash-panel">
            <div class="dash-section-head">
              <div>
                <h2>Recommended for you</h2>
                <p>Cleaner picks based on your taste and recent activity.</p>
              </div>
              <SparkleIcon size={20} style="color:#FF6B35;" weight="fill" />
            </div>

            {#if recommendations.length === 0}
              <div class="empty-state">
                <CompassIcon size={28} weight="duotone" />
                <p>No recommendations yet.</p>
                <span>Browse dishes to help FIESTRA learn your taste.</span>
              </div>
            {:else}
              <div class="rec-grid">
                {#each recommendations as item (item.id)}
                  <button class="dash-rec-card" on:click={() => openSellerFromItem(item)}>
                    <div class="rec-image">
                      {#if imageUrl(item)}
                        <img src={imageUrl(item)} alt={item.name} loading="lazy" />
                      {:else}
                        <ForkKnifeIcon size={28} weight="duotone" />
                      {/if}
                    </div>
                    <div class="rec-body">
                      <p class="rec-name">{item.name}</p>
                      <p class="rec-seller">{recSellerName(item) || 'FIESTRA seller'}</p>
                      <p class="rec-reason">{item._reason || 'Recommended for you'}</p>
                      <div class="flex items-center justify-between mt-3">
                        <span>Rs. {item.price}</span>
                        <small>View seller</small>
                      </div>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </section>
        </div>

        <div class="space-y-6">
          <section class="dash-panel">
            <div class="dash-section-head">
              <div>
                <h2>Recent expenditure</h2>
                <p>Spending trend across your selected range.</p>
              </div>
              <div class="range-tabs" aria-label="Spending range">
                {#each ['7', '14', '30'] as range}
                  <button
                    class:active={graphRange === range}
                    on:click={() => graphRange = range}
                  >{range}d</button>
                {/each}
              </div>
            </div>

            <div class="bar-chart">
              {#each spendingData as point}
                <div class="bar-col" title={`${point.label}: Rs. ${point.amount.toFixed(0)}`}>
                  <div class="bar-value" style="height:{Math.max(6, point.amount / maxSpend * 100)}%;"></div>
                  <span>{point.label}</span>
                </div>
              {/each}
            </div>
          </section>

          <section class="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
            <div class="dash-panel">
              <div class="dash-section-head compact">
                <div>
                  <h2>Order states</h2>
                  <p>Where your orders usually land.</p>
                </div>
                <ChartBarIcon size={19} style="color:#FF6B35;" />
              </div>
              {#if statusData.length === 0}
                <div class="mini-empty">No order data yet</div>
              {:else}
                <div class="stack-list">
                  {#each statusData as row}
                    <div>
                      <div class="flex items-center justify-between text-xs mb-1">
                        <span>{row.label}</span>
                        <strong>{row.count}</strong>
                      </div>
                      <div class="mini-track"><span style="width:{row.pct}%;background:{row.color};"></span></div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="dash-panel">
              <div class="dash-section-head compact">
                <div>
                  <h2>Taste mix</h2>
                  <p>Cuisine/category spend from orders.</p>
                </div>
                <ForkKnifeIcon size={19} style="color:#FF6B35;" />
              </div>
              {#if tasteData.length === 0}
                <div class="mini-empty">Order dishes to unlock taste insights</div>
              {:else}
                <div class="stack-list">
                  {#each tasteData as row}
                    <div>
                      <div class="flex items-center justify-between text-xs mb-1">
                        <span>{row.label}</span>
                        <strong>Rs. {row.amount.toFixed(0)}</strong>
                      </div>
                      <div class="mini-track"><span style="width:{row.pct}%;background:#FF6B35;"></span></div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </section>

          <section class="dash-panel">
            <div class="dash-section-head">
              <div>
                <h2>Recent orders</h2>
                <p>Your latest purchase activity.</p>
              </div>
              <TrendUpIcon size={20} style="color:#FF6B35;" weight="duotone" />
            </div>
            {#if recentOrders.length === 0}
              <div class="empty-state small">
                <CalendarBlankIcon size={24} weight="duotone" />
                <p>No orders yet.</p>
                <span>Your order history will appear here.</span>
              </div>
            {:else}
              <div class="recent-list">
                {#each recentOrders as order (order.id)}
                  {@const meta = statusMeta(order.status)}
                  <article>
                    <div class="dash-icon" style="background:{meta.bg};color:{meta.color};">
                      {#if order.status === 'delivered'}
                        <CheckCircleIcon size={17} weight="fill" />
                      {:else if order.status === 'cancelled'}
                        <WarningCircleIcon size={17} weight="fill" />
                      {:else}
                        <StorefrontIcon size={17} weight="duotone" />
                      {/if}
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold text-sm truncate">{sellerName(order)}</p>
                      <p class="text-xs text-muted-foreground truncate">{orderSummary(order)}</p>
                      <p class="text-[11px] text-muted-foreground mt-1">
                        {formatDate(order.created)}
                        {#if order.paymentMethod === 'esewa'}
                          · eSewa
                        {:else}
                          · Cash
                        {/if}
                      </p>
                    </div>
                    <div class="text-right flex-shrink-0">
                      <p class="font-bold text-sm">Rs. {(order.totalAmount || 0).toFixed(0)}</p>
                      <span class="status-pill tiny" style="background:{meta.bg};color:{meta.color};">{meta.label}</span>
                    </div>
                  </article>
                {/each}
              </div>
            {/if}
          </section>
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .dash-card,
  .dash-panel {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 1rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.035);
  }

  .dash-card {
    padding: 1rem;
    min-height: 92px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .dash-card strong {
    font-size: clamp(1.25rem, 2vw, 1.75rem);
    line-height: 1.1;
  }

  .dash-kpi-label {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    font-weight: 600;
  }

  .dash-panel {
    padding: 1rem;
  }

  @media (min-width: 640px) {
    .dash-panel {
      padding: 1.25rem;
    }
  }

  .dash-section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .dash-section-head h2 {
    font-size: 1rem;
    font-weight: 800;
    line-height: 1.2;
  }

  .dash-section-head p {
    margin-top: 0.25rem;
    font-size: 0.78rem;
    color: hsl(var(--muted-foreground));
  }

  .dash-section-head.compact {
    margin-bottom: 0.9rem;
  }

  .dash-icon {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.75rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .empty-state,
  .mini-empty {
    border: 1px dashed hsl(var(--border));
    border-radius: 0.875rem;
    padding: 2rem 1rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
  }

  .empty-state :global(svg) {
    margin: 0 auto 0.65rem;
  }

  .empty-state p {
    color: hsl(var(--foreground));
    font-weight: 700;
    margin-bottom: 0.2rem;
  }

  .empty-state span {
    font-size: 0.82rem;
  }

  .empty-state.small {
    padding: 1.5rem 1rem;
  }

  .cart-action,
  .order-card,
  .recent-list article {
    border: 1px solid hsl(var(--border));
    border-radius: 0.9rem;
    background: hsl(var(--background));
  }

  .cart-action {
    padding: 0.85rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .cart-action button {
    padding: 0.55rem 0.85rem;
    border-radius: 0.75rem;
    background: #FF6B35;
    color: white;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .order-card {
    padding: 0.95rem;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0.28rem 0.55rem;
    font-size: 0.68rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .status-pill.tiny {
    margin-top: 0.35rem;
    font-size: 0.62rem;
  }

  .progress-track,
  .mini-track {
    height: 0.42rem;
    border-radius: 999px;
    background: hsl(var(--muted));
    overflow: hidden;
  }

  .progress-track {
    margin: 0.9rem 0 0.75rem;
  }

  .progress-track span,
  .mini-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
  }

  .rec-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }

  @media (min-width: 768px) {
    .rec-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .dash-rec-card {
    overflow: hidden;
    border: 1px solid hsl(var(--border));
    border-radius: 0.95rem;
    text-align: left;
    background: hsl(var(--background));
    transition: transform 0.15s ease, border-color 0.15s ease;
  }

  .dash-rec-card:hover {
    transform: translateY(-2px);
    border-color: #FF6B35;
  }

  .rec-image {
    height: 7.5rem;
    background: hsl(var(--muted));
    display: flex;
    align-items: center;
    justify-content: center;
    color: hsl(var(--muted-foreground));
  }

  .rec-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .rec-body {
    padding: 0.75rem;
  }

  .rec-name {
    font-size: 0.86rem;
    font-weight: 800;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .rec-seller,
  .rec-reason {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: hsl(var(--muted-foreground));
  }

  .rec-seller {
    margin-top: 0.1rem;
    font-size: 0.72rem;
  }

  .rec-reason {
    margin-top: 0.5rem;
    font-size: 0.68rem;
  }

  .rec-body span {
    color: #c04a20;
    font-size: 0.8rem;
    font-weight: 900;
  }

  .rec-body small {
    color: #FF6B35;
    font-size: 0.68rem;
    font-weight: 800;
  }

  .range-tabs {
    display: inline-flex;
    padding: 0.2rem;
    border-radius: 0.75rem;
    background: hsl(var(--muted));
  }

  .range-tabs button {
    min-width: 2.2rem;
    border-radius: 0.55rem;
    padding: 0.35rem 0.45rem;
    font-size: 0.72rem;
    font-weight: 800;
    color: hsl(var(--muted-foreground));
  }

  .range-tabs button.active {
    background: #FF6B35;
    color: white;
  }

  .bar-chart {
    height: 13rem;
    display: flex;
    align-items: end;
    gap: 0.38rem;
    padding-top: 0.75rem;
  }

  .bar-col {
    min-width: 0;
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    gap: 0.45rem;
  }

  .bar-value {
    width: 100%;
    max-width: 1.6rem;
    min-height: 0.35rem;
    border-radius: 999px 999px 0.35rem 0.35rem;
    background: linear-gradient(180deg, #FF6B35, #f59e0b);
  }

  .bar-col span {
    font-size: 0.62rem;
    color: hsl(var(--muted-foreground));
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }

  .stack-list {
    display: grid;
    gap: 0.8rem;
  }

  .mini-empty {
    padding: 1.25rem 0.75rem;
    font-size: 0.82rem;
  }

  .recent-list {
    display: grid;
    gap: 0.65rem;
  }

  .recent-list article {
    padding: 0.8rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .skeleton {
    background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--secondary)) 50%, hsl(var(--muted)) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
