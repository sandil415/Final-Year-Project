<script>
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { BellIcon, ShoppingBagIcon } from "phosphor-svelte";
  import { onMount, onDestroy } from "svelte";
  import pb from '$lib/pocketbase';
  import { Heart, MessageCircle, UserPlus, Bell, X } from 'lucide-svelte';

  let mobileMenuOpen = false;
  let notificationPanelOpen = false;
  let notifications = [];
  let unreadCount = 0;
  let cartCount = 3; // Replace with real cart logic if needed
  let loading = false;
  let currentUser = null;
  let unsubscribe = null;

  // Reactive active route check
  $: currentPath = $page.url.pathname;

  function isActive(href) {
    if (href === '/demo') return currentPath === '/demo' || currentPath === '/';
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
    } catch (e) {
      console.error('Failed to fetch notification count', e);
    }
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
      console.error('Failed to load notifications', e);
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
    } catch (e) {
      console.error('Realtime subscription failed', e);
    }
  }

  async function toggleNotificationPanel() {
    notificationPanelOpen = !notificationPanelOpen;
    if (notificationPanelOpen) {
      await loadNotifications();
    }
  }

  async function markAllAsRead() {
    try {
      const unread = notifications.filter(n => !n.read);
      await Promise.all(unread.map(n => pb.collection('notifications').update(n.id, { read: true })));
      notifications = notifications.map(n => ({ ...n, read: true }));
      unreadCount = 0;
    } catch (e) {
      console.error(e);
    }
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
    const username = notification.expand?.triggeredBy?.username || 'Someone';
    switch (notification.type) {
      case 'follow': return `started following you`;
      case 'like': return `liked your post`;
      case 'comment': return `commented on your post`;
      case 'message': return `sent you a message`;
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

  function closePanel() {
    notificationPanelOpen = false;
  }
</script>

<!-- Click-outside overlay -->
{#if notificationPanelOpen}
  <div 
    class="fixed inset-0 z-40" 
    on:click={closePanel}
    role="presentation"
  ></div>
{/if}

<nav class="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
  <div class="max-w-7xl mx-auto px-6 py-4">
    <div class="flex items-center justify-between">
      <!-- Logo -->
      <div class="flex flex-col gap-1">
        <button class="flex flex-col items-start" on:click={() => goto('/demo')}>
          <h1 class="text-2xl font-bold tracking-tight text-foreground">FIESTRA</h1>
          <span class="text-xs font-medium tracking-wider" style="color: #FF6B35;">Explore Nepali Cuisines with Us</span>
        </button>
      </div>
      
      <!-- Desktop Navigation Links -->
      <div class="hidden md:flex items-center gap-8">
        {#each [
          { href: '/demo', label: 'Home' },
          { href: '/search', label: 'Search' },
          { href: '/explore', label: 'Explore' },
          { href: '/messages', label: 'Messages' },
        ] as link}
          <a 
            href={link.href} 
            class="text-sm font-medium transition-colors relative group {isActive(link.href) ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}"
          >
            {link.label}
            <span 
              class="absolute -bottom-1 left-0 h-0.5 transition-[width] duration-300 {isActive(link.href) ? 'w-full' : 'w-0 group-hover:w-full'}"
              style="background-color: #FF6B35;"
            ></span>
          </a>
        {/each}

        <a 
          href="/create" 
          class="px-5 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-all hover:shadow-lg"
          style="background-color: #FF6B35; color: hsl(var(--primary-foreground));"
        >
          <span class="text-xl font-light">+</span>
          Create
        </a>
      </div>
      
      <!-- Right Icons -->
      <div class="flex items-center gap-4">
        <!-- Cart/Bag -->
        <button class="relative p-2 hover:bg-secondary rounded-full transition-colors">
          <ShoppingBagIcon class="w-6 h-6"/>
          {#if cartCount > 0}
            <span 
              class="absolute -top-1 -right-1 w-5 h-5 text-xs rounded-full flex items-center justify-center font-bold"
              style="background-color: #FF6B35; color: hsl(var(--primary-foreground));"
            >
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          {/if}
        </button>
        
        <!-- Notifications -->
        <div class="relative">
          <button 
            class="relative p-2 hover:bg-secondary rounded-full transition-colors {notificationPanelOpen ? 'bg-secondary' : ''}"
            on:click={toggleNotificationPanel}
            aria-label="Notifications"
          >
            <BellIcon class="w-6 h-6"/>
            {#if unreadCount > 0}
              <span 
                class="absolute -top-1 -right-1 w-5 h-5 text-xs rounded-full flex items-center justify-center font-bold transition-all"
                style="background-color: #FF6B35; color: hsl(var(--primary-foreground));"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            {/if}
          </button>

          <!-- Notification Panel -->
          {#if notificationPanelOpen}
            <div 
              class="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-background border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
              style="max-height: min(520px, calc(100vh - 100px));"
            >
              <!-- Panel Header -->
              <div class="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between">
                <div class="flex items-center gap-2.5">
                  <h2 class="text-lg font-bold text-foreground">Notifications</h2>
                  {#if unreadCount > 0}
                    <span 
                      class="px-2 py-0.5 text-xs font-bold rounded-full text-white"
                      style="background-color: #FF6B35;"
                    >
                      {unreadCount}
                    </span>
                  {/if}
                </div>
                <div class="flex items-center gap-3">
                  {#if unreadCount > 0}
                    <button 
                      on:click={markAllAsRead}
                      class="text-xs font-semibold transition-colors hover:opacity-70"
                      style="color: #FF6B35;"
                    >
                      Mark all read
                    </button>
                  {/if}
                  <button 
                    on:click={closePanel}
                    class="p-1 hover:bg-secondary rounded-full transition-colors"
                  >
                    <X class="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <!-- Panel Body -->
              <div class="overflow-y-auto" style="max-height: 420px;">
                {#if loading}
                  <div class="flex flex-col items-center justify-center py-12">
                    <div class="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin mb-3" style="border-color: #FF6B35; border-top-color: transparent;"></div>
                    <p class="text-sm text-muted-foreground">Loading...</p>
                  </div>
                {:else if notifications.length === 0}
                  <div class="flex flex-col items-center justify-center py-14 px-6 text-center">
                    <div class="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-4">
                      <Bell class="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p class="font-semibold text-foreground mb-1">All caught up!</p>
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
                        <!-- Unread dot -->
                        {#if !notification.read}
                          <div 
                            class="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style="background-color: #FF6B35;"
                          ></div>
                        {/if}

                        <!-- Avatar + icon badge -->
                        <div class="relative flex-shrink-0 ml-2">
                          <img
                            src={notification.expand?.triggeredBy?.avatar
                              ? pb.files.getUrl(notification.expand.triggeredBy, notification.expand.triggeredBy.avatar)
                              : '/images/profilePlaceholder.jpg'}
                            alt={notification.expand?.triggeredBy?.username || 'User'}
                            class="w-10 h-10 rounded-full object-cover"
                          />
                          <div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-background {getIconColor(notification.type)}">
                            <Icon class="w-2.5 h-2.5" strokeWidth={2.5} />
                          </div>
                        </div>

                        <!-- Text -->
                        <div class="flex-1 min-w-0">
                          <p class="text-sm leading-snug">
                            <span class="font-semibold text-foreground">{notification.expand?.triggeredBy?.username || 'Someone'}</span>
                            <span class="text-muted-foreground ml-1">{getMessage(notification)}</span>
                          </p>
                          <p class="text-xs text-muted-foreground mt-0.5">{timeAgo(notification.created)}</p>
                        </div>

                        <!-- Post thumbnail -->
                        {#if ['like', 'comment'].includes(notification.type) && notification.expand?.post?.image}
                          <img
                            src={pb.files.getUrl(notification.expand.post, notification.expand.post.image)}
                            alt="Post"
                            class="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          />
                        {/if}
                      </button>
                    {/each}
                  </div>

                  <!-- Footer -->
                  <div class="p-4 border-t border-border">
                    <button 
                      on:click={() => { goto('/notifications'); closePanel(); }}
                      class="w-full py-2 text-sm font-semibold rounded-xl transition-colors hover:opacity-90 text-white"
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
          class="w-9 h-9 rounded-full text-sm font-bold flex items-center justify-center hover:shadow-lg transition-all"
          style="background: linear-gradient(135deg, #FF6B35 0%, #FF8555 100%); color: hsl(var(--primary-foreground));"
          on:click={() => goto('/profile')}
        >
          A
        </button>
        
        <!-- Mobile Menu Toggle -->
        <button 
          class="md:hidden p-2 hover:bg-secondary rounded-lg transition-colors"
          on:click={() => mobileMenuOpen = !mobileMenuOpen}
        >
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            {#if mobileMenuOpen}
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            {:else}
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            {/if}
          </svg>
        </button>
      </div>
    </div>
    
    <!-- Mobile Menu -->
    {#if mobileMenuOpen}
      <div class="md:hidden pt-4 pb-2 border-t border-border mt-4">
        <div class="flex flex-col gap-3">
          {#each [
            { href: '/demo', label: 'Home' },
            { href: '/search', label: 'Search' },
            { href: '/explore', label: 'Explore' },
            { href: '/messages', label: 'Messages' },
          ] as link}
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
            class="px-5 py-3 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-all"
            style="background-color: #FF6B35; color: hsl(var(--primary-foreground));"
            on:click={() => mobileMenuOpen = false}
          >
            <span class="text-xl font-light">+</span>
            Create
          </a>
        </div>
      </div>
    {/if}
  </div>
</nav>