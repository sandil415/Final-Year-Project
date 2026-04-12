<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import {
    ArrowLeftIcon,
    ChartLineUpIcon,
    CurrencyCircleDollarIcon,
    ShoppingBagIcon,
    TrendUpIcon,
    TrendDownIcon,
    StarIcon,
    HeartIcon,
    ForkKnifeIcon,
    CalendarBlankIcon,
    WarningCircleIcon,
  } from 'phosphor-svelte';

  let user        = null;
  let loading     = true;
  let rangeKey    = '30';
  let chartsReady = false;

  let allOrders = [];
  let allPosts  = [];
  let menuItems = [];

  let revenueData     = { labels: [], revenues: [], orderCounts: [] };
  let bestSellers     = [];
  let statusBreakdown = [];
  let engagementData  = { labels: [], likes: [], comments: [] };
  let kpis            = { revenue: 0, orders: 0, avgOrder: 0, completion: 0, cancelRate: 0, totalLikes: 0, totalPosts: 0 };
  let prevKpis        = { revenue: 0, orders: 0 };

  let chartRevenue, chartSellers, chartStatus, chartEngagement;

  const RANGES = [
    { key: '7',  label: 'Last 7 days'  },
    { key: '30', label: 'Last 30 days' },
    { key: '90', label: 'Last 90 days' },
  ];

  const STATUS_COLORS = {
    pending:   '#F59E0B',
    confirmed: '#3B82F6',
    preparing: '#8B5CF6',
    ready:     '#10B981',
    delivered: '#22C55E',
    cancelled: '#EF4444',
  };

  onMount(async () => {
    requireAuth();
    user = pb.authStore.record ?? pb.authStore.model;
    if (user?.accountType !== 'business') { goto('/profile'); return; }
    await fetchAndCompute();
    loading = false;
  });

  async function fetchAndCompute() {
    chartsReady = false;
    const days = parseInt(rangeKey);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);

    const cutoff2 = new Date();
    cutoff2.setDate(cutoff2.getDate() - days * 2);
    cutoff2.setHours(0, 0, 0, 0);

    try {
      const [allOrdersRes, postsRes, menuRes] = await Promise.all([
        pb.collection('orders').getFullList({
          filter: `seller.id = "${user.id}"`,
          sort: 'created',
        }).catch(() => []),
        pb.collection('posts').getFullList({
          filter: `user = "${user.id}"`,
          sort: '-created',
          fields: 'id,created',
        }).catch(() => []),
        pb.collection('menuItems').getFullList({
          filter: `seller = "${user.id}"`,
          fields: 'id,name,isAvailable,category,price',
        }).catch(() => []),
      ]);

      // Filter by date in JS — avoids PocketBase dot-notation + date filter bug
      allOrders = allOrdersRes.filter(o => new Date(o.created) >= cutoff);
      const prevOrdersRes = allOrdersRes.filter(o => {
        const d = new Date(o.created);
        return d >= cutoff2 && d < cutoff;
      });

      menuItems = menuRes;

      if (postsRes.length) {
        const withStats = await Promise.all(
          postsRes.slice(0, 20).map(async p => {
            try {
              const [l, c] = await Promise.all([
                pb.collection('likes').getList(1, 1, { filter: `post = "${p.id}"` }),
                pb.collection('comments').getList(1, 1, { filter: `post = "${p.id}"` }),
              ]);
              return { ...p, _likes: l.totalItems, _comments: c.totalItems };
            } catch { return { ...p, _likes: 0, _comments: 0 }; }
          })
        );
        allPosts = withStats;
      } else {
        allPosts = [];
      }

      const prevRev    = prevOrdersRes
        .filter(o => o.status === 'delivered')
        .reduce((s, o) => s + (o.totalAmount || 0), 0);
      const prevOrders = prevOrdersRes.length;
      prevKpis = { revenue: prevRev, orders: prevOrders };

      compute(days);
      setTimeout(drawAllCharts, 80);
    } catch (err) {
      console.error('[Analytics]', err);
    }
  }

  async function changeRange(key) {
    if (key === rangeKey) return;
    rangeKey = key;
    loading  = true;
    destroyCharts();
    await fetchAndCompute();
    loading = false;
  }

  function compute(days) {
    const delivered = allOrders.filter(o => o.status === 'delivered');
    const cancelled = allOrders.filter(o => o.status === 'cancelled');
    const revenue   = delivered.reduce((s, o) => s + (o.totalAmount || 0), 0);

    kpis = {
      revenue,
      orders:     allOrders.length,
      avgOrder:   delivered.length ? revenue / delivered.length : 0,
      completion: allOrders.length ? Math.round(delivered.length / allOrders.length * 100) : 0,
      cancelRate: allOrders.length ? Math.round(cancelled.length / allOrders.length * 100) : 0,
      totalLikes: allPosts.reduce((s, p) => s + (p._likes || 0), 0),
      totalPosts: allPosts.length,
    };

    computeRevenue(days);
    computeBestSellers();
    computeStatus();
    computeEngagement(days);
  }

  function computeRevenue(days) {
    const bucketSize = days <= 7 ? 1 : days <= 30 ? 1 : 3;
    const buckets    = [];
    const now        = new Date();

    for (let i = days - 1; i >= 0; i -= bucketSize) {
      const labelDate = new Date(now);
      labelDate.setDate(now.getDate() - i);

      const fromDate = new Date(now);
      fromDate.setDate(now.getDate() - i - bucketSize + 1);
      fromDate.setHours(0, 0, 0, 0);

      const toDate = new Date(now);
      toDate.setDate(now.getDate() - i + 1);
      toDate.setHours(0, 0, 0, 0);

      buckets.push({
        label:      labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        from:       fromDate,
        to:         toDate,
        revenue:    0,
        orderCount: 0,
      });
    }

    for (const o of allOrders) {
      if (o.status === 'cancelled') continue;
      const od = new Date(o.created);
      const b  = buckets.find(b => od >= b.from && od < b.to);
      if (b) { b.revenue += o.totalAmount || 0; b.orderCount += 1; }
    }

    revenueData = {
      labels:      buckets.map(b => b.label),
      revenues:    buckets.map(b => Math.round(b.revenue)),
      orderCounts: buckets.map(b => b.orderCount),
    };
  }

  function computeBestSellers() {
    const tally = {};
    for (const o of allOrders) {
      if (o.status === 'cancelled') continue;
      for (const item of (o.items || [])) {
        const k = item.name || 'Unknown';
        if (!tally[k]) tally[k] = { name: k, qty: 0, revenue: 0 };
        tally[k].qty     += item.quantity || 1;
        tally[k].revenue += (item.effectivePrice ?? item.basePrice ?? 0) * (item.quantity || 1);
      }
    }
    const sorted = Object.values(tally).sort((a, b) => b.qty - a.qty).slice(0, 7);
    const maxQty = sorted[0]?.qty || 1;
    bestSellers  = sorted.map(s => ({ ...s, pct: Math.round(s.qty / maxQty * 100) }));
  }

  function computeStatus() {
    const counts = {};
    for (const o of allOrders) counts[o.status] = (counts[o.status] || 0) + 1;
    const total = allOrders.length || 1;
    statusBreakdown = Object.entries(counts)
      .map(([status, count]) => ({
        status,
        count,
        pct:   Math.round(count / total * 100),
        color: STATUS_COLORS[status] || '#888',
      }))
      .sort((a, b) => b.count - a.count);
  }

  function computeEngagement(days) {
    if (!allPosts.length) { engagementData = { labels: [], likes: [], comments: [] }; return; }

    const bSize = days <= 7 ? 1 : days <= 30 ? 7 : 14;
    const n     = Math.ceil(days / bSize);
    const now   = new Date();

    const buckets = Array.from({ length: n }, (_, i) => {
      const labelDate = new Date(now);
      labelDate.setDate(now.getDate() - (n - 1 - i) * bSize);

      const fromDate = new Date(now);
      fromDate.setDate(now.getDate() - (n - i) * bSize);
      fromDate.setHours(0, 0, 0, 0);

      const toDate = new Date(now);
      toDate.setDate(now.getDate() - (n - 1 - i) * bSize);
      toDate.setHours(0, 0, 0, 0);

      return {
        label:    labelDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        from:     fromDate,
        to:       toDate,
        likes:    0,
        comments: 0,
      };
    });

    for (const p of allPosts) {
      const pd = new Date(p.created);
      const b  = buckets.find(b => pd >= b.from && pd < b.to);
      if (b) { b.likes += p._likes || 0; b.comments += p._comments || 0; }
    }

    engagementData = {
      labels:   buckets.map(b => b.label),
      likes:    buckets.map(b => b.likes),
      comments: buckets.map(b => b.comments),
    };
  }

  function destroyCharts() {
    [chartRevenue, chartSellers, chartStatus, chartEngagement].forEach(c => {
      try { c?.destroy(); } catch (_) {}
    });
    chartRevenue = chartSellers = chartStatus = chartEngagement = null;
  }

  function getThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      || (!document.documentElement.getAttribute('data-theme')
          && window.matchMedia('(prefers-color-scheme: dark)').matches);
    return {
      text:   isDark ? '#9CA3AF' : '#6B7280',
      grid:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    };
  }

  function drawAllCharts() {
    if (typeof Chart === 'undefined') return;
    destroyCharts();
    const t = getThemeColors();

    const rCanvas = document.getElementById('chart-revenue');
    if (rCanvas && revenueData.labels.length) {
      chartRevenue = new Chart(rCanvas, {
        type: 'line',
        data: {
          labels: revenueData.labels,
          datasets: [
            {
              label: 'Revenue (Rs.)',
              data:  revenueData.revenues,
              borderColor: '#FF6B35',
              backgroundColor: 'rgba(255,107,53,0.08)',
              borderWidth: 2,
              pointBackgroundColor: '#FF6B35',
              pointRadius: revenueData.labels.length > 20 ? 0 : 3,
              pointHoverRadius: 5,
              fill: true,
              tension: 0.4,
              yAxisID: 'yRev',
            },
            {
              label: 'Orders',
              data:  revenueData.orderCounts,
              borderColor: '#8B5CF6',
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              borderDash: [4, 4],
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: 0.4,
              yAxisID: 'yOrders',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ctx.datasetIndex === 0
                  ? `Revenue: Rs.${ctx.parsed.y.toLocaleString()}`
                  : `Orders: ${ctx.parsed.y}`,
              },
            },
          },
          scales: {
            x: {
              ticks: { color: t.text, font: { size: 11 }, maxTicksLimit: 10, maxRotation: 0 },
              grid:  { color: t.grid },
              border: { color: t.border },
            },
            yRev: {
              position: 'left',
              min: 0,
              ticks: {
                color: t.text,
                font: { size: 11 },
                callback: v => 'Rs.' + v.toLocaleString(),
              },
              grid:   { color: t.grid },
              border: { color: t.border },
            },
            yOrders: {
              position: 'right',
              min: 0,
              ticks: { color: '#8B5CF6', font: { size: 11 }, stepSize: 1 },
              grid:   { drawOnChartArea: false },
              border: { color: t.border },
            },
          },
        },
      });
    }

    const sCanvas = document.getElementById('chart-sellers');
    if (sCanvas && bestSellers.length) {
      chartSellers = new Chart(sCanvas, {
        type: 'bar',
        data: {
          labels: bestSellers.map(s => s.name),
          datasets: [{
            label: 'Quantity sold',
            data:  bestSellers.map(s => s.qty),
            backgroundColor: bestSellers.map((_, i) =>
              i === 0 ? '#FF6B35' : `rgba(255,107,53,${0.7 - i * 0.08})`
            ),
            borderRadius: 6,
            borderSkipped: false,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterLabel: ctx => `Revenue: Rs.${Math.round(bestSellers[ctx.dataIndex]?.revenue || 0).toLocaleString()}`,
              },
            },
          },
          scales: {
            x: {
              min: 0,
              ticks: { color: t.text, font: { size: 11 }, stepSize: 1 },
              grid:  { color: t.grid },
              border: { color: t.border },
            },
            y: {
              ticks: {
                color: t.text,
                font: { size: 11 },
                callback: v => v.length > 18 ? v.slice(0, 16) + '…' : v,
              },
              grid:   { display: false },
              border: { color: t.border },
            },
          },
        },
      });
    }

    const dCanvas = document.getElementById('chart-status');
    if (dCanvas && statusBreakdown.length) {
      chartStatus = new Chart(dCanvas, {
        type: 'doughnut',
        data: {
          labels: statusBreakdown.map(s => s.status),
          datasets: [{
            data:            statusBreakdown.map(s => s.count),
            backgroundColor: statusBreakdown.map(s => s.color),
            borderColor:     statusBreakdown.map(s => s.color + '33'),
            borderWidth: 2,
            hoverOffset: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.label}: ${ctx.parsed} (${statusBreakdown[ctx.dataIndex]?.pct}%)`,
              },
            },
          },
        },
      });
    }

    const eCanvas = document.getElementById('chart-engagement');
    if (eCanvas && engagementData.labels.length) {
      chartEngagement = new Chart(eCanvas, {
        type: 'bar',
        data: {
          labels: engagementData.labels,
          datasets: [
            {
              label: 'Likes',
              data:  engagementData.likes,
              backgroundColor: 'rgba(239,68,68,0.7)',
              borderRadius: 4,
              borderSkipped: false,
            },
            {
              label: 'Comments',
              data:  engagementData.comments,
              backgroundColor: 'rgba(59,130,246,0.7)',
              borderRadius: 4,
              borderSkipped: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: { color: t.text, font: { size: 11 }, maxTicksLimit: 8, maxRotation: 0 },
              grid:  { display: false },
              border: { color: t.border },
            },
            y: {
              min: 0,
              ticks: { color: t.text, font: { size: 11 }, stepSize: 1 },
              grid:  { color: t.grid },
              border: { color: t.border },
            },
          },
        },
      });
    }

    chartsReady = true;
  }

  function delta(cur, prev) {
    if (!prev) return null;
    const pct = Math.round(((cur - prev) / prev) * 100);
    return { pct, up: pct >= 0 };
  }

  $: revDelta    = delta(kpis.revenue, prevKpis.revenue);
  $: orderDelta  = delta(kpis.orders,  prevKpis.orders);
  $: todayOrders = allOrders.filter(o => new Date(o.created).toDateString() === new Date().toDateString()).length;
  $: todayRev    = allOrders
      .filter(o => o.status === 'delivered' && new Date(o.created).toDateString() === new Date().toDateString())
      .reduce((s, o) => s + (o.totalAmount || 0), 0);
</script>

<svelte:head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" on:load={drawAllCharts}></script>
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
  <Header />

  <main class="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

    <!-- PAGE HEADER -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <button
          class="p-2 rounded-xl border border-border hover:bg-muted transition-colors"
          on:click={() => goto('/business/dashboard')}
        >
          <ArrowLeftIcon size={18} />
        </button>
        <div>
          <div class="flex items-center gap-2">
            <ChartLineUpIcon size={16} weight="fill" style="color:#FF6B35;" />
            <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Analytics</span>
          </div>
          <h1 class="text-xl font-bold">{user?.businessName || 'My Business'}</h1>
        </div>
      </div>

      <div class="flex items-center gap-1 bg-muted rounded-xl p-1">
        {#each RANGES as r}
          <button
            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={rangeKey === r.key
              ? 'background:#FF6B35;color:white;'
              : 'color:hsl(var(--muted-foreground));'}
            on:click={() => changeRange(r.key)}
          >
            {r.label}
          </button>
        {/each}
      </div>
    </div>

    {#if loading}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {#each Array(4) as _}
          <div class="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div class="skeleton h-3 w-20 rounded"></div>
            <div class="skeleton h-7 w-28 rounded"></div>
            <div class="skeleton h-2.5 w-16 rounded"></div>
          </div>
        {/each}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
          <div class="skeleton h-4 w-32 rounded mb-4"></div>
          <div class="skeleton rounded-xl" style="height:220px;"></div>
        </div>
        <div class="bg-card border border-border rounded-2xl p-5">
          <div class="skeleton h-4 w-28 rounded mb-4"></div>
          <div class="skeleton rounded-full mx-auto" style="width:160px;height:160px;"></div>
        </div>
      </div>

    {:else}

      <!-- KPI CARDS -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">

        <div class="bg-card border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-muted-foreground">Revenue</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#FF6B3515;">
              <CurrencyCircleDollarIcon size={15} weight="duotone" style="color:#FF6B35;" />
            </div>
          </div>
          <p class="text-2xl font-bold">Rs.{Math.round(kpis.revenue).toLocaleString()}</p>
          {#if revDelta}
            <div class="flex items-center gap-1 mt-1">
              {#if revDelta.up}
                <TrendUpIcon size={12} style="color:#10B981;" />
                <span class="text-xs font-medium" style="color:#10B981;">+{revDelta.pct}% vs prev</span>
              {:else}
                <TrendDownIcon size={12} style="color:#EF4444;" />
                <span class="text-xs font-medium" style="color:#EF4444;">{revDelta.pct}% vs prev</span>
              {/if}
            </div>
          {:else}
            <span class="text-xs text-muted-foreground">delivered orders</span>
          {/if}
        </div>

        <div class="bg-card border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-muted-foreground">Orders</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#8B5CF615;">
              <ShoppingBagIcon size={15} weight="duotone" style="color:#8B5CF6;" />
            </div>
          </div>
          <p class="text-2xl font-bold">{kpis.orders}</p>
          {#if orderDelta}
            <div class="flex items-center gap-1 mt-1">
              {#if orderDelta.up}
                <TrendUpIcon size={12} style="color:#10B981;" />
                <span class="text-xs font-medium" style="color:#10B981;">+{orderDelta.pct}% vs prev</span>
              {:else}
                <TrendDownIcon size={12} style="color:#EF4444;" />
                <span class="text-xs font-medium" style="color:#EF4444;">{orderDelta.pct}% vs prev</span>
              {/if}
            </div>
          {:else}
            <span class="text-xs text-muted-foreground">{todayOrders} today</span>
          {/if}
        </div>

        <div class="bg-card border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-muted-foreground">Avg Order</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#10B98115;">
              <StarIcon size={15} weight="duotone" style="color:#10B981;" />
            </div>
          </div>
          <p class="text-2xl font-bold">Rs.{Math.round(kpis.avgOrder)}</p>
          <span class="text-xs text-muted-foreground">{kpis.completion}% completion rate</span>
        </div>

        <div class="bg-card border border-border rounded-2xl p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-medium text-muted-foreground">Today</span>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:#3B82F615;">
              <CalendarBlankIcon size={15} weight="duotone" style="color:#3B82F6;" />
            </div>
          </div>
          <p class="text-2xl font-bold">Rs.{Math.round(todayRev).toLocaleString()}</p>
          <span class="text-xs text-muted-foreground">{todayOrders} orders today</span>
        </div>

      </div>

      <!-- REVENUE CHART + STATUS DONUT -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <div class="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="font-bold text-sm">Revenue over time</h2>
              <p class="text-xs text-muted-foreground">Excludes cancelled orders</p>
            </div>
            <div class="flex items-center gap-4 text-xs text-muted-foreground">
              <span class="flex items-center gap-1.5">
                <span class="inline-block w-3 h-0.5 rounded" style="background:#FF6B35;"></span>
                Revenue
              </span>
              <span class="flex items-center gap-1.5">
                <span class="inline-block w-3 h-0.5 rounded" style="background:#8B5CF6;"></span>
                Orders
              </span>
            </div>
          </div>
          <div style="position:relative;height:220px;">
            {#if revenueData.labels.length}
              <canvas id="chart-revenue"></canvas>
            {:else}
              <div class="flex items-center justify-center h-full text-sm text-muted-foreground">No order data for this period</div>
            {/if}
          </div>
        </div>

        <div class="bg-card border border-border rounded-2xl p-5">
          <div class="mb-4">
            <h2 class="font-bold text-sm">Order status</h2>
            <p class="text-xs text-muted-foreground">{allOrders.length} total orders</p>
          </div>
          {#if statusBreakdown.length}
            <div style="position:relative;height:160px;" class="mb-4">
              <canvas id="chart-status"></canvas>
            </div>
            <div class="space-y-2">
              {#each statusBreakdown as s}
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:{s.color};"></span>
                    <span class="text-xs capitalize text-foreground">{s.status}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold">{s.count}</span>
                    <span class="text-[10px] text-muted-foreground w-8 text-right">{s.pct}%</span>
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="flex items-center justify-center h-40 text-sm text-muted-foreground">No orders yet</div>
          {/if}
        </div>

      </div>

      <!-- BEST SELLERS -->
      <div class="bg-card border border-border rounded-2xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-bold text-sm">Best selling items</h2>
            <p class="text-xs text-muted-foreground">By quantity sold — hover for revenue</p>
          </div>
          {#if bestSellers[0]}
            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold" style="background:#FF6B3515;color:#FF6B35;">
              <StarIcon size={12} weight="fill" />
              #1 {bestSellers[0].name}
            </div>
          {/if}
        </div>
        {#if bestSellers.length}
          <div style="position:relative;height:{Math.max(bestSellers.length * 42 + 20, 160)}px;">
            <canvas id="chart-sellers"></canvas>
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <ForkKnifeIcon size={32} weight="duotone" class="text-muted-foreground mb-2" />
            <p class="text-sm text-muted-foreground">No item sales data yet</p>
          </div>
        {/if}
      </div>

      <!-- ENGAGEMENT + MENU -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div class="bg-card border border-border rounded-2xl p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="font-bold text-sm">Content engagement</h2>
              <p class="text-xs text-muted-foreground">{kpis.totalPosts} posts · {kpis.totalLikes} total likes</p>
            </div>
            <div class="flex items-center gap-3 text-xs text-muted-foreground">
              <span class="flex items-center gap-1">
                <span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:rgba(239,68,68,0.7);"></span>
                Likes
              </span>
              <span class="flex items-center gap-1">
                <span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:rgba(59,130,246,0.7);"></span>
                Comments
              </span>
            </div>
          </div>
          {#if engagementData.labels.length && kpis.totalPosts > 0}
            <div style="position:relative;height:180px;">
              <canvas id="chart-engagement"></canvas>
            </div>
          {:else}
            <div class="flex flex-col items-center justify-center py-10 text-center">
              <HeartIcon size={28} weight="duotone" class="text-muted-foreground mb-2" />
              <p class="text-sm text-muted-foreground">No post data available</p>
              <button
                class="mt-3 text-xs font-semibold hover:opacity-70"
                style="color:#FF6B35;"
                on:click={() => goto('/create')}
              >Create your first post →</button>
            </div>
          {/if}
        </div>

        <div class="bg-card border border-border rounded-2xl p-5">
          <div class="mb-4">
            <h2 class="font-bold text-sm">Menu overview</h2>
            <p class="text-xs text-muted-foreground">{menuItems.length} items total</p>
          </div>
          {#if menuItems.length}
            {@const avail    = menuItems.filter(m => m.isAvailable).length}
            {@const unavail  = menuItems.length - avail}
            {@const availPct = Math.round(avail / menuItems.length * 100)}
            <div class="mb-5">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs text-muted-foreground">Available items</span>
                <span class="text-xs font-semibold">{avail} / {menuItems.length}</span>
              </div>
              <div class="w-full bg-muted rounded-full h-2">
                <div class="h-2 rounded-full transition-all" style="width:{availPct}%;background:#10B981;"></div>
              </div>
              <div class="flex justify-between mt-1">
                <span class="text-[10px] text-muted-foreground">{availPct}% available</span>
                {#if unavail > 0}
                  <span class="text-[10px]" style="color:#EF4444;">{unavail} unavailable</span>
                {/if}
              </div>
            </div>
            {@const catGroups = menuItems.reduce((acc, m) => {
              const c = m.category || 'Other';
              acc[c] = (acc[c] || 0) + 1;
              return acc;
            }, {})}
            {@const cats = Object.entries(catGroups).sort((a, b) => b[1] - a[1]).slice(0, 5)}
            <div class="space-y-2.5">
              {#each cats as [cat, count]}
                {@const pct = Math.round(count / menuItems.length * 100)}
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs text-foreground">{cat}</span>
                    <span class="text-xs text-muted-foreground">{count} items</span>
                  </div>
                  <div class="w-full bg-muted rounded-full h-1.5">
                    <div class="h-1.5 rounded-full" style="width:{pct}%;background:#FF6B35;opacity:{0.4 + pct / 100 * 0.6};"></div>
                  </div>
                </div>
              {/each}
            </div>
            <button
              class="mt-4 w-full py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors"
              on:click={() => goto('/business/menu')}
            >Manage menu →</button>
          {:else}
            <div class="flex flex-col items-center justify-center py-10 text-center">
              <ForkKnifeIcon size={28} weight="duotone" class="text-muted-foreground mb-2" />
              <p class="text-sm text-muted-foreground">No menu items yet</p>
              <button
                class="mt-3 text-xs font-semibold hover:opacity-70"
                style="color:#FF6B35;"
                on:click={() => goto('/business/menu')}
              >Add your first item →</button>
            </div>
          {/if}
        </div>

      </div>

      <!-- CANCEL RATE WARNING -->
      {#if kpis.cancelRate >= 20}
        <div class="flex items-start gap-3 p-4 rounded-2xl border" style="background:#FEF3C7;border-color:#F59E0B30;">
          <WarningCircleIcon size={20} weight="fill" style="color:#F59E0B;flex-shrink:0;margin-top:1px;" />
          <div>
            <p class="text-sm font-semibold" style="color:#92400E;">High cancellation rate ({kpis.cancelRate}%)</p>
            <p class="text-xs mt-0.5" style="color:#92400E;">Consider reviewing your preparation times or item availability to reduce cancellations.</p>
          </div>
        </div>
      {/if}

    {/if}

  </main>
</div>

<style>
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