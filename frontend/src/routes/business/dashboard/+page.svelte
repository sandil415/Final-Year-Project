<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import { ShoppingBag, BookOpen, TrendingUp, Clock, CheckCircle, XCircle, ChefHat } from 'lucide-svelte';

  let user = null;
  let orders = [];
  let menuCount = 0;
  let loading = true;
  let activeTab = 'pending';

  // Graph state
  let graphRange = '7'; // '7' | '14' | '30'

  const tabs = ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];
  const statusColors = {
    pending:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    preparing: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    ready:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    delivered: 'bg-muted text-muted-foreground',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  const nextStatus = {
    pending: 'confirmed',
    confirmed: 'preparing',
    preparing: 'ready',
    ready: 'delivered',
  };
  const nextStatusLabel = {
    pending: 'Confirm Order',
    confirmed: 'Start Preparing',
    preparing: 'Mark Ready',
    ready: 'Mark Delivered',
  };

  onMount(async () => {
    requireAuth();
    user = pb.authStore.record ?? pb.authStore.model;
    if (user.accountType !== 'business') { goto('/profile'); return; }
    await Promise.all([loadOrders(), loadMenuCount()]);
    loading = false;

    pb.collection('orders').subscribe('*', async (e) => {
      if (e.record.seller === user.id) await loadOrders();
    });
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
    try {
      await pb.collection('orders').update(order.id, { status });
      orders = orders.map(o => o.id === order.id ? { ...o, status } : o);
    } catch (e) {
      console.error('Order update failed:', e);
      return;
    }
    try {
      await pb.collection('notifications').create({
        user: order.expand?.buyer?.id || order.buyer,
        triggeredBy: user.id,
        type: status === 'cancelled' ? 'orderCancelled' : 'orderAccepted',
        message: `Your order from ${user.businessName} is now ${status}.`,
        read: false
      });
    } catch (notifErr) {
      console.error('Notification failed:', notifErr?.response?.data);
    }
  }

  async function cancelOrder(order) {
    await updateOrderStatus(order, 'cancelled');
  }

  $: filteredOrders = orders.filter(o => o.status === activeTab);
  $: pendingCount = orders.filter(o => o.status === 'pending').length;

  // ── Income graph ──────────────────────────────────────────────
  // Build daily income buckets from delivered orders only
  $: incomeData = (() => {
    const days = parseInt(graphRange);
    const buckets = {};

    // Pre-fill every day in range with 0 so gaps show
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets[d.toLocaleDateString('en-CA')] = 0; // YYYY-MM-DD key
    }

    // Sum delivered orders into their day bucket
    for (const order of orders) {
      if (order.status !== 'delivered') continue;
      const key = new Date(order.created).toLocaleDateString('en-CA');
      if (key in buckets) {
        buckets[key] = (buckets[key] || 0) + (order.totalAmount || 0);
      }
    }

    return Object.entries(buckets).map(([date, amount]) => ({
      date,
      label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      amount,
    }));
  })();

  $: maxIncome = Math.max(...incomeData.map(d => d.amount), 1);
  $: totalIncome = incomeData.reduce((s, d) => s + d.amount, 0);
  $: avgIncome = incomeData.length ? totalIncome / incomeData.length : 0;

  // Tooltip state
  let hoveredBar = null;
  let tooltipX = 0;
  let tooltipY = 0;

  function onBarEnter(e, bar) {
    hoveredBar = bar;
    tooltipX = e.clientX;
    tooltipY = e.clientY;
  }
  function onBarLeave() { hoveredBar = null; }
  function onBarMove(e) {
    if (hoveredBar) { tooltipX = e.clientX; tooltipY = e.clientY; }
  }

  function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  }
</script>

