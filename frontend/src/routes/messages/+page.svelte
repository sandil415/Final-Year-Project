<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { goto } from '$app/navigation';
  import Header from '$lib/components/Header.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import { ArrowLeft, MessageCircle, X } from 'lucide-svelte';
  import { TrashSimple } from 'phosphor-svelte';

  let conversations = [], currentUser, notifications = [];
  let loading = true;
  let confirmDeleteId = null;
  let deleting = false;

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.record ?? pb.authStore.model;

    const [convRes, notifRes] = await Promise.all([
      pb.collection('conversations').getList(1, 50, {
        filter: `participants.id ?= "${currentUser.id}"`,
        sort: '-lastMessageTime',
        expand: 'participants'
      }),
      pb.collection('notifications').getList(1, 100, {
        filter: `user = "${currentUser.id}" && type = "message" && read = false`
      })
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

  async function deleteConversation() {
    if (!confirmDeleteId || deleting) return;
    deleting = true;

    try {
      await pb.collection('conversations').delete(confirmDeleteId);
      conversations = conversations.filter(c => c.id !== confirmDeleteId);
    } catch (err) {
      console.error(err);
    } finally {
      deleting = false;
      confirmDeleteId = null;
    }
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

<!-- Delete Modal -->
{#if confirmDeleteId}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" on:click={() => confirmDeleteId = null}></div>

    <div class="relative z-10 bg-background border border-border rounded-2xl p-6 max-w-xs w-full shadow-2xl">
      <button class="absolute top-4 right-4 p-1 hover:bg-muted rounded-full" on:click={() => confirmDeleteId = null}>
        <X class="w-4 h-4 text-muted-foreground" />
      </button>

      <div class="flex flex-col items-center text-center gap-3">
        <div class="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
          <TrashSimple size={22} weight="fill" color="#EF4444" />
        </div>

        <div>
          <h3 class="font-bold mb-1">Delete conversation?</h3>
          <p class="text-sm text-muted-foreground">
            This removes it from your inbox. The other person's copy is unaffected.
          </p>
        </div>

        <div class="flex gap-2 w-full">
          <button class="flex-1 py-2 rounded-xl border border-border" on:click={() => confirmDeleteId = null}>
            Cancel
          </button>
          <button class="flex-1 py-2 rounded-xl bg-red-500 text-white" on:click={deleteConversation}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />

  <main class="flex-1 flex flex-col overflow-hidden">
    
    <!-- ✅ FIXED CONTAINER -->
    <div class="max-w-7xl mx-auto w-full px-6 flex flex-col flex-1 overflow-hidden">

      <!-- Top bar -->
      <div class="flex-shrink-0 border-b border-border py-3 flex items-center gap-3">
        <button on:click={goBack} class="p-2 hover:bg-muted rounded-full">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <h1 class="text-lg font-bold">Messages</h1>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto pb-20 md:pb-0">

        {#if loading}
          {#each Array(5) as _}
            <div class="flex items-center gap-4 py-4 border-b border-border/50">
              <div class="w-12 h-12 rounded-full bg-muted animate-pulse"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3.5 w-32 bg-muted animate-pulse"></div>
                <div class="h-3 w-48 bg-muted animate-pulse"></div>
              </div>
              <div class="h-3 w-10 bg-muted animate-pulse"></div>
            </div>
          {/each}

        {:else if conversations.length === 0}
          <div class="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle class="w-7 h-7 text-muted-foreground mb-2" />
            <p class="font-semibold">No messages yet</p>
            <p class="text-sm text-muted-foreground">Start a conversation.</p>
          </div>

        {:else}
          {#each conversations as convo (convo.id)}
            {@const other = getOtherUser(convo)}
            {@const unread = unreadCount(convo)}

            {#if other}
              <div class="flex border-b border-border/40">

                <button
                  class="flex-1 flex items-center gap-4 py-4 hover:bg-muted/50 text-left"
                  on:click={() => openConversation(convo)}
                >
                  <img
                    src={other.avatar
                      ? pb.files.getUrl(other, other.avatar)
                      : '/images/profilePlaceholder.jpg'}
                    class="w-12 h-12 rounded-full object-cover"
                  />

                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-sm truncate">{other.username}</p>
                    <p class="text-sm truncate {unread > 0 ? 'font-medium' : 'text-muted-foreground'}">
                      {convo.lastMessage || 'Start a conversation'}
                    </p>
                  </div>

                  <div class="text-xs text-muted-foreground">
                    {formatTime(convo.lastMessageTime)}
                  </div>
                </button>

                <button
                  class="w-14 flex items-center justify-center hover:bg-red-50"
                  on:click|stopPropagation={() => confirmDeleteId = convo.id}
                >
                  <TrashSimple size={18} color="#EF4444" />
                </button>

              </div>
            {/if}
          {/each}
        {/if}

      </div>
    </div>
  </main>
</div>

<BottomNav />