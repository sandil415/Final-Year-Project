<script>
  import Sidebar from '$lib/components/Sidebar.svelte';
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { goto } from '$app/navigation';
  import { Heart, MessageCircle, UserPlus, Bell } from 'lucide-svelte';

  let notifications = [];
  let loading = true;
  let currentUser = null;
  let filter = 'all'; // 'all', 'unread', 'likes', 'comments', 'follows', 'messages'

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.model;
    
    if (!currentUser) {
      goto('/login');
      return;
    }

    await loadNotifications();
  });

  async function loadNotifications() {
    try {
      loading = true;
      
      let filterQuery = `user = "${currentUser.id}"`;
      
      // Apply filters
      if (filter === 'unread') {
        filterQuery += ' && read = false';
      } else if (filter !== 'all') {
        filterQuery += ` && type = "${filter}"`;
      }

      const records = await pb.collection('notifications').getList(1, 50, {
        filter: filterQuery,
        sort: '-created',
        expand: 'triggeredBy,post'
      });

      notifications = records.items;
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      loading = false;
    }
  }

  async function markAsRead(notificationId) {
    try {
      await pb.collection('notifications').update(notificationId, {
        read: true
      });
      
      // Update local state
      notifications = notifications.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      );
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  }

  async function markAllAsRead() {
    try {
      const unreadNotifications = notifications.filter(n => !n.read);
      
      await Promise.all(
        unreadNotifications.map(n => 
          pb.collection('notifications').update(n.id, { read: true })
        )
      );
      
      // Update local state
      notifications = notifications.map(n => ({ ...n, read: true }));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }

  function handleNotificationClick(notification) {
    // Mark as read
    if (!notification.read) {
      markAsRead(notification.id);
    }

    // Navigate based on type
    if (notification.type === 'follow' && notification.expand?.triggeredBy) {
      goto(`/profile/${notification.expand.triggeredBy.username}`);
    } else if (notification.type === 'like' || notification.type === 'comment') {
      // Could open post modal or go to profile
      goto(`/profile/${notification.expand?.triggeredBy?.username}`);
    } else if (notification.type === 'message' && notification.relatedConversation) {
      goto(`/messages/${notification.relatedConversation}`);
    }
  }

  function getNotificationIcon(type) {
    switch (type) {
      case 'like':
        return Heart;
      case 'comment':
        return MessageCircle;
      case 'follow':
        return UserPlus;
      case 'message':
        return MessageCircle;
      default:
        return Bell;
    }
  }

  function getNotificationColor(type) {
    switch (type) {
      case 'like':
        return 'text-red-500 bg-red-500/10';
      case 'comment':
        return 'text-blue-500 bg-blue-500/10';
      case 'follow':
        return 'text-green-500 bg-green-500/10';
      case 'message':
        return 'text-purple-500 bg-purple-500/10';
      default:
        return 'text-muted-foreground bg-muted';
    }
  }

  function getNotificationMessage(notification) {
    const username = notification.expand?.triggeredBy?.username || 'Someone';
    
    switch (notification.type) {
      case 'follow':
        return `started following you`;
      case 'like':
        return `liked your post`;
      case 'comment':
        return `commented on your post`;
      case 'message':
        return notification.message?.replace(`${username} sent you a message: `, '') || 'sent you a message';
      default:
        return notification.message || 'New notification';
    }
  }

  function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return `${Math.floor(seconds / 604800)}w`;
  }

  async function changeFilter(newFilter) {
    filter = newFilter;
    await loadNotifications();
  }

  $: unreadCount = notifications.filter(n => !n.read).length;
</script>

