<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { goto } from '$app/navigation';
  import Header from '$lib/components/Header.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import { ArrowLeft, MessageCircle } from 'lucide-svelte';

  let conversations = [], currentUser, notifications = [];
  let loading = true;

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.model;

    const [convRes, notifRes] = await Promise.all([
      pb.collection('conversations').getList(1, 50, {
        filter: `participants.id ?= "${currentUser.id}"`,
        sort: '-lastMessageTime',
        expand: 'participants'
      }),
      pb.collection('notifications').getList(1, 100)
    ]);

    conversations = convRes.items;
    notifications = notifRes.items;
    loading = false;
  });

  function getOtherUser(convo) {
    return convo.expand?.participants?.find(p => p.id !== currentUser.id);
  }

  function unreadCount(convo) {
    return notifications.filter(n => !n.read && n.reference === convo.id).length;
  }

  function openConversation(convo) {
    goto(`/messages/${convo.id}`);
  }

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else goto('/home');
  }

  function formatTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / 86400000);
    if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
</script>

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />

  <main class="flex-1 flex flex-col overflow-hidden">

    <!-- ── Page Header ─────────────────────────────────────────── -->
    <div class="flex-shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
      <button
        on:click={goBack}
        class="p-2 hover:bg-muted rounded-full transition-colors flex-shrink-0"
        aria-label="Go back"
      >
        <ArrowLeft class="w-5 h-5 text-foreground" />
      </button>
      <h1 class="text-lg font-bold text-foreground">Messages</h1>
    </div>

    <!-- ── Conversation List ───────────────────────────────────── -->
    <div class="flex-1 overflow-y-auto pb-20 md:pb-0">

      {#if loading}
        <!-- Skeleton -->
        {#each Array(5) as _}
          <div class="flex items-center gap-4 px-6 py-4 border-b border-border/50">
            <div class="w-12 h-12 rounded-full bg-muted animate-pulse flex-shrink-0"></div>
            <div class="flex-1 space-y-2">
              <div class="h-3.5 w-32 rounded bg-muted animate-pulse"></div>
              <div class="h-3 w-48 rounded bg-muted animate-pulse"></div>
            </div>
            <div class="h-3 w-10 rounded bg-muted animate-pulse"></div>
          </div>
        {/each}

      {:else if conversations.length === 0}
        <!-- Empty state -->
        <div class="flex flex-col items-center justify-center h-full py-24 text-center px-8">
          <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <MessageCircle class="w-7 h-7 text-muted-foreground" />
          </div>
          <p class="font-semibold text-foreground mb-1">No messages yet</p>
          <p class="text-sm text-muted-foreground">
            Visit someone's profile and hit Message to start a conversation.
          </p>
        </div>

      {:else}
        {#each conversations as convo (convo.id)}
          {@const other = getOtherUser(convo)}
          {@const unread = unreadCount(convo)}
          {#if other}
            <button
              class="w-full flex items-center gap-4 px-6 py-4 hover:bg-muted/50 transition-colors
                     border-b border-border/40 text-left {unread > 0 ? 'bg-muted/20' : ''}"
              on:click={() => openConversation(convo)}
            >
              <!-- Avatar -->
              <div class="relative flex-shrink-0">
                <img
                  src={other.avatar
                    ? pb.files.getUrl(other, other.avatar)
                    : '/images/profilePlaceholder.jpg'}
                  alt={other.username}
                  class="w-12 h-12 rounded-full object-cover"
                />
                <!-- Unread dot on avatar -->
                {#if unread > 0}
                  <span
                    class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background"
                    style="background-color: #FF6B35;"
                  ></span>
                {/if}
              </div>

              <!-- Name + last message -->
              <div class="flex-1 min-w-0 text-left">
                <p class="font-semibold text-sm text-foreground truncate leading-snug">
                  {other.username}
                </p>
                <p class="text-sm text-muted-foreground truncate leading-snug mt-0.5
                           {unread > 0 ? 'font-medium text-foreground' : ''}">
                  {convo.lastMessage || 'Start a conversation'}
                </p>
              </div>

              <!-- Timestamp + unread badge -->
              <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span class="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(convo.lastMessageTime)}
                </span>
                {#if unread > 0}
                  <span
                    class="min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style="background-color: #FF6B35;"
                  >
                    {unread}
                  </span>
                {/if}
              </div>

            </button>
          {/if}
        {/each}
      {/if}

    </div>
  </main>
</div>

<BottomNav />