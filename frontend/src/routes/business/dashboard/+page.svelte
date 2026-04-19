<script>
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import {
    CookingPotIcon,
    BookOpenIcon,
    ClockIcon,
    CheckCircleIcon,
    ShoppingBagIcon,
    XCircleIcon,
    ChartBarIcon,
    WarningCircleIcon,
    CalendarIcon,
    ArrowRightIcon,
  } from 'phosphor-svelte';

  let user = null;
  let orders = [];
  let menuCount = 0;
  let loading = true;
  let activeTab = 'pending';
  let updatingOrderId = null;
  let toast = null;
  let unsubscribe = null;

  // 7-day window: orders created in the last 7 days
  const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const tabs = [
    { key: 'scheduled',  label: 'Scheduled'  },
    { key: 'pending',    label: 'Pending'     },
    { key: 'confirmed',  label: 'Confirmed'   },
    { key: 'preparing',  label: 'Preparing'   },
    { key: 'ready',      label: 'Ready'       },
    { key: 'delivered',  label: 'Delivered'   },
    { key: 'cancelled',  label: 'Cancelled'   },
  ];

  const statusStyle = {
    scheduled: { bg: '#EDE9FE', text: '#5B21B6', dot: '#8B5CF6' },
    pending:   { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },
    confirmed: { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },
    preparing: { bg: '#EDE9FE', text: '#5B21B6', dot: '#8B5CF6' },
    ready:     { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
    delivered: { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
    cancelled: { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
  };

  const nextStatus = {
    scheduled: 'pending',
    pending:   'confirmed',
    confirmed: 'preparing',
    preparing: 'ready',
    ready:     'delivered',
  };

  const nextLabel = {
    scheduled: 'Accept',
    pending:   'Confirm',
    confirmed: 'Preparing',
    preparing: 'Mark Ready',
    ready:     'Delivered',
  };

  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => (toast = null), 3000);
  }

  onMount(async () => {
    requireAuth();
    user = pb.authStore.record ?? pb.authStore.model;
    if (user.accountType !== 'business') { goto('/profile'); return; }
    await Promise.all([loadOrders(), loadMenuCount()]);
    loading = false;

    unsubscribe = await pb.collection('orders').subscribe('*', async (e) => {
      if (e.record.seller === user.id) await loadOrders();
    });
  });

  onDestroy(() => { unsubscribe?.(); });

  async function loadOrders() {
    try {
      // Only fetch orders from the last 7 days
      const since = SEVEN_DAYS_AGO.toISOString();
      const result = await pb.collection('orders').getFullList({
        filter: `seller.id = "${user.id}" && created >= "${since}"`,
        sort: '-created',
        expand: 'buyer',
      });
      orders = result;
    } catch (e) { console.error(e); }
  }

  async function loadMenuCount() {
    try {
      const r = await pb.collection('menuItems').getList(1, 1, {
        filter: `seller = "${user.id}"`,
      });
      menuCount = r.totalItems;
    } catch (_) { menuCount = 0; }
  }

  async function updateOrderStatus(order, status) {
    updatingOrderId = order.id;
    try {
      await pb.collection('orders').update(order.id, { status });
      orders = orders.map(o => o.id === order.id ? { ...o, status } : o);
      showToast(`Order marked as ${status} ✓`);
    } catch (_) {
      showToast('Failed to update order', 'error');
    } finally {
      updatingOrderId = null;
    }

    // Notify buyer (non-blocking)
    pb.collection('notifications').create({
      user: order.expand?.buyer?.id || order.buyer,
      triggeredBy: user.id,
      type: status === 'cancelled' ? 'orderCancelled' : 'orderAccepted',
      message: `Your order from ${user.businessName} is now ${status}.`,
      read: false,
    }).catch(() => {});
  }

  async function cancelOrder(order) { await updateOrderStatus(order, 'cancelled'); }

  // ── Derived ──────────────────────────────────────────────────────────────────
  $: filteredOrders = orders.filter(o => o.status === activeTab);
  $: pendingCount   = orders.filter(o => o.status === 'pending').length;
  $: scheduledCount = orders.filter(o => o.status === 'scheduled').length;

  $: tabCounts = tabs.reduce((acc, t) => {
    acc[t.key] = orders.filter(o => o.status === t.key).length;
    return acc;
  }, {});

  $: todayDelivered = orders.filter(o =>
    o.status === 'delivered' &&
    new Date(o.created).toDateString() === new Date().toDateString()
  ).length;

  $: weekRevenue = orders
    .filter(o => o.status === 'delivered')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  $: todayRevenue = orders
    .filter(o => o.status === 'delivered' &&
      new Date(o.created).toDateString() === new Date().toDateString())
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  function formatTime(d) {
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(d) {
    const date = new Date(d);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatScheduled(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  function itemsSummary(items) {
    if (!items?.length) return '—';
    return items.map(i => `${i.quantity}× ${i.name}`).join(', ');
  }

  function daysUntil(d) {
    if (!d) return null;
    const diff = new Date(d) - new Date();
    const days = Math.ceil(diff / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
  }

  // Window label for display
  const windowLabel = (() => {
    const from = SEVEN_DAYS_AGO.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const to   = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${from} – ${to}`;
  })();
</script>

<!-- ── TOAST ─────────────────────────────────────────────────────────────────── -->
{#if toast}
  <div class="fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold text-white pointer-events-none"
    style={toast.type === 'error' ? 'background:#EF4444;' : 'background:#16a34a;'}>
    {#if toast.type === 'error'}
      <WarningCircleIcon size={16} weight="fill" />
    {:else}
      <CheckCircleIcon size={16} weight="fill" />
    {/if}
    {toast.msg}
  </div>
{/if}

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />

  <main class="flex-1 overflow-y-auto">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

      <!-- ── PAGE HEADER ── -->
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2 mb-0.5">
            <CookingPotIcon size={15} weight="fill" style="color:#FF6B35;" />
            <span class="text-xs font-medium text-muted-foreground tracking-wide uppercase">Business Dashboard</span>
          </div>
          <h1 class="text-2xl font-bold">{user?.businessName || 'My Business'}</h1>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
            on:click={() => goto('/business/analytics')}
          >
            <ChartBarIcon size={15} weight="duotone" />Analytics
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
            style="background:#FF6B35;"
            on:click={() => goto('/business/menu')}
          >
            <BookOpenIcon size={15} weight="fill" />Manage Menu
          </button>
        </div>
      </div>

      <!-- ── STAT CARDS ── -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-card border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-muted-foreground">Pending</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#FEF3C720;">
              <ClockIcon size={15} weight="duotone" style="color:#F59E0B;" />
            </div>
          </div>
          <p class="text-2xl font-bold">{pendingCount}</p>
          <p class="text-xs text-muted-foreground mt-0.5">need action</p>
        </div>

        <div class="bg-card border border-border rounded-2xl p-4 {scheduledCount > 0 ? 'ring-1 ring-purple-300 dark:ring-purple-800' : ''}">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-muted-foreground">Scheduled</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#EDE9FE20;">
              <CalendarIcon size={15} weight="duotone" style="color:#8B5CF6;" />
            </div>
          </div>
          <p class="text-2xl font-bold">{scheduledCount}</p>
          <p class="text-xs text-muted-foreground mt-0.5">upcoming</p>
        </div>

        <div class="bg-card border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-muted-foreground">Delivered Today</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#D1FAE520;">
              <CheckCircleIcon size={15} weight="duotone" style="color:#10B981;" />
            </div>
          </div>
          <p class="text-2xl font-bold">{todayDelivered}</p>
          <p class="text-xs text-muted-foreground mt-0.5">Rs.{todayRevenue.toFixed(0)} today</p>
        </div>

        <div class="bg-card border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-muted-foreground">7-Day Revenue</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#FF6B3520;">
              <ChartBarIcon size={15} weight="duotone" style="color:#FF6B35;" />
            </div>
          </div>
          <p class="text-2xl font-bold">Rs.{weekRevenue.toFixed(0)}</p>
          <p class="text-xs text-muted-foreground mt-0.5">{menuCount} menu items</p>
        </div>
      </div>

      <!-- ── ORDERS PANEL ── -->
      <!--
        Fixed-height panel with scrollable order list.
        The header, tab bar, and column headers are sticky (flex-shrink-0).
        Only the order rows area scrolls.
      -->
      <div class="bg-card border border-border rounded-2xl overflow-hidden flex flex-col" style="height:520px;">

        <!-- Panel header -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div class="flex items-center gap-2 min-w-0">
            <h2 class="font-bold text-sm">Orders</h2>
            <!-- 7-day window badge -->
            <div class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground flex-shrink-0">
              <CalendarIcon size={10} />
              {windowLabel}
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- View full history link -->
            <button
              class="flex items-center gap-1 text-[11px] font-medium hover:opacity-70 transition-opacity"
              style="color:#FF6B35;"
              on:click={() => goto('/profile/edit')}
            >
              Full history <ArrowRightIcon size={11} />
            </button>
            {#if scheduledCount > 0}
              <span class="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-white" style="background:#8B5CF6;">
                <CalendarIcon size={10} weight="fill" />{scheduledCount} scheduled
              </span>
            {/if}
            {#if pendingCount > 0}
              <span class="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-white animate-pulse" style="background:#FF6B35;">
                <ClockIcon size={10} weight="fill" />{pendingCount} new
              </span>
            {/if}
          </div>
        </div>

        <!-- Tab bar (sticky, no scroll of its own) -->
        <div class="flex gap-1 px-3 py-2 border-b border-border bg-card flex-shrink-0 overflow-x-auto scrollbar-hide">
          {#each tabs as tab}
            {@const count = tabCounts[tab.key] || 0}
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 whitespace-nowrap"
              style={activeTab === tab.key
                ? tab.key === 'scheduled'
                  ? 'background:#8B5CF6;color:white;'
                  : 'background:#FF6B35;color:white;'
                : 'color:hsl(var(--muted-foreground));'}
              on:click={() => activeTab = tab.key}
            >
              {tab.label}
              {#if count > 0}
                <span
                  class="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center"
                  style={activeTab === tab.key
                    ? 'background:rgba(255,255,255,0.25);color:white;'
                    : tab.key === 'pending'
                      ? 'background:#FF6B35;color:white;'
                      : tab.key === 'scheduled'
                        ? 'background:#8B5CF6;color:white;'
                        : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground));'}
                >{count}</span>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Scrollable order list — THIS is the only scrolling element -->
        <div class="flex-1 overflow-y-auto min-h-0">
          {#if loading}
            <!-- Skeleton rows -->
            <div class="divide-y divide-border">
              {#each Array(6) as _}
                <div class="flex items-center gap-3 px-4 py-3">
                  <div class="skeleton w-2 h-2 rounded-full flex-shrink-0"></div>
                  <div class="flex-1 space-y-1.5">
                    <div class="skeleton h-3 w-28 rounded"></div>
                    <div class="skeleton h-2.5 w-44 rounded"></div>
                  </div>
                  <div class="skeleton h-7 w-20 rounded-lg"></div>
                </div>
              {/each}
            </div>

          {:else if filteredOrders.length === 0}
            <div class="flex flex-col items-center justify-center h-full py-10 text-center">
              <div class="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                {#if activeTab === 'scheduled'}
                  <CalendarIcon size={22} weight="duotone" class="text-muted-foreground" />
                {:else}
                  <ShoppingBagIcon size={22} weight="duotone" class="text-muted-foreground" />
                {/if}
              </div>
              <p class="font-medium text-sm text-foreground mb-1">No {activeTab} orders this week</p>
              <p class="text-xs text-muted-foreground max-w-[200px]">
                {activeTab === 'scheduled'
                  ? 'Advance orders from customers appear here'
                  : `Orders in "${activeTab}" state from the last 7 days`}
              </p>
            </div>

          {:else}
            <!-- Column headers -->
            <div class="grid px-4 py-2 border-b border-border/60 bg-muted/20 flex-shrink-0"
              style="grid-template-columns: 14px 108px 1fr {activeTab === 'scheduled' ? '130px' : '68px'} auto;">
              <div></div>
              <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customer</span>
              <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Items</span>
              {#if activeTab === 'scheduled'}
                <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Scheduled For</span>
              {:else}
                <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Amount</span>
              {/if}
              <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</span>
            </div>

            <!-- Order rows — scroll happens here -->
            <div class="divide-y divide-border/60">
              {#each filteredOrders as order (order.id)}
                {@const st = statusStyle[order.status] || statusStyle.pending}
                {@const isUpdating = updatingOrderId === order.id}

                <div
                  class="grid px-4 py-2.5 items-center hover:bg-muted/20 transition-colors {isUpdating ? 'opacity-60' : ''}"
                  style="grid-template-columns: 14px 108px 1fr {activeTab === 'scheduled' ? '130px' : '68px'} auto;"
                >
                  <!-- Status dot -->
                  <div class="w-2 h-2 rounded-full flex-shrink-0" style="background:{st.dot};"></div>

                  <!-- Customer + time -->
                  <div class="min-w-0 pr-2">
                    <p class="text-xs font-semibold text-foreground truncate">
                      {order.expand?.buyer?.username || 'Customer'}
                    </p>
                    <p class="text-[10px] text-muted-foreground leading-tight">
                      {formatDate(order.created)} · {formatTime(order.created)}
                    </p>
                  </div>

                  <!-- Items -->
                  <div class="min-w-0 pr-3">
                    <p class="text-xs text-foreground truncate">{itemsSummary(order.items)}</p>
                    {#if order.notes}
                      <p class="text-[10px] text-muted-foreground italic truncate">"{order.notes}"</p>
                    {/if}
                  </div>

                  <!-- Amount or Scheduled time -->
                  {#if activeTab === 'scheduled'}
                    <div class="min-w-0 pr-2">
                      {#if order.scheduledAt}
                        <p class="text-xs font-semibold leading-tight" style="color:#8B5CF6;">{formatScheduled(order.scheduledAt)}</p>
                        <p class="text-[10px] text-muted-foreground">{daysUntil(order.scheduledAt)}</p>
                      {:else}
                        <p class="text-[10px] text-muted-foreground">No date set</p>
                      {/if}
                    </div>
                  {:else}
                    <div class="pr-2">
                      <p class="text-xs font-bold text-foreground">Rs.{order.totalAmount?.toFixed(0)}</p>
                      <span class="text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize leading-tight"
                        style="background:{st.bg};color:{st.text};">{order.status}</span>
                    </div>
                  {/if}

                  <!-- Action buttons -->
                  <div class="flex items-center gap-1.5 justify-end flex-shrink-0">
                    {#if nextStatus[order.status]}
                      <button
                        class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50 whitespace-nowrap transition-opacity"
                        style={order.status === 'scheduled' ? 'background:#8B5CF6;' : 'background:#FF6B35;'}
                        disabled={isUpdating}
                        on:click={() => updateOrderStatus(order, nextStatus[order.status])}
                      >
                        {isUpdating ? '…' : nextLabel[order.status]}
                      </button>
                    {/if}

                    {#if order.status !== 'delivered' && order.status !== 'cancelled'}
                      <button
                        class="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-50"
                        title="Cancel order"
                        disabled={isUpdating}
                        on:click={() => cancelOrder(order)}
                      >
                        <XCircleIcon size={14} weight="fill" />
                      </button>
                    {/if}

                    {#if order.status === 'delivered' || order.status === 'cancelled'}
                      <span class="text-[10px] text-muted-foreground px-1 select-none">—</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>

            <!-- Footer row inside the scroll area -->
            <div class="sticky bottom-0 px-4 py-2 border-t border-border bg-card/95 backdrop-blur-sm flex items-center justify-between flex-shrink-0">
              <span class="text-[11px] text-muted-foreground">
                {filteredOrders.length} {activeTab} order{filteredOrders.length !== 1 ? 's' : ''} this week
              </span>
              {#if activeTab === 'delivered' && filteredOrders.length > 0}
                <span class="text-[11px] font-bold" style="color:#FF6B35;">
                  Week total: Rs.{filteredOrders.reduce((s, o) => s + (o.totalAmount || 0), 0).toFixed(0)}
                </span>
              {:else if activeTab === 'scheduled' && filteredOrders.length > 0}
                <span class="text-[11px] font-bold" style="color:#8B5CF6;">
                  Upcoming value: Rs.{filteredOrders.reduce((s, o) => s + (o.totalAmount || 0), 0).toFixed(0)}
                </span>
              {/if}
            </div>
          {/if}
        </div>
      </div>

    </div>
  </main>
</div>

<style>
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  .scrollbar-hide::-webkit-scrollbar { display: none; }

  .skeleton {
    background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--secondary)) 50%, hsl(var(--muted)) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.65; } }
  .animate-pulse { animation: pulse 2s ease-in-out infinite; }
</style>