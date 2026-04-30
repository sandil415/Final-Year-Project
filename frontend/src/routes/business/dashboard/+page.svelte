<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import { ShoppingBag, BookOpenIcon, ChartBarIcon, TrendingUp, Clock, CheckCircle, XCircle, ChefHat, AlertTriangle, RotateCcw, Banknote, CreditCard, X } from 'lucide-svelte';

  let user = null;
  let orders = [];
  let menuCount = 0;
  let loading = true;
  let activeTab = 'pending';

  // Graph state
  let graphRange = '7'; // '7' | '14' | '30'

  // ── Refund modal state ────────────────────────────────────────────────────────
  let showRefundModal = false;
  let refundOrder = null;       // the order being cancelled
  let refundEsewaId = '';       // seller fills in buyer's eSewa ID for manual refund
  let refundNote = '';
  let processingRefund = false;

  // ── Cancel confirm modal (COD) ────────────────────────────────────────────────
  let showCancelModal = false;
  let cancelOrder = null;
  let cancelReason = '';
  let processingCancel = false;

  const tabs = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];

  const statusColors = {
    pending:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    preparing: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    ready:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    delivered: 'bg-muted text-muted-foreground',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const nextStatus = {
    pending:   'confirmed',
    confirmed: 'preparing',
    preparing: 'ready',
    ready:     'delivered',
  };

  const nextStatusLabel = {
    pending:   'Confirm Order',
    confirmed: 'Start Preparing',
    preparing: 'Mark Ready',
    ready:     'Mark Delivered',
  };

  // ── Payment method helpers ────────────────────────────────────────────────────
  function getPaymentMethod(order) {
    // Set by eSewa success page or cash-on-delivery placement
    return order.paymentMethod || order.payment_method || 'cash';
  }

  function isPrepaid(order) {
    const pm = getPaymentMethod(order);
    return pm === 'esewa' || pm === 'khalti' || pm === 'fonepay';
  }

  // An order that was prepaid AND is being cancelled needs a refund
  function needsRefund(order) {
    return isPrepaid(order) && order.status !== 'delivered' && order.status !== 'cancelled';
  }

  // Can the seller still cancel this order?
  // Business rule: cancellable from accepted (confirmed) all the way to ready, but NOT after delivered
  function isCancellable(order) {
    return ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);
  }

  // Refund status badge text
  function refundBadge(order) {
    const rs = order.refundStatus;
    if (!rs || rs === 'none') return null;
    if (rs === 'pending') return { label: 'Refund Pending', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
    if (rs === 'sent')    return { label: 'Refund Sent', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    return null;
  }

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

  // ── Advance order status (non-cancel) ────────────────────────────────────────
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
        type: 'orderAccepted',
        message: `Your order from ${user.businessName} is now ${status}.`,
        read: false
      });
    } catch (notifErr) {
      console.error('Notification failed:', notifErr?.response?.data);
    }
  }

  // ── CANCEL FLOW ───────────────────────────────────────────────────────────────
  // Entry point — decide which modal to show
  function initCancel(order) {
    if (needsRefund(order)) {
      // eSewa / online payment — need refund modal
      refundOrder = order;
      refundEsewaId = '';
      refundNote = '';
      showRefundModal = true;
    } else {
      // Cash on delivery — simple confirm modal
      cancelOrder = order;
      cancelReason = '';
      showCancelModal = true;
    }
  }

  // COD cancel — no money to return
  async function confirmCodCancel() {
    if (!cancelOrder || processingCancel) return;
    processingCancel = true;
    try {
      await pb.collection('orders').update(cancelOrder.id, {
        status: 'cancelled',
        cancellationReason: cancelReason || 'Cancelled by seller',
        refundStatus: 'none',
      });
      orders = orders.map(o => o.id === cancelOrder.id
        ? { ...o, status: 'cancelled', refundStatus: 'none' }
        : o
      );
      // Notify buyer
      await pb.collection('notifications').create({
        user: cancelOrder.expand?.buyer?.id || cancelOrder.buyer,
        triggeredBy: user.id,
        type: 'orderCancelled',
        message: `Your order from ${user.businessName} has been cancelled.${cancelReason ? ' Reason: ' + cancelReason : ''} No payment was taken.`,
        read: false,
      }).catch(() => {});
    } catch (e) {
      console.error('Cancel failed:', e);
    } finally {
      processingCancel = false;
      showCancelModal = false;
      cancelOrder = null;
    }
  }

  // eSewa cancel — mark refund as pending, notify buyer with transaction code
  async function confirmEsewaCancel() {
    if (!refundOrder || processingRefund) return;
    processingRefund = true;

    const txCode = refundOrder.esewaTransactionCode || refundOrder.transactionId || '—';
    const amount = refundOrder.totalAmount;
    const buyerName = refundOrder.expand?.buyer?.username || 'Customer';

    try {
      await pb.collection('orders').update(refundOrder.id, {
        status: 'cancelled',
        cancellationReason: refundNote || 'Cancelled by seller',
        refundStatus: 'pending',
        refundEsewaId: refundEsewaId || '',
      });
      orders = orders.map(o => o.id === refundOrder.id
        ? { ...o, status: 'cancelled', refundStatus: 'pending', refundEsewaId }
        : o
      );

      // Notify buyer: give them all the details they need to follow up
      await pb.collection('notifications').create({
        user: refundOrder.expand?.buyer?.id || refundOrder.buyer,
        triggeredBy: user.id,
        type: 'orderCancelled',
        message: `Your order from ${user.businessName} was cancelled. A refund of Rs. ${amount} will be sent to your eSewa account. eSewa Tx: ${txCode}. Please contact the seller if you don't receive it within 24 hrs.`,
        read: false,
      }).catch(() => {});

    } catch (e) {
      console.error('Refund cancel failed:', e);
    } finally {
      processingRefund = false;
      showRefundModal = false;
      refundOrder = null;
    }
  }

  // Seller marks refund as actually sent (after they've transferred via eSewa app)
  async function markRefundSent(order) {
    try {
      await pb.collection('orders').update(order.id, { refundStatus: 'sent' });
      orders = orders.map(o => o.id === order.id ? { ...o, refundStatus: 'sent' } : o);

      await pb.collection('notifications').create({
        user: order.expand?.buyer?.id || order.buyer,
        triggeredBy: user.id,
        type: 'orderAccepted', // closest type for positive update
        message: `${user.businessName} has sent your refund of Rs. ${order.totalAmount} via eSewa. Please check your eSewa account.`,
        read: false,
      }).catch(() => {});
    } catch (e) {
      console.error('Mark refund sent failed:', e);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  $: filteredOrders = orders.filter(o => o.status === activeTab);
  $: pendingCount   = orders.filter(o => o.status === 'pending').length;
  $: refundPendingCount = orders.filter(o => o.refundStatus === 'pending').length;

  // ── Income graph ──────────────────────────────────────────────────────────────
  $: incomeData = (() => {
    const days = parseInt(graphRange);
    const buckets = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets[d.toLocaleDateString('en-CA')] = 0;
    }
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

  $: maxIncome   = Math.max(...incomeData.map(d => d.amount), 1);
  $: totalIncome = incomeData.reduce((s, d) => s + d.amount, 0);
  $: avgIncome   = incomeData.length ? totalIncome / incomeData.length : 0;

  let hoveredBar = null;
  let tooltipX = 0;
  let tooltipY = 0;

  function onBarEnter(e, bar) { hoveredBar = bar; tooltipX = e.clientX; tooltipY = e.clientY; }
  function onBarLeave()       { hoveredBar = null; }
  function onBarMove(e)       { if (hoveredBar) { tooltipX = e.clientX; tooltipY = e.clientY; } }

  function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  }
</script>

<!-- ── Tooltip ─────────────────────────────────────────────────────────────────── -->
{#if hoveredBar}
  <div
    class="fixed z-50 pointer-events-none px-3 py-2 rounded-lg text-xs font-semibold text-white shadow-xl"
    style="left: {tooltipX + 12}px; top: {tooltipY - 40}px; background-color: #FF6B35;"
  >
    <div>{hoveredBar.label}</div>
    <div>Rs. {hoveredBar.amount.toFixed(2)}</div>
  </div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════════════
     COD CANCEL MODAL
══════════════════════════════════════════════════════════════════════════════ -->
{#if showCancelModal && cancelOrder}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" on:click={() => { if (!processingCancel) showCancelModal = false; }} role="presentation"></div>

    <div class="relative z-10 bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center flex-shrink-0">
            <XCircle class="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 class="font-bold text-base">Cancel Order</h2>
            <p class="text-xs text-muted-foreground">Cash on Delivery — no refund needed</p>
          </div>
        </div>
        <button class="p-1.5 hover:bg-muted rounded-lg" disabled={processingCancel} on:click={() => showCancelModal = false}>
          <X class="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div class="p-5 space-y-4">
        <!-- Order summary -->
        <div class="p-3 rounded-xl bg-muted/50 border border-border space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Customer</span>
            <span class="font-semibold">{cancelOrder.expand?.buyer?.username || 'Customer'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Amount</span>
            <span class="font-bold">Rs. {cancelOrder.totalAmount?.toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Payment</span>
            <span class="flex items-center gap-1 font-medium">
              <Banknote class="w-3.5 h-3.5 text-muted-foreground" />Cash on Delivery
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Status</span>
            <span class="capitalize font-medium">{cancelOrder.status}</span>
          </div>
        </div>

        <!-- Info callout -->
        <div class="flex gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
          <AlertTriangle class="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <p class="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            This is a <strong>Cash on Delivery</strong> order. No payment has been collected yet,
            so no refund is required. The customer will simply be notified of the cancellation.
          </p>
        </div>

        <!-- Reason -->
        <div>
          <label class="block text-sm font-medium mb-1">Cancellation reason <span class="text-muted-foreground font-normal">(optional)</span></label>
          <textarea
            rows="2"
            class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm resize-none"
            bind:value={cancelReason}
            placeholder="e.g. Out of stock, unable to prepare…"
            disabled={processingCancel}
          />
        </div>
      </div>

      <div class="flex gap-2 px-5 pb-5">
        <button
          class="flex-1 border border-border py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors"
          disabled={processingCancel}
          on:click={() => showCancelModal = false}
        >
          Keep Order
        </button>
        <button
          class="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
          disabled={processingCancel}
          on:click={confirmCodCancel}
        >
          {processingCancel ? 'Cancelling…' : 'Cancel Order'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════════════
     ESEWA REFUND MODAL
══════════════════════════════════════════════════════════════════════════════ -->
{#if showRefundModal && refundOrder}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" on:click={() => { if (!processingRefund) showRefundModal = false; }} role="presentation"></div>

    <div class="relative z-10 bg-background border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style="background-color: #FF6B3520;">
            <RotateCcw class="w-5 h-5" style="color: #FF6B35;" />
          </div>
          <div>
            <h2 class="font-bold text-base">Cancel & Initiate Refund</h2>
            <p class="text-xs text-muted-foreground">eSewa payment — refund required</p>
          </div>
        </div>
        <button class="p-1.5 hover:bg-muted rounded-lg" disabled={processingRefund} on:click={() => showRefundModal = false}>
          <X class="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div class="p-5 space-y-4">
        <!-- Order summary -->
        <div class="p-3 rounded-xl bg-muted/50 border border-border space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Customer</span>
            <span class="font-semibold">{refundOrder.expand?.buyer?.username || 'Customer'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Refund Amount</span>
            <span class="font-bold text-green-600">Rs. {refundOrder.totalAmount?.toFixed(2)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Payment</span>
            <span class="flex items-center gap-1 font-medium" style="color:#60BB46;">
              <CreditCard class="w-3.5 h-3.5" />eSewa
            </span>
          </div>
          {#if refundOrder.esewaTransactionCode}
            <div class="flex justify-between">
              <span class="text-muted-foreground">eSewa Tx Code</span>
              <span class="font-mono text-xs font-bold">{refundOrder.esewaTransactionCode}</span>
            </div>
          {/if}
          <div class="flex justify-between">
            <span class="text-muted-foreground">Order Status</span>
            <span class="capitalize font-medium">{refundOrder.status}</span>
          </div>
        </div>

        <!-- Warning callout -->
        <div class="flex gap-3 p-3 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
          <AlertTriangle class="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
          <div class="text-xs text-orange-700 dark:text-orange-300 leading-relaxed space-y-1">
            <p><strong>This order was paid via eSewa.</strong> By cancelling, you are responsible for returning Rs. {refundOrder.totalAmount?.toFixed(2)} to the customer.</p>
            <p>After cancelling, send the refund via your eSewa app to the customer's eSewa ID and then click "Mark Refund Sent".</p>
          </div>
        </div>

        <!-- Buyer's eSewa ID (optional — seller may already know it) -->
        <div>
          <label class="block text-sm font-medium mb-1">
            Customer's eSewa ID / Phone
            <span class="text-muted-foreground font-normal">(optional — to help you transfer)</span>
          </label>
          <input
            type="text"
            class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm"
            bind:value={refundEsewaId}
            placeholder="e.g. 98XXXXXXXX"
            disabled={processingRefund}
          />
          <p class="text-xs text-muted-foreground mt-1">
            This is saved on the order for your reference. The customer will be notified with the eSewa transaction code.
          </p>
        </div>

        <!-- Reason -->
        <div>
          <label class="block text-sm font-medium mb-1">Cancellation reason <span class="text-muted-foreground font-normal">(optional)</span></label>
          <textarea
            rows="2"
            class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm resize-none"
            bind:value={refundNote}
            placeholder="e.g. Ingredient unavailable, unable to fulfil…"
            disabled={processingRefund}
          />
        </div>
      </div>

      <div class="flex gap-2 px-5 pb-5">
        <button
          class="flex-1 border border-border py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors"
          disabled={processingRefund}
          on:click={() => showRefundModal = false}
        >
          Keep Order
        </button>
        <button
          class="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          style="background-color: #FF6B35;"
          disabled={processingRefund}
          on:click={confirmEsewaCancel}
        >
          {processingRefund ? 'Processing…' : 'Cancel & Flag Refund'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- ══════════════════════════════════════════════════════════════════════════════
     PAGE
══════════════════════════════════════════════════════════════════════════════ -->
<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />
  <main class="flex-1 overflow-y-auto">
    <div class="max-w-5xl mx-auto p-6">

      <!-- Dashboard header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <ChefHat class="w-5 h-5" style="color: #FF6B35;" />
            <span class="text-sm font-medium text-muted-foreground">Business Dashboard</span>
          </div>
          <h1 class="text-2xl font-bold">{user?.businessName || 'My Business'}</h1>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 bg-[hsl(var(--app-primary))]"
            on:click={() => goto('/business/analytics')}
          >
            <ChartBarIcon size={15} weight="duotone" /> Analytics
          </button>

          <button
            class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 bg-[hsl(var(--app-primary))]"
            on:click={() => goto('/business/menu')}
          >
            <BookOpenIcon size={15} weight="fill" /> Manage Menu
          </button>
        </div>
      </div>

      <!-- Refund alert banner -->
      {#if refundPendingCount > 0}
        <div class="flex items-center gap-3 mb-6 p-4 rounded-2xl border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/20">
          <RotateCcw class="w-5 h-5 flex-shrink-0" style="color: #FF6B35;" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-orange-700 dark:text-orange-400">
              {refundPendingCount} refund{refundPendingCount > 1 ? 's' : ''} pending
            </p>
            <p class="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
              You have eSewa refunds that haven't been marked as sent. Please transfer and mark them below.
            </p>
          </div>
          <button
            class="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg text-white hover:opacity-90"
            style="background-color: #FF6B35;"
            on:click={() => activeTab = 'cancelled'}
          >
            View →
          </button>
        </div>
      {/if}

      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {#each [
          { label: 'Pending',        value: orders.filter(o => o.status === 'pending').length,    icon: Clock,        color: '#F59E0B' },
          { label: 'Preparing',      value: orders.filter(o => o.status === 'preparing').length,  icon: ChefHat,      color: '#8B5CF6' },
          { label: 'Delivered Today',value: orders.filter(o => o.status === 'delivered' && formatDate(o.created) === formatDate(new Date())).length, icon: CheckCircle, color: '#10B981' },
          { label: 'Menu Items',     value: menuCount, icon: BookOpenIcon, color: '#FF6B35' },
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
          <div class="flex items-center gap-2">
            {#if refundPendingCount > 0}
              <span class="px-2.5 py-1 rounded-full text-xs font-bold text-white bg-orange-500">
                {refundPendingCount} refund{refundPendingCount > 1 ? 's' : ''}
              </span>
            {/if}
            {#if pendingCount > 0}
              <span class="px-2.5 py-1 rounded-full text-xs font-bold text-white" style="background-color: #FF6B35;">
                {pendingCount} new
              </span>
            {/if}
          </div>
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
              {#if tab === 'cancelled' && refundPendingCount > 0}
                <span class="ml-1 w-4 h-4 rounded-full bg-orange-200/80 text-orange-800 text-xs inline-flex items-center justify-center">{refundPendingCount}</span>
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
              {@const pm = getPaymentMethod(order)}
              {@const isPaid = isPrepaid(order)}
              {@const rb = refundBadge(order)}

              <div class="p-5">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1 min-w-0">

                    <!-- Row 1: buyer + time + status + payment badge -->
                    <div class="flex flex-wrap items-center gap-2 mb-1">
                      <span class="font-semibold text-sm text-foreground">
                        {order.expand?.buyer?.username || 'Customer'}
                      </span>
                      <span class="text-xs text-muted-foreground">· {formatTime(order.created)}</span>

                      <!-- Order status -->
                      <span class="px-2 py-0.5 rounded-full text-xs font-medium capitalize {statusColors[order.status]}">
                        {order.status}
                      </span>

                      <!-- Payment method badge -->
                      {#if isPaid}
                        <span class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white" style="background-color: #60BB46;">
                          <CreditCard class="w-3 h-3" />eSewa
                        </span>
                      {:else}
                        <span class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                          <Banknote class="w-3 h-3" />COD
                        </span>
                      {/if}

                      <!-- Refund status badge -->
                      {#if rb}
                        <span class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold {rb.color}">
                          <RotateCcw class="w-3 h-3" />{rb.label}
                        </span>
                      {/if}
                    </div>

                    <!-- Items list -->
                    <div class="text-sm text-muted-foreground mb-2">
                      {#each (order.items || []) as item, i}
                        <span>{item.quantity}× {item.name}</span>
                        {#if i < (order.items || []).length - 1}<span class="mx-1">·</span>{/if}
                      {/each}
                    </div>

                    <!-- Notes -->
                    {#if order.notes}
                      <p class="text-xs text-muted-foreground italic mb-2">Note: "{order.notes}"</p>
                    {/if}

                    <!-- Cancellation reason -->
                    {#if order.status === 'cancelled' && order.cancellationReason}
                      <p class="text-xs text-red-500 italic mb-2">Cancellation: "{order.cancellationReason}"</p>
                    {/if}

                    <!-- Refund details for cancelled eSewa orders -->
                    {#if order.status === 'cancelled' && isPaid}
                      <div class="mt-2 p-2.5 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 text-xs space-y-1">
                        <div class="flex items-center gap-1.5 font-semibold text-orange-700 dark:text-orange-400">
                          <RotateCcw class="w-3.5 h-3.5" />
                          Refund: Rs. {order.totalAmount?.toFixed(2)} via eSewa
                        </div>
                        {#if order.esewaTransactionCode}
                          <div class="text-muted-foreground">eSewa Tx: <span class="font-mono font-bold">{order.esewaTransactionCode}</span></div>
                        {/if}
                        {#if order.refundEsewaId}
                          <div class="text-muted-foreground">Customer eSewa: <span class="font-semibold">{order.refundEsewaId}</span></div>
                        {/if}
                        <div class="text-muted-foreground">
                          Status: <span class="font-semibold {order.refundStatus === 'sent' ? 'text-green-600' : 'text-orange-600'}">
                            {order.refundStatus === 'sent' ? '✓ Refund Sent' : '⏳ Refund Pending'}
                          </span>
                        </div>
                      </div>
                    {/if}

                    <p class="text-sm font-bold text-foreground mt-2">Rs. {order.totalAmount?.toFixed(2)}</p>
                  </div>

                  <!-- Action buttons -->
                  <div class="flex flex-col gap-2 flex-shrink-0">

                    <!-- Advance status button -->
                    {#if nextStatus[order.status]}
                      <button
                        class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                        style="background-color: #FF6B35;"
                        on:click={() => updateOrderStatus(order, nextStatus[order.status])}
                      >
                        {nextStatusLabel[order.status]}
                      </button>
                    {/if}

                    <!-- Cancel button — only when order is still active -->
                    {#if isCancellable(order)}
                      <button
                        class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                          {isPaid
                            ? 'border-orange-300 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20'
                            : 'border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20'}"
                        on:click={() => initCancel(order)}
                      >
                        {isPaid ? '⚠ Cancel & Refund' : 'Cancel'}
                      </button>
                    {/if}

                    <!-- Mark refund sent (for cancelled eSewa orders with pending refund) -->
                    {#if order.status === 'cancelled' && isPaid && order.refundStatus === 'pending'}
                      <button
                        class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                        style="background-color: #16a34a;"
                        on:click={() => markRefundSent(order)}
                      >
                        ✓ Mark Refund Sent
                      </button>
                    {/if}

                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Income Graph -->
      <div class="bg-card border border-border rounded-2xl overflow-hidden">
        <div class="px-5 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <div class="flex items-center gap-2">
            <TrendingUp class="w-4 h-4" style="color: #FF6B35;" />
            <h2 class="font-bold text-foreground">Income</h2>
            <span class="text-xs text-muted-foreground">(delivered orders only)</span>
          </div>
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

        <div class="px-5 pb-5 pt-2">
          {#if loading}
            <div class="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
          {:else if totalIncome === 0}
            <div class="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <TrendingUp class="w-8 h-8 opacity-30" />
              <p class="text-sm">No income in this period yet</p>
            </div>
          {:else}
            <div class="flex gap-2 items-end" style="height: 160px;">
              <div class="flex flex-col justify-between h-full text-right pr-2 flex-shrink-0" style="width:52px">
                <span class="text-[10px] text-muted-foreground">Rs.{maxIncome.toFixed(0)}</span>
                <span class="text-[10px] text-muted-foreground">Rs.{(maxIncome/2).toFixed(0)}</span>
                <span class="text-[10px] text-muted-foreground">0</span>
              </div>

              <div class="flex-1 flex items-end gap-[3px] h-full relative">
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
                    <div
                      class="w-full rounded-t-md transition-all duration-300 group-hover:opacity-80"
                      style="
                        height: {Math.max(heightPct, bar.amount > 0 ? 4 : 0)}%;
                        background-color: {isToday ? '#FF6B35' : '#FF6B3560'};
                        min-height: {bar.amount > 0 ? '4px' : '0'};
                      "
                    ></div>

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
            <div class="h-6"></div>
          {/if}
        </div>
      </div>

    </div>
  </main>
</div>