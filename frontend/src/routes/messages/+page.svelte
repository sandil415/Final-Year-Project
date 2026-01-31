<script>
  import Sidebar from '$lib/components/Sidebar.svelte';
  import BottomNav from '$lib/components/Bottomnav.svelte';
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { goto } from '$app/navigation';
  import Bottomnav from '$lib/components/BottomNav.svelte';

  let conversations = [], currentUser, notifications = [];

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.model;

    const res = await pb.collection('conversations').getList(1, 50, {
      filter: `participants.id ?= "${currentUser.id}"`,
      sort: '-lastMessageTime',
      expand: 'participants'
    });
    conversations = res.items;

    // load notifications
    const notifRes = await pb.collection('notifications').getList(1, 100);
    notifications = notifRes.items;
  });

  function getOtherUser(convo) {
    return convo.expand.participants.find(p => p.id !== currentUser.id);
  }

  function unreadCount(convo) {
    return notifications.filter(n => !n.read && n.reference === convo.id).length;
  }

  function openConversation(convo) {
    goto(`/messages/${convo.id}`);
  }
</script>

<div class = "h-screen flex bg-background overflow-hidden">
  <div class = "hidden md:block md:w-64 border-r border-border flex-shrink-0 overflow-y-auto">
    <Sidebar />
  </div>

  <main class="flex-1 border-l border-border flex flex-col overflow-y-auto">
    <h2 class="p-4 font-semibold text-lg">Messages</h2>

<div class = "pb-20 md:pb-0">
      {#each conversations as convo}
      {@const other = getOtherUser(convo)}
      <button class="w-full flex items-center justify-between p-4 hover:bg-muted" on:click={() => openConversation(convo)}>
        <div class="flex items-center gap-3">
          <img src={other.avatar ? pb.files.getUrl(other, other.avatar) : '/images/profilePlaceholder.jpg'} class="w-12 h-12 rounded-full object-cover"/>
          <div class="flex flex-col">
            <p class="font-medium">{other.username}</p>
            <p class="text-sm text-muted-foreground truncate">{convo.lastMessage || 'Start a conversation'}</p>
          </div>
        </div>
        {#if unreadCount(convo) > 0}
          <span class="w-3 h-3 bg-primary rounded-full"></span>
        {/if}
      </button>
    {/each}
</div>
  </main>
</div>

<BottomNav/>