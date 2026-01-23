<script>
  import Sidebar from '$lib/components/Sidebar.svelte';
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { requireAuth } from '$lib/auth';
  import { goto } from '$app/navigation';

  let messages = [], conversation = null, currentUser = null;
  let otherUser = null, loading = true, messageInput = '';
  let messagesContainer, unsubscribe, fileInput, uploading = false;

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.model;
    const conversationId = $page.params.conversationId;

    // Mark as active conversation
    await pb.collection('users').update(currentUser.id, { activeConversation: conversationId });

    await loadConversation(conversationId);
    await loadMessages(conversationId);
    await subscribeToMessages(conversationId);

    scrollToBottom();
  });

  onDestroy(async () => {
    unsubscribe?.();
    // Clear active conversation
    await pb.collection('users').update(currentUser.id, { activeConversation: null });
  });

  async function loadConversation(convoId) {
    conversation = await pb.collection('conversations').getOne(convoId, { expand: 'participants' });
    otherUser = conversation.expand.participants.find(p => p.id !== currentUser.id);
    loading = false;
  }

  async function loadMessages(convoId) {
    const res = await pb.collection('messages').getList(1, 100, { filter: `conversation = "${convoId}"`, sort: 'created' });
    messages = res.items;
    setTimeout(scrollToBottom, 100);
  }

  async function subscribeToMessages(convoId) {
    unsubscribe = await pb.collection('messages').subscribe('*', (e) => {
      if (e.record.conversation !== convoId) return;
      if (e.action === 'create') messages = [...messages, e.record];
      if (e.action === 'update') messages = messages.map(m => m.id === e.record.id ? e.record : m);
      if (e.action === 'delete') messages = messages.filter(m => m.id !== e.record.id);
      setTimeout(scrollToBottom, 100);
    }, { filter: `conversation = "${convoId}"` });
  }

  async function sendMessage() {
    if (!messageInput.trim() || !conversation) return;

    const content = messageInput.trim();
    messageInput = '';

    await pb.collection('messages').create({
      conversation: conversation.id,
      sender: currentUser.id,
      content,
      type: 'text',
      read: false
    });

    await pb.collection('conversations').update(conversation.id, {
      lastMessage: content,
      lastMessageTime: new Date().toISOString()
    });

    scrollToBottom();
  }

  function scrollToBottom() {
    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
</script>

<div class="h-screen flex bg-background">
  <Sidebar />
  <main class="flex-1 flex flex-col">
    <div class="flex-1 overflow-y-auto p-4" bind:this={messagesContainer}>
      {#each messages as m}
        <div class="{m.sender === currentUser.id ? 'text-right' : 'text-left'} mb-2">
          <div class="inline-block px-4 py-2 rounded-2xl {m.sender === currentUser.id ? 'bg-primary text-white' : 'bg-muted'}">
            {#if m.type === 'text'} {m.content} {/if}
            {#if m.type === 'image'} <img src={pb.files.getUrl(m, m.media)} class="max-w-xs rounded-lg"/> {/if}
            {#if m.type === 'video'} <video src={pb.files.getUrl(m, m.media)} controls class="max-w-xs rounded-lg"/> {/if}
          </div>
          <div class="text-xs text-muted-foreground">{new Date(m.created).toLocaleTimeString()}</div>
        </div>
      {/each}
    </div>
    <div class="p-4 flex gap-2 border-t border-border">
      <input type="text" bind:value={messageInput} on:keypress={(e) => e.key==='Enter' && sendMessage()} placeholder="Message..." class="flex-1 px-4 py-2 rounded-full bg-muted outline-none"/>
      <button on:click={sendMessage} class="px-4 py-2 bg-primary text-white rounded-full">Send</button>
    </div>
  </main>
</div>
