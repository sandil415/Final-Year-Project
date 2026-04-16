<script>
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { goto } from '$app/navigation';
  import { Heart, MessageCircle, UserPlus, Bell } from 'lucide-svelte';

  /**
   * State

  let notifications = [];      // All loaded notifications
  let loading = true;          // Loading state for UI
  let currentUser = null;      // Logged-in user model
  let filter = 'all';          // Active filter tab
  let unsubscribe = null;      // PocketBase realtime unsubscribe fn

  /**
   * -----------------------------
   * Lifecycle
   * -----------------------------
   */
  onMount(async () => {
    // Enforce authentication
    requireAuth();

    // Get current logged-in user from PocketBase
    currentUser = pb.authStore.model;

    // Redirect if user is not authenticated
    if (!currentUser) {
      goto('/login');
      return;
    }

    // Initial fetch
    await loadNotifications();

    // Start realtime subscription
    subscribeToNotifications();
  });

  onDestroy(() => {
    // Clean up PocketBase realtime subscription
    if (unsubscribe) unsubscribe();
  });

  /**
   * -----------------------------
   * Data Fetching
   * -----------------------------
   */
  async function loadNotifications() {
    try {
      loading = true;

      // Base filter: only notifications for logged-in user
      let filterQuery = `user = "${currentUser.id}"`;

      // Apply UI filter
      if (filter === 'unread') {
        filterQuery += ' && read = false';
      } else if (filter !== 'all') {
        filterQuery += ` && type = "${filter}"`;
      }

      // Fetch notifications with expanded relations
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

  /**
   * -----------------------------
   * Realtime Updates (PocketBase)
   * -----------------------------
   */
  function subscribeToNotifications() {
    try {
      // Subscribe to ALL notification events
      unsubscribe = pb.collection('notifications').subscribe('*', async (e) => {

        // Ignore notifications not meant for this user
        if (e.record.user !== currentUser.id) return;

        // New notification created
        if (e.action === 'create') {
          try {
            // Re-fetch to get expanded relations
            const expanded = await pb.collection('notifications').getOne(e.record.id, {
              expand: 'triggeredBy,post'
            });

            notifications = [expanded, ...notifications];
          } catch {
            // Fallback if expand fails
            notifications = [e.record, ...notifications];
          }
        }

        // Notification updated (e.g., read status)
        else if (e.action === 'update') {
          notifications = notifications.map(n =>
            n.id === e.record.id ? { ...n, ...e.record } : n
          );
        }

        // Notification deleted
        else if (e.action === 'delete') {
          notifications = notifications.filter(n => n.id !== e.record.id);
        }
      });
    } catch (err) {
      console.error('Failed to subscribe to notifications:', err);
    }
  }

  /**
   * -----------------------------
   * Actions
   * -----------------------------
   */
  async function markAsRead(notificationId) {
    try {
      await pb.collection('notifications').update(notificationId, { read: true });

      // Optimistic UI update (realtime will also sync)
      notifications = notifications.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      );
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  }

  async function markAllAsRead() {
    try {
      const unread = notifications.filter(n => !n.read);

      await Promise.all(
        unread.map(n =>
          pb.collection('notifications').update(n.id, { read: true })
        )
      );

      notifications = notifications.map(n => ({ ...n, read: true }));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }

  function handleNotificationClick(notification) {
    // Mark notification as read
    if (!notification.read) markAsRead(notification.id);

    // Navigate based on notification type
    if (notification.type === 'follow') {
      goto(`/profile/${notification.expand?.triggeredBy?.username}`);
    }

    if (notification.type === 'like' || notification.type === 'comment') {
      goto(`/profile/${notification.expand?.triggeredBy?.username}`);
    }

    if (notification.type === 'message' && notification.relatedConversation) {
      goto(`/messages/${notification.relatedConversation}`);
    }
  }

  /**
   * -----------------------------
   * UI Helpers
   * -----------------------------
   */
  function getNotificationIcon(type) {
    switch (type) {
      case 'like': return Heart;
      case 'comment': return MessageCircle;
      case 'follow': return UserPlus;
      case 'message': return MessageCircle;
      default: return Bell;
    }
  }

  function getNotificationColor(type) {
    switch (type) {
      case 'like': return 'text-red-500 bg-red-500/10';
      case 'comment': return 'text-blue-500 bg-blue-500/10';
      case 'follow': return 'text-green-500 bg-green-500/10';
      case 'message': return 'text-purple-500 bg-purple-500/10';
      default: return 'text-muted-foreground bg-muted';
    }
  }

  function getNotificationMessage(notification) {
    switch (notification.type) {
      case 'follow': return 'started following you';
      case 'like': return 'liked your post';
      case 'comment': return 'commented on your post';
      case 'message': return 'sent you a message';
      default: return notification.message || 'New notification';
    }
  }

  function getTimeAgo(dateString) {
    const seconds = Math.floor((Date.now() - new Date(dateString)) / 1000);
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

  // Derived state: unread count
  $: unreadCount = notifications.filter(n => !n.read).length;
</script>
