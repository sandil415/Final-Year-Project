<script>
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/pocketbase';
  import { Heart, MessageCircle, UserPlus, Bell, X } from 'lucide-svelte';
  import { goto } from '$app/navigation';

  export let isOpen = false;
  export let onClose;

  let notifications = [];
  let loading = true;
  let unreadCount = 0;
  let currentUser = pb.authStore.model;
  let unsubscribe = null;

  onMount(async () => {
    await loadNotifications();
    subscribeToNotifications();
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  async function loadNotifications() {
    if (!currentUser) return;

    try {
      loading = true;
      const result = await pb.collection('notifications').getList(1, 50, {
        filter: `user = "${currentUser.id}"`,
        sort: '-created',
        expand: 'triggeredBy,post'
      });

      notifications = result.items;
      unreadCount = notifications.filter(n => !n.read).length;
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      loading = false;
    }
  }

  function subscribeToNotifications() {
    // Subscribe to realtime updates
    unsubscribe = pb.collection('notifications').subscribe('*', async (e) => {
      if (e.action === 'create' && e.record.user === currentUser.id) {
        // New notification for current user
        try {
          const expanded = await pb.collection('notifications').getOne(e.record.id, {
            expand: 'triggeredBy,post'
          });
          notifications = [expanded, ...notifications];
          unreadCount++;
        } catch (err) {
          console.error('Failed to load new notification:', err);
        }
      } else if (e.action === 'update' && e.record.user === currentUser.id) {
        // Notification updated (e.g., marked as read)
        const index = notifications.findIndex(n => n.id === e.record.id);
        if (index !== -1) {
          notifications[index] = { ...notifications[index], ...e.record };
          notifications = notifications;
          unreadCount = notifications.filter(n => !n.read).length;
        }
      } else if (e.action === 'delete') {
        notifications = notifications.filter(n => n.id !== e.record.id);
        unreadCount = notifications.filter(n => !n.read).length;
      }
    });
  }

  async function markAsRead(notification) {
    if (notification.read) return;

    try {
      await pb.collection('notifications').update(notification.id, {
        read: true
      });
      // The realtime subscription will update the UI
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  }

  async function markAllAsRead() {
    try {
      const unreadNotifs = notifications.filter(n => !n.read);
      await Promise.all(
        unreadNotifs.map(n => 
          pb.collection('notifications').update(n.id, { read: true })
        )
      );
      // Realtime subscription will update UI
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }

  function handleNotificationClick(notification) {
    markAsRead(notification);
    
    // Navigate based on notification type
    if (notification.type === 'follow') {
      goto(`/profile/${notification.expand?.triggeredBy?.username}`);
    } else if (notification.type === 'like' || notification.type === 'comment') {
      // You can navigate to profile or stay on home with modal
      goto(`/profile/${notification.expand?.triggeredBy?.username}`);
    }
    
    onClose();
  }

  function getNotificationIcon(type) {
    switch (type) {
      case 'like':
        return Heart;
      case 'comment':
        return MessageCircle;
      case 'follow':
        return UserPlus;
      default:
        return Bell;
    }
  }

  function getNotificationColor(type) {
    switch (type) {
      case 'like':
        return 'text-red-500';
      case 'comment':
        return 'text-blue-500';
      case 'follow':
        return 'text-green-500';
      default:
        return 'text-muted-foreground';
    }
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-40"
    on:click={handleBackdropClick}
    role="button"
    tabindex="-1"
    aria-label="Close notifications"
  />

  <!-- Notification Panel -->
  <div class="fixed right-4 top-16 z-50 w-[400px] max-h-[600px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
    <!-- Header -->
    <div class="p-4 border-b border-border flex items-center justify-between bg-card sticky top-0 z-10">
      <h2 class="text-lg font-semibold text-foreground">Notifications</h2>
      <div class="flex items-center gap-2">
        {#if unreadCount > 0}
          <button
            on:click={markAllAsRead}
            class="text-xs text-primary hover:underline font-medium"
          >
            Mark all read
          </button>
        {/if}
        <button
          on:click={onClose}
          class="hover:bg-muted rounded-full p-1 transition-colors"
          aria-label="Close"
        >
          <X class="w-5 h-5 text-foreground" />
        </button>
      </div>
    </div>

    <!-- Notifications List -->
    <div class="overflow-y-auto max-h-[540px]">
      {#if loading}
        <div class="p-8 text-center">
          <p class="text-muted-foreground text-sm">Loading notifications...</p>
        </div>
      {:else if notifications.length === 0}
        <div class="p-8 text-center">
          <Bell class="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p class="text-muted-foreground text-sm">No notifications yet</p>
        </div>
      {:else}
        {#each notifications as notification}
          <button
            on:click={() => handleNotificationClick(notification)}
            class="w-full p-4 flex gap-3 hover:bg-muted transition-colors border-b border-border last:border-b-0 {!notification.read ? 'bg-muted/30' : ''}"
          >
            <!-- User Avatar -->
            <img
              src={notification.expand?.triggeredBy?.avatar
                ? pb.files.getUrl(notification.expand.triggeredBy, notification.expand.triggeredBy.avatar)
                : '/images/profilePlaceholder.jpg'}
              alt={notification.expand?.triggeredBy?.username}
              class="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />

            <!-- Content -->
            <div class="flex-1 min-w-0 text-left">
              <div class="flex items-start gap-2">
                <p class="text-sm flex-1">
                  <span class="font-semibold text-foreground">
                    {notification.expand?.triggeredBy?.username}
                  </span>
                  <span class="text-foreground ml-1">
                    {#if notification.type === 'like'}
                      liked your post.
                    {:else if notification.type === 'comment'}
                      commented on your post.
                    {:else if notification.type === 'follow'}
                      started following you.
                    {:else}
                      {notification.message}
                    {/if}
                  </span>
                </p>

                <!-- Icon -->
                <svelte:component
                  this={getNotificationIcon(notification.type)}
                  class="w-4 h-4 flex-shrink-0 {getNotificationColor(notification.type)} {notification.type === 'like' ? 'fill-current' : ''}"
                />
              </div>

              <!-- Time + Unread Indicator -->
              <div class="flex items-center gap-2 mt-1">
                <span class="text-xs text-muted-foreground">
                  {formatDate(notification.created)}
                </span>
                {#if !notification.read}
                  <span class="w-2 h-2 rounded-full bg-primary"></span>
                {/if}
              </div>
            </div>

            <!-- Post Thumbnail (for like/comment notifications) -->
            {#if (notification.type === 'like' || notification.type === 'comment') && notification.expand?.post?.image}
              <img
                src={pb.files.getUrl(notification.expand.post, notification.expand.post.image)}
                alt="Post"
                class="w-12 h-12 rounded object-cover flex-shrink-0"
              />
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .overflow-y-auto {
    scrollbar-width: thin;
    scrollbar-color: rgba(155, 155, 155, 0.3) transparent;
  }

  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }

  .overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb {
    background-color: rgba(155, 155, 155, 0.3);
    border-radius: 3px;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background-color: rgba(155, 155, 155, 0.5);
  }
</style>