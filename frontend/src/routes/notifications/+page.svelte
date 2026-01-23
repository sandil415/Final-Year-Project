<script>
  import Sidebar from '$lib/components/Sidebar.svelte';
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { goto } from '$app/navigation';

  let notifications = [];
  let loading = true;
  let currentUser = null;

  onMount(async () => {
    // Ensure user is authenticated
    requireAuth();
    currentUser = pb.authStore.model;
    
    if (!currentUser) {
      goto('/login');
      return;
    }

    await loadNotifications();
    
    // Mark notifications as read after viewing
    setTimeout(() => {
      markAllAsRead();
    }, 1000);
  });

  async function loadNotifications() {
    try {
      // Fetch notifications for current user, sorted by newest first
      const records = await pb.collection('notifications').getList(1, 50, {
        filter: `user = "${currentUser.id}"`,
        sort: '-created',
        expand: 'triggeredBy' // Expand to get user who triggered the notification
      });

      notifications = records.items;
      loading = false;
    } catch (err) {
      console.error('Failed to load notifications:', err);
      loading = false;
    }
  }

  async function markAllAsRead() {
    try {
      // Mark all unread notifications as read
      const unreadNotifications = notifications.filter(n => !n.read);
      
      for (const notification of unreadNotifications) {
        await pb.collection('notifications').update(notification.id, {
          read: true
        });
      }
    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
    }
  }

  function getNotificationMessage(notification) {
    const username = notification.expand?.triggeredBy?.username || 'Someone';
    
    switch (notification.type) {
      case 'follow':
        return `${username} started following you`;
      case 'like':
        return `${username} liked your post`;
      case 'comment':
        return `${username} commented on your post`;
      case 'mention':
        return `${username} mentioned you`;
      default:
        return notification.message || 'New notification';
    }
  }

  function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  }

  function handleNotificationClick(notification) {
    // Navigate based on notification type
    if (notification.type === 'follow' && notification.expand?.triggeredBy) {
      goto(`/profile/${notification.expand.triggeredBy.username}`);
    } else if (notification.relatedPost) {
      goto(`/post/${notification.relatedPost}`);
    }
  }
</script>

<div class="h-screen flex bg-background text-foreground overflow-hidden">
  <Sidebar />

  <main class="flex-1 overflow-y-auto">
    <div class="max-w-2xl mx-auto border-x min-h-screen">
      <!-- Header -->
      <div class="sticky top-0 bg-background/95 backdrop-blur border-b z-10 px-6 py-4">
        <h1 class="text-xl font-semibold">Notifications</h1>
      </div>

      <!-- Content -->
      {#if loading}
        <div class="p-10 text-center">
          <p class="text-muted-foreground">Loading notifications...</p>
        </div>
      {:else if notifications.length === 0}
        <!-- Empty State -->
        <div class="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <span class="text-3xl">🔔</span>
          </div>
          <h2 class="text-xl font-semibold mb-2">No notifications yet</h2>
          <p class="text-muted-foreground">
            When someone follows you or interacts with your posts, you'll see it here.
          </p>
        </div>
      {:else}
        <!-- Notifications List -->
        <div class="divide-y">
          {#each notifications as notification}
            <button
              class="w-full px-6 py-4 hover:bg-muted/50 transition-colors text-left flex gap-4 items-start {!notification.read ? 'bg-primary/5' : ''}"
              on:click={() => handleNotificationClick(notification)}
            >
              <!-- Avatar -->
              <img
                src={notification.expand?.triggeredBy?.avatar
                  ? pb.files.getUrl(notification.expand.triggeredBy, notification.expand.triggeredBy.avatar)
                  : '/images/profilePlaceholder.jpg'}
                alt={notification.expand?.triggeredBy?.username || 'User'}
                class="w-10 h-10 rounded-full object-cover flex-shrink-0"
              />

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <p class="text-sm">
                  {getNotificationMessage(notification)}
                </p>
                <p class="text-xs text-muted-foreground mt-1">
                  {getTimeAgo(notification.created)}
                </p>
              </div>

              <!-- Unread indicator -->
              {#if !notification.read}
                <div class="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2"></div>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </main>
</div>

<!-- <script>
  import Sidebar from '$lib/components/Sidebar.svelte';
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';

  let notifications = [];
  let offline = false;
  let unsubscribe;

  onMount(async () => {
    requireAuth();
    loadNotifications();
    subscribeToNotifications();

    offline = !navigator.onLine;
    window.addEventListener('online', () => { offline = false; loadNotifications(); });
    window.addEventListener('offline', () => { offline = true; });
  });

  onDestroy(() => {
    unsubscribe?.();
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  });

  async function loadNotifications() {
    try {
      const res = await pb.collection('notifications').getList(1, 50, {
        sort: '-created'
      });
      notifications = res.items;
    } catch (err) { console.warn('Offline or fetch failed'); }
  }

  async function subscribeToNotifications() {
    unsubscribe = await pb.collection('notifications').subscribe('*', (e) => {
      if (e.action === 'create') notifications = [e.record, ...notifications];
      if (e.action === 'update') notifications = notifications.map(n => n.id === e.record.id ? e.record : n);
    });
  }

  async function openNotification(n) {
    if (!n.read) {
      await pb.collection('notifications').update(n.id, { read: true });
    }
    if (n.type === 'message') goto(`/messages/${n.reference}`);
  }
</script>

<div class="min-h-screen bg-background flex">
  <Sidebar />

  <main class="flex-1 p-8">
    {#if offline}
      <div class="bg-muted text-muted-foreground text-sm px-4 py-2 rounded-xl mb-4">
        No internet connection
      </div>
    {/if}

    <h1 class="text-2xl font-semibold mb-6">Notifications</h1>

    {#if notifications.length === 0}
      <div class="text-muted-foreground text-center py-20">
        You’re all caught up 🎉
      </div>
    {:else}
      <div class="space-y-3">
        {#each notifications as n}
          <div
            class="p-4 rounded-2xl cursor-pointer flex justify-between items-center hover:bg-muted transition {n.read ? 'opacity-60' : 'bg-muted/50'}"
            on:click={() => openNotification(n)}
          >
            <div>
              <p class="font-medium">{n.title}</p>
              <p class="text-sm text-muted-foreground">{n.body}</p>
            </div>
            {#if !n.read}
              <span class="w-2 h-2 bg-primary rounded-full"></span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </main>
</div> -->