<div class="h-screen flex bg-background text-foreground overflow-hidden">
  <Sidebar />

  <main class="flex-1 overflow-y-auto">
    <div class="max-w-3xl mx-auto border-x min-h-screen">
      <!-- Header -->
      <div class="sticky top-0 bg-background/95 backdrop-blur-sm border-b z-10">
        <div class="px-6 py-4 flex items-center justify-between">
          <h1 class="text-2xl font-bold">Notifications</h1>
          
          {#if unreadCount > 0}
            <button 
              on:click={markAllAsRead}
              class="text-sm text-primary font-medium hover:underline"
            >
              Mark all as read
            </button>
          {/if}
        </div>

        <!-- Filter Tabs -->
        <div class="px-6 pb-3 flex gap-2 overflow-x-auto">
          <button
            on:click={() => changeFilter('all')}
            class="px-4 py-1.5 rounded-full text-sm font-medium transition-colors {filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}"
          >
            All
          </button>
          <button
            on:click={() => changeFilter('unread')}
            class="px-4 py-1.5 rounded-full text-sm font-medium transition-colors {filter === 'unread' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}"
          >
            Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
          </button>
          <button
            on:click={() => changeFilter('like')}
            class="px-4 py-1.5 rounded-full text-sm font-medium transition-colors {filter === 'like' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}"
          >
            Likes
          </button>
          <button
            on:click={() => changeFilter('comment')}
            class="px-4 py-1.5 rounded-full text-sm font-medium transition-colors {filter === 'comment' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}"
          >
            Comments
          </button>
          <button
            on:click={() => changeFilter('follow')}
            class="px-4 py-1.5 rounded-full text-sm font-medium transition-colors {filter === 'follow' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}"
          >
            Follows
          </button>
          <button
            on:click={() => changeFilter('message')}
            class="px-4 py-1.5 rounded-full text-sm font-medium transition-colors {filter === 'message' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}"
          >
            Messages
          </button>
        </div>
      </div>

      <!-- Content -->
      {#if loading}
        <div class="p-10 text-center">
          <div class="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p class="text-muted-foreground">Loading notifications...</p>
        </div>
      {:else if notifications.length === 0}
        <!-- Empty State -->
        <div class="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div class="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
            <Bell class="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 class="text-xl font-semibold mb-2">
            {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
          </h2>
          <p class="text-muted-foreground max-w-sm">
            {filter === 'all' 
              ? 'When someone follows you or interacts with your posts, you\'ll see it here.' 
              : `You don't have any ${filter} notifications.`}
          </p>
        </div>
      {:else}
        <!-- Notifications List -->
        <div class="divide-y divide-border">
          {#each notifications as notification}
            {@const Icon = getNotificationIcon(notification.type)}
            
            <button
              class="w-full px-6 py-4 hover:bg-muted/30 transition-colors text-left flex gap-4 items-start relative {!notification.read ? 'bg-muted/20' : ''}"
              on:click={() => handleNotificationClick(notification)}
            >
              <!-- Unread Indicator -->
              {#if !notification.read}
                <div class="absolute left-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full"></div>
              {/if}

              <!-- Avatar with Icon Badge -->
              <div class="relative flex-shrink-0">
                <img
                  src={notification.expand?.triggeredBy?.avatar
                    ? pb.files.getUrl(notification.expand.triggeredBy, notification.expand.triggeredBy.avatar)
                    : '/images/profilePlaceholder.jpg'}
                  alt={notification.expand?.triggeredBy?.username || 'User'}
                  class="w-12 h-12 rounded-full object-cover"
                />
                <div class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center {getNotificationColor(notification.type)} border-2 border-background">
                  <Icon class="w-3 h-3" strokeWidth={2.5} />
                </div>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <p class="text-sm">
                  <span class="font-semibold text-foreground">
                    {notification.expand?.triggeredBy?.username || 'Someone'}
                  </span>
                  <span class="text-muted-foreground ml-1">
                    {getNotificationMessage(notification)}
                  </span>
                </p>
                <p class="text-xs text-muted-foreground mt-1">
                  {getTimeAgo(notification.created)}
                </p>
              </div>

              <!-- Post Thumbnail (for likes/comments) -->
              {#if (notification.type === 'like' || notification.type === 'comment') && notification.expand?.post?.image}
                <img
                  src={pb.files.getUrl(notification.expand.post, notification.expand.post.image)}
                  alt="Post"
                  class="w-12 h-12 rounded object-cover flex-shrink-0"
                />
              {/if}
            </button>
          {/each}
        </div>

        <!-- Load More (if needed) -->
        {#if notifications.length >= 50}
          <div class="p-6 text-center">
            <button class="text-sm text-primary font-medium hover:underline">
              Load more notifications
            </button>
          </div>
        {/if}
      {/if}
    </div>
  </main>
</div>