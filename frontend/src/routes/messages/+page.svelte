<script>
  import Sidebar from '$lib/components/Sidebar.svelte';
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { goto } from '$app/navigation';

  let conversations = [];
  let currentUser;

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.model;

    // return values where the user is a participant (filter), in the newest to oldest fashion with expanded value of the participant
    const res = await pb.collection('conversations').getList(1, 50, {
      filter: `participants.id ?= "${currentUser.id}"`,
      sort: '-lastMessageTime',
      expand: 'participants'
    });

    conversations = res.items;
  });

  function openConversation(convo) {
    goto(`/messages/${convo.id}`);
  }

  function getOtherUser(convo) {
    return convo.expand.participants.find(p => p.id !== currentUser.id);
  }
</script>

<div class="min-h-screen flex bg-background">
  <Sidebar />

  <main class="flex-1 border-l border-border flex">
    <!-- LEFT: INBOX -->
    <div class="w-full border-r border-border">
      <h2 class="p-4 font-semibold text-lg">Messages</h2>

      {#if conversations.length === 0}
        <p class="p-4 text-muted-foreground">
          No conversations yet
        </p>
      {/if}

      {#each conversations as convo}
        {@const other = getOtherUser(convo)}

        <button
          class="w-full flex gap-3 p-4 hover:bg-muted text-left"
          on:click={() => openConversation(convo)}
        >
          <img
            src={other.avatar? pb.files.getUrl(other, other.avatar): '/images/profilePlaceholder.jpg'} class="w-12 h-12 rounded-full object-cover"
          />

          <div class="flex-1">
            <p class="font-medium">{other.username}</p>
            <p class="text-sm text-muted-foreground truncate">
              {convo.lastMessage || 'Start a conversation'}
            </p>
          </div>
        </button>
      {/each}
    </div>
  </main>
</div>