<!-- Tooltip (portal-style, fixed) -->
{#if hoveredBar}
  <div
    class="fixed z-50 pointer-events-none px-3 py-2 rounded-lg text-xs font-semibold text-white shadow-xl"
    style="left: {tooltipX + 12}px; top: {tooltipY - 40}px; background-color: #FF6B35;"
  >
    <div>{hoveredBar.label}</div>
    <div>Rs. {hoveredBar.amount.toFixed(2)}</div>
  </div>
{/if}

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />
  <main class="flex-1 overflow-y-auto">
    <div class="max-w-5xl mx-auto p-6">

      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <ChefHat class="w-5 h-5" style="color: #FF6B35;" />
            <span class="text-sm font-medium text-muted-foreground">Business Dashboard</span>
          </div>
          <h1 class="text-2xl font-bold">{user?.businessName || 'My Business'}</h1>
        </div>
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90"
          style="background-color: #FF6B35;"
          on:click={() => goto('/business/menu')}
        >
          <BookOpen class="w-4 h-4" /> Manage Menu
        </button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {#each [
          { label: 'Pending', value: orders.filter(o => o.status === 'pending').length, icon: Clock, color: '#F59E0B' },
          { label: 'Preparing', value: orders.filter(o => o.status === 'preparing').length, icon: ChefHat, color: '#8B5CF6' },
          { label: 'Delivered Today', value: orders.filter(o => o.status === 'delivered' && formatDate(o.created) === formatDate(new Date())).length, icon: CheckCircle, color: '#10B981' },
          { label: 'Menu Items', value: menuCount, icon: BookOpen, color: '#FF6B35' },
        ] as stat}
          {@const Icon = stat.icon}
          <div class="bg-card border border-border rounded-2xl p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-muted-foreground">{stat.label}</span>
              <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background-color: {stat.color}20;">
                <Icon class="w-4 h-4" style="color: {stat.color};" />
              </div>
            </div>
            <p class="text-2xl font-bold text-foreground">{stat.value}</p>
          </div>
        {/each}
      </div>

      <!-- Orders table -->
      <div class="bg-card border border-border rounded-2xl overflow-hidden mb-6">
        <div class="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 class="font-bold text-foreground">Orders</h2>
          {#if pendingCount > 0}
            <span class="px-2.5 py-1 rounded-full text-xs font-bold text-white" style="background-color: #FF6B35;">
              {pendingCount} new
            </span>
          {/if}
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 p-3 border-b border-border overflow-x-auto">
          {#each tabs as tab}
            <button
              class="px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors flex-shrink-0 {activeTab === tab ? 'text-white' : 'text-muted-foreground hover:bg-muted'}"
              style={activeTab === tab ? 'background-color: #FF6B35;' : ''}
              on:click={() => activeTab = tab}
            >
              {tab}
              {#if tab === 'pending' && pendingCount > 0}
                <span class="ml-1 w-4 h-4 rounded-full bg-white/30 text-xs inline-flex items-center justify-center">{pendingCount}</span>
              {/if}
            </button>
          {/each}
        </div>

        {#if loading}
          <div class="p-10 text-center text-muted-foreground">Loading orders...</div>
        {:else if filteredOrders.length === 0}
          <div class="p-10 text-center">
            <ShoppingBag class="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p class="text-muted-foreground text-sm">No {activeTab} orders</p>
          </div>
        {:else}
          <div class="divide-y divide-border">
            {#each filteredOrders as order}
              <div class="p-5">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-semibold text-sm text-foreground">
                        {order.expand?.buyer?.username || 'Customer'}
                      </span>
                      <span class="text-xs text-muted-foreground">· {formatTime(order.created)}</span>
                      <span class="px-2 py-0.5 rounded-full text-xs font-medium capitalize {statusColors[order.status]}">
                        {order.status}
                      </span>
                    </div>
                    <div class="text-sm text-muted-foreground mb-2">
                      {#each (order.items || []) as item, i}
                        <span>{item.quantity}× {item.name}</span>
                        {#if i < (order.items || []).length - 1}<span class="mx-1">·</span>{/if}
                      {/each}
                    </div>
                    {#if order.notes}
                      <p class="text-xs text-muted-foreground italic mb-2">Note: "{order.notes}"</p>
                    {/if}
                    <p class="text-sm font-bold text-foreground">Rs. {order.totalAmount?.toFixed(2)}</p>
                  </div>
                  <div class="flex flex-col gap-2 flex-shrink-0">
                    {#if nextStatus[order.status]}
                      <button
                        class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                        style="background-color: #FF6B35;"
                        on:click={() => updateOrderStatus(order, nextStatus[order.status])}
                      >
                        {nextStatusLabel[order.status]}
                      </button>
                    {/if}
                    {#if order.status !== 'delivered' && order.status !== 'cancelled'}
                      <button
                        class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                        on:click={() => cancelOrder(order)}
                      >
                        Cancel
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- ── Income Graph ─────────────────────────────────────── -->
      <div class="bg-card border border-border rounded-2xl overflow-hidden">
        <!-- Graph header -->
        <div class="px-5 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <div class="flex items-center gap-2">
            <TrendingUp class="w-4 h-4" style="color: #FF6B35;" />
            <h2 class="font-bold text-foreground">Income</h2>
            <span class="text-xs text-muted-foreground">(delivered orders only)</span>
          </div>

          <!-- Range selector -->
          <div class="flex gap-1 bg-muted rounded-lg p-1">
            {#each [['7','7d'], ['14','14d'], ['30','30d']] as [val, label]}
              <button
                class="px-3 py-1 rounded-md text-xs font-semibold transition-colors {graphRange === val ? 'text-white' : 'text-muted-foreground hover:text-foreground'}"
                style={graphRange === val ? 'background-color: #FF6B35;' : ''}
                on:click={() => graphRange = val}
              >
                {label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Summary pills -->
        <div class="flex gap-4 px-5 pt-4 pb-2 flex-wrap">
          <div class="flex flex-col">
            <span class="text-xs text-muted-foreground">Total ({graphRange}d)</span>
            <span class="text-lg font-bold text-foreground">Rs. {totalIncome.toFixed(0)}</span>
          </div>
          <div class="w-px bg-border self-stretch mx-1"></div>
          <div class="flex flex-col">
            <span class="text-xs text-muted-foreground">Daily avg</span>
            <span class="text-lg font-bold text-foreground">Rs. {avgIncome.toFixed(0)}</span>
          </div>
          <div class="w-px bg-border self-stretch mx-1"></div>
          <div class="flex flex-col">
            <span class="text-xs text-muted-foreground">Best day</span>
            <span class="text-lg font-bold text-foreground">
              Rs. {Math.max(...incomeData.map(d => d.amount)).toFixed(0)}
            </span>
          </div>
        </div>

        <!-- Bar chart -->
        <div class="px-5 pb-5 pt-2">
          {#if loading}
            <div class="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
          {:else if totalIncome === 0}
            <div class="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <TrendingUp class="w-8 h-8 opacity-30" />
              <p class="text-sm">No income in this period yet</p>
            </div>
          {:else}
            <!-- Y-axis labels + bars -->
            <div class="flex gap-2 items-end" style="height: 160px;">
              <!-- Y labels -->
              <div class="flex flex-col justify-between h-full text-right pr-2 flex-shrink-0" style="width:52px">
                <span class="text-[10px] text-muted-foreground">Rs.{maxIncome.toFixed(0)}</span>
                <span class="text-[10px] text-muted-foreground">Rs.{(maxIncome/2).toFixed(0)}</span>
                <span class="text-[10px] text-muted-foreground">0</span>
              </div>

              <!-- Bars -->
              <div class="flex-1 flex items-end gap-[3px] h-full relative">
                <!-- Grid lines -->
                <div class="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  <div class="border-t border-dashed border-border opacity-50"></div>
                  <div class="border-t border-dashed border-border opacity-50"></div>
                  <div class="border-t border-border opacity-30"></div>
                </div>

                {#each incomeData as bar}
                  {@const heightPct = maxIncome > 0 ? (bar.amount / maxIncome) * 100 : 0}
                  {@const isToday = bar.date === new Date().toLocaleDateString('en-CA')}
                  <div
                    class="relative flex-1 flex flex-col items-center justify-end h-full group cursor-default"
                    role="img"
                    aria-label="{bar.label}: Rs. {bar.amount}"
                    on:mouseenter={(e) => onBarEnter(e, bar)}
                    on:mouseleave={onBarLeave}
                    on:mousemove={onBarMove}
                  >
                    <!-- Bar fill -->
                    <div
                      class="w-full rounded-t-md transition-all duration-300 group-hover:opacity-80"
                      style="
                        height: {Math.max(heightPct, bar.amount > 0 ? 4 : 0)}%;
                        background-color: {isToday ? '#FF6B35' : '#FF6B3560'};
                        min-height: {bar.amount > 0 ? '4px' : '0'};
                      "
                    ></div>

                    <!-- X label — show every Nth to avoid clutter -->
                    {#if incomeData.length <= 10 || incomeData.indexOf(bar) % Math.ceil(incomeData.length / 8) === 0 || isToday}
                      <span
                        class="absolute -bottom-5 text-[9px] whitespace-nowrap {isToday ? 'font-bold' : 'text-muted-foreground'}"
                        style={isToday ? 'color: #FF6B35;' : ''}
                      >
                        {isToday ? 'Today' : bar.label}
                      </span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>

            <!-- X-axis spacer for labels -->
            <div class="h-6"></div>
          {/if}
        </div>
      </div>

    </div>
  </main>
</div>