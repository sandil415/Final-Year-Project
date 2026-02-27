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
    user = pb.authStore.model;
    if (user.accountType !== 'business') { goto('/profile'); return; }
    await Promise.all([loadOrders(), loadMenuCount()]);
    loading = false;

    // Realtime order updates
    pb.collection('orders').subscribe('*', async (e) => {
      if (e.record.seller === user.id) await loadOrders();
    });
  });

  async function loadOrders() {
    try {
      const result = await pb.collection('orders').getFullList({
        filter: `seller = "${user.id}"`,
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
      // Notify buyer
      await pb.collection('notifications').create({
        user: order.buyer,
        triggeredBy: user.id,
        type: 'message',
        message: `Your order from ${user.businessName} is now ${status}.`,
        read: false
      });
    } catch (e) { console.error(e); }
  }

  async function cancelOrder(order) {
    await updateOrderStatus(order, 'cancelled');
  }

  $: filteredOrders = orders.filter(o => o.status === activeTab);
  $: pendingCount = orders.filter(o => o.status === 'pending').length;

  function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  }
</script>

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

      <!-- Orders -->
      <div class="bg-card border border-border rounded-2xl overflow-hidden">
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

        <!-- Order list -->
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

                    <!-- Items -->
                    <div class="text-sm text-muted-foreground mb-2">
                      {#each (typeof order.items === 'string' ? JSON.parse(order.items) : order.items) as item}
                        <span>{item.quantity}× {item.name}</span>
                        {#if item !== (typeof order.items === 'string' ? JSON.parse(order.items) : order.items).at(-1)}<span class="mx-1">·</span>{/if}
                      {/each}
                    </div>

                    {#if order.notes}
                      <p class="text-xs text-muted-foreground italic mb-2">Note: "{order.notes}"</p>
                    {/if}

                    <p class="text-sm font-bold text-foreground">रु {order.totalAmount?.toFixed(2)}</p>
                  </div>

                  <!-- Actions -->
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
    </div>
  </main>
</div>