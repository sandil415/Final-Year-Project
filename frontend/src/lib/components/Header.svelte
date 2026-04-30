<script>
import { goto } from "$app/navigation";
import { page } from "$app/stores";
import { BellIcon, ShoppingBagIcon, ArrowLeftIcon, ShoppingCartIcon } from "phosphor-svelte";
import { onMount, onDestroy } from "svelte";
import pb from '$lib/pocketbase';
import { Heart, MessageCircle, UserPlus, Bell, X } from 'lucide-svelte';
import { cartItems, cartCount, cartTotal } from '$lib/stores/cart';
import { showCartDrawer } from '$lib/stores/ui';

let mobileMenuOpen = false;
let notificationPanelOpen = false;
let cartPanelOpen = false;
let notifications = [];
let unreadCount = 0;
let loading = false;
let currentUser = null;
let unsubscribe = null;

  $: currentPath = $page.url.pathname;
  $: isBusiness = currentUser?.accountType === 'business';
  $: isCheckoutPage = currentPath === '/checkout';

  $: navLinks = [
    { href: '/home', label: 'Home' },
    { href: '/search', label: 'Search' },
    isBusiness
      ? { href: '/business/dashboard', label: 'Dashboard', highlight: true }
      : { href: '/dashboard', label: 'Dashboard', highlight: true },
    { href: '/messages', label: 'Messages' },
  ];

  function isActive(href) {
    if (href === '/home') return currentPath === '/home' || currentPath === '/';
    return currentPath.startsWith(href);
  }

  onMount(async () => {
    currentUser = pb.authStore.model;
    if (currentUser) {
      await fetchUnreadCount();
      subscribeToNotifications();
    }
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });

  async function fetchUnreadCount() {
    try {
      const result = await pb.collection('notifications').getList(1, 1, {
        filter: `user = "${currentUser.id}" && read = false`,
      });
      unreadCount = result.totalItems;
    } catch (e) {}
  }

  async function loadNotifications() {
    if (!currentUser) return;
    loading = true;
    try {
      const result = await pb.collection('notifications').getList(1, 20, {
        filter: `user = "${currentUser.id}"`,
        sort: '-created',
        expand: 'triggeredBy,post'
      });
      notifications = result.items;
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  function subscribeToNotifications() {
    try {
      pb.collection('notifications').subscribe('*', (e) => {
        if (e.record.user === currentUser.id) {
          fetchUnreadCount();
          if (notificationPanelOpen) loadNotifications();
        }
      }).then(unsub => { unsubscribe = unsub; });
    } catch (e) {}
  }

  async function toggleNotificationPanel() {
    notificationPanelOpen = !notificationPanelOpen;
    if (notificationPanelOpen) await loadNotifications();
  }

  async function markAllAsRead() {
    try {
      const unread = notifications.filter(n => !n.read);
      await Promise.all(unread.map(n => pb.collection('notifications').update(n.id, { read: true })));
      notifications = notifications.map(n => ({ ...n, read: true }));
      unreadCount = 0;
    } catch (e) {}
  }

  async function handleNotificationClick(notification) {
    if (!notification.read) {
      await pb.collection('notifications').update(notification.id, { read: true });
      notifications = notifications.map(n => n.id === notification.id ? { ...n, read: true } : n);
      unreadCount = Math.max(0, unreadCount - 1);
    }
    notificationPanelOpen = false;
    if (notification.type === 'follow' && notification.expand?.triggeredBy) {
      goto(`/profile/${notification.expand.triggeredBy.username}`);
    } else if (['like', 'comment'].includes(notification.type) && notification.expand?.triggeredBy) {
      goto(`/profile/${notification.expand.triggeredBy.username}`);
    } else if (notification.type === 'message' && notification.relatedConversation) {
      goto(`/messages/${notification.relatedConversation}`);
    }
  }

  function getNotificationIcon(type) {
    switch (type) {
      case 'like': return Heart;
      case 'comment': return MessageCircle;
      case 'follow': return UserPlus;
      case 'message': return MessageCircle;
      default: return Bell;
    }
  }

  function getIconColor(type) {
    switch (type) {
      case 'like': return 'text-red-500 bg-red-500/10';
      case 'comment': return 'text-blue-500 bg-blue-500/10';
      case 'follow': return 'text-green-500 bg-green-500/10';
      case 'message': return 'text-purple-500 bg-purple-500/10';
      default: return 'text-muted-foreground bg-muted';
    }
  }

  function getMessage(notification) {
    switch (notification.type) {
      case 'follow': return 'started following you';
      case 'like': return 'liked your post';
      case 'comment': return 'commented on your post';
      case 'message': return 'sent you a message';
      default: return notification.message || 'New notification';
    }
  }

  function timeAgo(dateString) {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateString).toLocaleDateString();
  }

  function closePanel() { notificationPanelOpen = false; }

  function goToCheckout() {
    cartPanelOpen = false;
    goto('/checkout');
  }
</script>

{#if notificationPanelOpen}
  <div class="fixed inset-0 z-40" on:click={closePanel} role="presentation"></div>
{/if}
{#if cartPanelOpen}
  <div class="fixed inset-0 z-40" on:click={() => cartPanelOpen = false} role="presentation"></div>
{/if}

<nav class="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
  <div class="max-w-7xl mx-auto px-6 py-4">
    <div class="flex items-center justify-between">

      <!-- Left: back arrow (checkout page) or logo -->
      <div class="flex items-center gap-3">
        {#if isCheckoutPage}
          <button
            class="p-2 hover:bg-muted rounded-xl border border-border transition-colors"
            on:click={() => history.back()}
            aria-label="Back"
          >
            <ArrowLeftIcon size={18} />
          </button>
        {/if}
        <button class="flex flex-col items-start" on:click={() => goto('/home')}>
          <h1 class="text-2xl font-bold tracking-tight text-foreground">FIESTRA</h1>
          <span class="text-xs font-medium tracking-wider" style="color: #FF6B35;">Explore Nepali Cuisines with Us</span>
        </button>
      </div>

      <!-- Desktop Nav -->
      <div class="hidden md:flex items-center gap-8">
        {#each navLinks as link}
          <a
            href={link.href}
            class="text-sm font-medium transition-colors relative group {isActive(link.href) ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}"
          >
            {#if link.highlight && isBusiness}
              <span class="flex items-center gap-1.5" style={isActive(link.href) ? 'color: #FF6B35;' : ''}>
                {link.label}
              </span>
            {:else}
              {link.label}
            {/if}
            <span
              class="absolute -bottom-1 left-0 h-0.5 transition-[width] duration-300 {isActive(link.href) ? 'w-full' : 'w-0 group-hover:w-full'}"
              style="background-color: #FF6B35;"
            ></span>
          </a>
        {/each}

        <a
          href="/create"
          class="px-5 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-all hover:shadow-lg text-white"
          style="background-color: #FF6B35;"
        >
          <span class="text-xl font-light">+</span>
          Create
        </a>
        {#if currentUser && !isBusiness}
          <button
            class="px-4 py-2 rounded-full text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
            on:click={() => goto('/profile/edit')}
          >
            Become a seller
          </button>
        {/if}
      </div>

      <!-- Right Icons -->
      <div class="flex items-center gap-4">

        <!-- Cart -->
        <div class="relative">
          <button
            class="relative p-2 hover:bg-secondary rounded-full transition-colors"
            on:click={() => cartPanelOpen = !cartPanelOpen}
          >
            <ShoppingBagIcon class="w-6 h-6"/>
            {#if $cartCount > 0}
              <span class="absolute -top-1 -right-1 w-5 h-5 text-xs rounded-full flex items-center justify-center font-bold text-white" style="background-color: #FF6B35;">
                {$cartCount > 99 ? '99+' : $cartCount}
              </span>
            {/if}
          </button>

          {#if cartPanelOpen}
            <div class="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-background border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
              <div class="px-5 py-3 border-b border-border flex items-center justify-between">
                <span class="text-sm font-semibold">Cart · {$cartCount} item{$cartCount !== 1 ? 's' : ''}</span>
                <button class="p-1 hover:bg-secondary rounded-full" on:click={() => cartPanelOpen = false}>
                  <X class="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div class="max-h-64 overflow-y-auto">
                {#if $cartItems.length === 0}
                  <div class="py-8 px-5 text-center">
                    <div class="text-3xl mb-2 flex justify-center">
                      <ShoppingCartIcon />
                    </div>
                    <p class="text-sm text-muted-foreground">Your cart is empty.</p>
                  </div>
                {:else}
                  <div class="py-3 px-4 space-y-2">
                    {#each $cartItems as entry}
                      <div class="flex items-center justify-between gap-3 text-sm">
                        <div class="flex-1 min-w-0">
                          <p class="font-medium truncate">{entry.item.name}</p>
                          {#if entry.selectionLabel}
                            <p class="text-[11px] text-muted-foreground truncate">{entry.selectionLabel}</p>
                          {/if}
                          <p class="text-xs text-muted-foreground">× {entry.quantity}</p>
                        </div>
                        <span class="text-xs font-semibold text-muted-foreground flex-shrink-0">
                          Rs. {((entry.effectivePrice ?? entry.item.price) * entry.quantity).toFixed(0)}
                        </span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

              {#if $cartItems.length > 0}
                <div class="px-4 py-3 border-t border-border space-y-2">
                  <!-- Subtotal row -->
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-muted-foreground">Subtotal</span>
                    <span class="font-bold">Rs. {$cartTotal.toFixed(2)}</span>
                  </div>
                  <!-- Checkout CTA -->
                  <button
                    class="w-full py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                    style="background-color: #FF6B35;"
                    on:click={goToCheckout}
                  >
                    Checkout →
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Notifications -->
        <div class="relative">
          <button
            class="relative p-2 hover:bg-secondary rounded-full transition-colors {notificationPanelOpen ? 'bg-secondary' : ''}"
            on:click={toggleNotificationPanel}
          >
            <BellIcon class="w-6 h-6"/>
            {#if unreadCount > 0}
              <span class="absolute -top-1 -right-1 w-5 h-5 text-xs rounded-full flex items-center justify-center font-bold text-white" style="background-color: #FF6B35;">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            {/if}
          </button>

          {#if notificationPanelOpen}
            <div class="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-background border border-border rounded-2xl shadow-2xl z-50 overflow-hidden" style="max-height: min(520px, calc(100vh - 100px));">
              <div class="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <h2 class="text-lg font-bold">Notifications</h2>
                  {#if unreadCount > 0}
                    <span class="px-2 py-0.5 text-xs font-bold rounded-full text-white" style="background-color: #FF6B35;">{unreadCount}</span>
                  {/if}
                </div>
                <div class="flex items-center gap-3">
                  {#if unreadCount > 0}
                    <button on:click={markAllAsRead} class="text-xs font-semibold hover:opacity-70" style="color: #FF6B35;">Mark all read</button>
                  {/if}
                  <button on:click={closePanel} class="p-1 hover:bg-secondary rounded-full">
                    <X class="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div class="overflow-y-auto" style="max-height: 420px;">
                {#if loading}
                  <div class="flex flex-col items-center justify-center py-12">
                    <div class="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin mb-3" style="border-color: #FF6B35; border-top-color: transparent;"></div>
                    <p class="text-sm text-muted-foreground">Loading...</p>
                  </div>
                {:else if notifications.length === 0}
                  <div class="flex flex-col items-center py-14 text-center px-6">
                    <div class="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-4">
                      <Bell class="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p class="font-semibold mb-1">All caught up!</p>
                    <p class="text-sm text-muted-foreground">No notifications yet.</p>
                  </div>
                {:else}
                  <div class="divide-y divide-border">
                    {#each notifications as notification}
                      {@const Icon = getNotificationIcon(notification.type)}
                      <button
                        class="w-full px-4 py-3.5 hover:bg-secondary/50 transition-colors text-left flex gap-3 items-start relative {!notification.read ? 'bg-orange-500/5' : ''}"
                        on:click={() => handleNotificationClick(notification)}
                      >
                        {#if !notification.read}
                          <div class="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style="background-color: #FF6B35;"></div>
                        {/if}
                        <div class="relative flex-shrink-0 ml-2">
                          <img
                            src={notification.expand?.triggeredBy?.avatar
                              ? pb.files.getUrl(notification.expand.triggeredBy, notification.expand.triggeredBy.avatar)
                              : '/images/profilePlaceholder.jpg'}
                            alt=""
                            class="w-10 h-10 rounded-full object-cover"
                          />
                          <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-background {getIconColor(notification.type)}">
                            <svelte:component this={Icon} class="w-2.5 h-2.5" strokeWidth={2.5} />
                          </div>
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm leading-snug">
                            <span class="font-semibold">{notification.expand?.triggeredBy?.username || 'Someone'}</span>
                            <span class="text-muted-foreground ml-1">{getMessage(notification)}</span>
                          </p>
                          <p class="text-xs text-muted-foreground mt-0.5">{timeAgo(notification.created)}</p>
                        </div>
                        {#if ['like', 'comment'].includes(notification.type) && notification.expand?.post?.image}
                          <img src={pb.files.getUrl(notification.expand.post, notification.expand.post.image)} alt="" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        {/if}
                      </button>
                    {/each}
                  </div>
                  <div class="p-4 border-t border-border">
                    <button
                      on:click={() => { goto('/notifications'); closePanel(); }}
                      class="w-full py-2 text-sm font-semibold rounded-xl text-white hover:opacity-90"
                      style="background-color: #FF6B35;"
                    >
                      View all notifications
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- Profile Avatar -->
        <button
          class="w-9 h-9 rounded-full text-sm font-bold flex items-center justify-center hover:shadow-lg transition-all text-white"
          style="background: linear-gradient(135deg, #FF6B35 0%, #FF8555 100%);"
          on:click={() => goto('/profile')}
        >
          {currentUser?.username?.[0]?.toUpperCase() || 'A'}
        </button>

        <!-- Mobile toggle -->
        <button class="md:hidden p-2 hover:bg-secondary rounded-lg" on:click={() => mobileMenuOpen = !mobileMenuOpen}>
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            {#if mobileMenuOpen}
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            {:else}
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            {/if}
          </svg>
        </button>
      </div>
    </div>

    <!-- Mobile Menu -->
    {#if mobileMenuOpen}
      <div class="md:hidden pt-4 pb-2 border-t border-border mt-4">
        <div class="flex flex-col gap-3">
          {#each navLinks as link}
            <a
              href={link.href}
              class="text-sm font-medium py-2 px-3 hover:bg-secondary rounded-lg transition-colors {isActive(link.href) ? 'text-foreground font-semibold' : 'text-muted-foreground'}"
              on:click={() => mobileMenuOpen = false}
            >
              {link.label}
            </a>
          {/each}
          <a
            href="/create"
            class="px-5 py-3 rounded-full text-sm font-semibold flex items-center justify-center gap-2 text-white"
            style="background-color: #FF6B35;"
            on:click={() => mobileMenuOpen = false}
          >
            <span class="text-xl font-light">+</span> Create
          </a>
          {#if $cartCount > 0}
            <button
              class="px-5 py-3 rounded-full text-sm font-semibold border border-border hover:bg-muted"
              on:click={() => { mobileMenuOpen = false; goto('/checkout'); }}
            >
              Checkout ({$cartCount} items) · Rs. {$cartTotal.toFixed(0)}
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</nav>

<style>
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }
</style>
