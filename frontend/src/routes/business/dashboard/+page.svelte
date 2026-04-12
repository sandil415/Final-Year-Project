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
    ArrowRightIcon,
    ChartBarIcon,
    WarningIcon,
  } from 'phosphor-svelte';

  let user = null;
  let orders = [];
  let menuCount = 0;
  let loading = true;
  let activeTab = 'pending';
  let updatingOrderId = null;
  let toast = null;
  let unsubscribe = null;

  const tabs = [
    { key: 'pending',   label: 'Pending'   },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'preparing', label: 'Preparing' },
    { key: 'ready',     label: 'Ready'     },
    { key: 'delivered', label: 'Delivered' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const statusStyle = {
    pending:   { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' },
    confirmed: { bg: '#DBEAFE', text: '#1E40AF', dot: '#3B82F6' },
    preparing: { bg: '#EDE9FE', text: '#5B21B6', dot: '#8B5CF6' },
    ready:     { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' },
    delivered: { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
    cancelled: { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' },
  };

  const nextStatus = {
    pending:   'confirmed',
    confirmed: 'preparing',
    preparing: 'ready',
    ready:     'delivered',
  };

  const nextLabel = {
    pending:   'Confirm',
    confirmed: 'Preparing',
    preparing: 'Mark Ready',
    ready:     'Delivered',
  };

  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => toast = null, 3000);
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

  onDestroy(() => {
    unsubscribe?.();
  });

  async function loadOrders() {
    try {
      const result = await pb.collection('orders').getFullList({
        filter: `seller.id = "${user.id}"`,
        sort: '-created',
        expand: 'buyer'
      });
      orders = result;
    } catch (e) {
      console.error(e);
    }
  }

  async function loadMenuCount() {
    try {
      const r = await pb.collection('menuItems').getList(1, 1, {
        filter: `seller = "${user.id}"`
      });
      menuCount = r.totalItems;
    } catch (e) { menuCount = 0; }
  }

  async function updateOrderStatus(order, status) {
    updatingOrderId = order.id;
    try {
      await pb.collection('orders').update(order.id, { status });
      orders = orders.map(o => o.id === order.id ? { ...o, status } : o);
      showToast(`Order marked as ${status}`);
    } catch (e) {
      console.error('Order update failed:', e);
      showToast('Failed to update order', 'error');
    } finally {
      updatingOrderId = null;
    }

    try {
      await pb.collection('notifications').create({
        user: order.expand?.buyer?.id || order.buyer,
        triggeredBy: user.id,
        type: status === 'cancelled' ? 'orderCancelled' : 'orderAccepted',
        message: `Your order from ${user.businessName} is now ${status}.`,
        read: false
      });
    } catch (_) {}
  }

  async function cancelOrder(order) {
    await updateOrderStatus(order, 'cancelled');
  }

  $: filteredOrders = orders.filter(o => o.status === activeTab);
  $: pendingCount   = orders.filter(o => o.status === 'pending').length;
  $: tabCounts      = tabs.reduce((acc, t) => {
    acc[t.key] = orders.filter(o => o.status === t.key).length;
    return acc;
  }, {});

  $: todayDelivered = orders.filter(o =>
    o.status === 'delivered' &&
    new Date(o.created).toDateString() === new Date().toDateString()
  ).length;

  $: todayRevenue = orders
    .filter(o => o.status === 'delivered' && new Date(o.created).toDateString() === new Date().toDateString())
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
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function itemsSummary(items) {
    if (!items?.length) return '—';
    return items.map(i => `${i.quantity}× ${i.name}`).join(', ');
  }
</script>

<!-- Global toast -->
{#if toast}
  <div
    class="fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold text-white pointer-events-none"
    style={toast.type === 'error' ? 'background:#EF4444;' : 'background:#16a34a;'}
  >
    {#if toast.type === 'error'}
      <WarningIcon size={16} weight="fill" />
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
            <CookingPotIcon size={16} weight="fill" style="color:#FF6B35;" />
            <span class="text-xs font-medium text-muted-foreground tracking-wide uppercase">Business Dashboard</span>
          </div>
          <h1 class="text-2xl font-bold">{user?.businessName || 'My Business'}</h1>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
            on:click={() => goto('/business/analytics')}
          >
            <ChartBarIcon size={15} weight="duotone" />
            Analytics
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            style="background-color:#FF6B35;"
            on:click={() => goto('/business/menu')}
          >
            <BookOpenIcon size={15} weight="fill" />
            Manage Menu
          </button>
        </div>
      </div>

      <!-- ── STAT CARDS ── -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <!-- Pending -->
        <div class="bg-card border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-muted-foreground">Pending</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#FEF3C720;">
              <ClockIcon size={15} weight="duotone" style="color:#F59E0B;" />
            </div>
          </div>
          <p class="text-2xl font-bold">{orders.filter(o => o.status === 'pending').length}</p>
          <p class="text-xs text-muted-foreground mt-0.5">need action</p>
        </div>

        <!-- Preparing -->
        <div class="bg-card border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-muted-foreground">Preparing</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#EDE9FE20;">
              <CookingPotIcon size={15} weight="duotone" style="color:#8B5CF6;" />
            </div>
          </div>
          <p class="text-2xl font-bold">{orders.filter(o => o.status === 'preparing').length}</p>
          <p class="text-xs text-muted-foreground mt-0.5">in kitchen</p>
        </div>

        <!-- Delivered today -->
        <div class="bg-card border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-muted-foreground">Delivered Today</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#D1FAE520;">
              <CheckCircleIcon size={15} weight="duotone" style="color:#10B981;" />
            </div>
          </div>
          <p class="text-2xl font-bold">{todayDelivered}</p>
          <p class="text-xs text-muted-foreground mt-0.5">completed</p>
        </div>

        <!-- Today's revenue -->
        <div class="bg-card border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-medium text-muted-foreground">Today's Revenue</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#FF6B3520;">
              <ChartBarIcon size={15} weight="duotone" style="color:#FF6B35;" />
            </div>
          </div>
          <p class="text-2xl font-bold">Rs.{todayRevenue.toFixed(0)}</p>
          <p class="text-xs text-muted-foreground mt-0.5">{menuCount} menu items</p>
        </div>
      </div>

      <!-- ── ORDERS PANEL ── -->
      <div class="bg-card border border-border rounded-2xl overflow-hidden flex flex-col" style="height: 520px;">

        <!-- Panel header -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div class="flex items-center gap-2">
            <h2 class="font-bold text-sm">Orders</h2>
            <span class="text-xs text-muted-foreground">{orders.length} total</span>
          </div>
          {#if pendingCount > 0}
            <span
              class="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white animate-pulse"
              style="background-color:#FF6B35;"
            >
              <ClockIcon size={11} weight="fill" />
              {pendingCount} new
            </span>
          {/if}
        </div>

        <!-- Sticky tab bar -->
        <div class="flex gap-1 px-3 py-2 border-b border-border bg-card flex-shrink-0 overflow-x-auto scrollbar-hide">
          {#each tabs as tab}
            {@const count = tabCounts[tab.key] || 0}
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 whitespace-nowrap"
              style={activeTab === tab.key
                ? 'background-color:#FF6B35;color:white;'
                : 'color:var(--muted-foreground);'}
              class:hover:bg-muted={activeTab !== tab.key}
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
                      : 'background:hsl(var(--muted));color:hsl(var(--muted-foreground));'}
                >
                  {count}
                </span>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Scrollable order list -->
        <div class="flex-1 overflow-y-auto">
          {#if loading}
            <!-- Skeleton -->
            <div class="divide-y divide-border">
              {#each Array(5) as _}
                <div class="flex items-center gap-3 px-4 py-3">
                  <div class="skeleton w-8 h-8 rounded-full flex-shrink-0"></div>
                  <div class="flex-1 space-y-1.5">
                    <div class="skeleton h-3 w-32 rounded"></div>
                    <div class="skeleton h-2.5 w-48 rounded"></div>
                  </div>
                  <div class="skeleton h-7 w-20 rounded-lg"></div>
                </div>
              {/each}
            </div>

          {:else if filteredOrders.length === 0}
            <div class="flex flex-col items-center justify-center h-full py-12 text-center">
              <div class="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <ShoppingBagIcon size={22} weight="duotone" class="text-muted-foreground" />
              </div>
              <p class="font-medium text-sm text-foreground mb-1">No {activeTab} orders</p>
              <p class="text-xs text-muted-foreground">
                {activeTab === 'pending' ? 'New orders will appear here' : 'Orders in this state will show here'}
              </p>
            </div>

          {:else}
            <!-- Column headers -->
            <div class="grid grid-cols-[1fr_auto] gap-2 px-4 py-2 border-b border-border bg-muted/30">
              <div class="grid gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" style="grid-template-columns: 28px 110px 1fr 72px;">
                <span></span>
                <span>Customer</span>
                <span>Items</span>
                <span>Amount</span>
              </div>
              <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Actions</span>
            </div>

            <!-- Order rows -->
            <div class="divide-y divide-border">
              {#each filteredOrders as order (order.id)}
                {@const st = statusStyle[order.status] || statusStyle.pending}
                {@const isUpdating = updatingOrderId === order.id}

                <div
                  class="grid grid-cols-[1fr_auto] gap-2 px-4 py-2.5 items-center hover:bg-muted/30 transition-colors"
                  class:opacity-60={isUpdating}
                >
                  <!-- Left: order info -->
                  <div class="grid gap-2 items-center min-w-0" style="grid-template-columns: 28px 110px 1fr 72px;">

                    <!-- Status dot -->
                    <div class="flex items-center justify-center">
                      <div class="w-2 h-2 rounded-full flex-shrink-0" style="background:{st.dot};"></div>
                    </div>

                    <!-- Customer + time -->
                    <div class="min-w-0">
                      <p class="text-xs font-semibold text-foreground truncate">
                        {order.expand?.buyer?.username || 'Customer'}
                      </p>
                      <p class="text-[10px] text-muted-foreground">
                        {formatDate(order.created)} · {formatTime(order.created)}
                      </p>
                    </div>

                    <!-- Items -->
                    <div class="min-w-0">
                      <p class="text-xs text-foreground truncate">{itemsSummary(order.items)}</p>
                      {#if order.notes}
                        <p class="text-[10px] text-muted-foreground italic truncate">"{order.notes}"</p>
                      {/if}
                    </div>

                    <!-- Amount -->
                    <div>
                      <p class="text-xs font-bold text-foreground">Rs.{order.totalAmount?.toFixed(0)}</p>
                      <span
                        class="text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize"
                        style="background:{st.bg};color:{st.text};"
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>

                  <!-- Right: action buttons -->
                  <div class="flex items-center gap-1.5 flex-shrink-0">
                    {#if nextStatus[order.status]}
                      <button
                        class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                        style="background-color:#FF6B35;"
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
                      <span class="text-[10px] text-muted-foreground px-1">—</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>

            <!-- Footer row count -->
            <div class="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
              <span class="text-[11px] text-muted-foreground">
                {filteredOrders.length} {activeTab} order{filteredOrders.length !== 1 ? 's' : ''}
              </span>
              {#if activeTab === 'delivered'}
                <span class="text-[11px] font-semibold" style="color:#FF6B35;">
                  Total: Rs.{filteredOrders.reduce((s, o) => s + (o.totalAmount || 0), 0).toFixed(0)}
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

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  .animate-pulse { animation: pulse 2s ease-in-out infinite; }
</style>