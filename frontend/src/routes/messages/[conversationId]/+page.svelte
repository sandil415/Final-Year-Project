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

    await loadConversation(conversationId);
    await loadMessages(conversationId);
    await subscribeToMessages(conversationId);

    scrollToBottom();
  });

  onDestroy(async () => {
    unsubscribe?.();
  });

  async function loadConversation(convoId) {
    conversation = await pb.collection('conversations').getOne(convoId, { expand: 'participants' });
    otherUser = conversation.expand.participants.find(p => p.id !== currentUser.id);
    loading = false;
  }

  async function loadMessages(convoId) {
    const res = await pb.collection('messages').getList(1, 100, { 
      filter: `conversation = "${convoId}"`, 
      sort: 'created' 
    });
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

    try {
      // 1. Create the message
      await pb.collection('messages').create({
        conversation: conversation.id,
        sender: currentUser.id,
        content,
        type: 'text',
        read: false
      });

      // 2. Update conversation
      await pb.collection('conversations').update(conversation.id, {
        lastMessage: content,
        lastMessageTime: new Date().toISOString()
      });

      // 3. ✅ NEW: Create notification for the other user
      await createMessageNotification(content);

      scrollToBottom();
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('Failed to send message. Please try again.');
    }
  }

  // ✅ NEW: Function to create message notification
  async function createMessageNotification(messageContent) {
    try {
      // Don't notify yourself
      if (!otherUser || otherUser.id === currentUser.id) return;

      // Create notification for the other user
      await pb.collection('notifications').create({
        user: otherUser.id,
        triggeredBy: currentUser.id,
        type: 'message',
        message: `${currentUser.username} sent you a message: "${messageContent.slice(0, 50)}${messageContent.length > 50 ? '...' : ''}"`,
        read: false,
        relatedConversation: conversation.id  // Link to conversation
      });

      console.log('Message notification created for:', otherUser.username);
    } catch (err) {
      console.error('Failed to create message notification:', err);
      // Don't throw - notification failure shouldn't break messaging
    }
  }

  function scrollToBottom() {
    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="h-screen flex bg-background">
  <Sidebar />
  
  <main class="flex-1 flex flex-col">
    <!-- Chat Header -->
    {#if otherUser}
      <div class="border-b border-border p-4 flex items-center gap-3">
        <img
          src={otherUser.avatar
            ? pb.files.getUrl(otherUser, otherUser.avatar)
            : '/images/profilePlaceholder.jpg'}
          alt={otherUser.username}
          class="w-10 h-10 rounded-full object-cover"
        />
        <div>
          <h2 class="font-semibold text-foreground">{otherUser.username}</h2>
          <p class="text-xs text-muted-foreground">Active now</p>
        </div>
      </div>
    {/if}

    <!-- Messages -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4" bind:this={messagesContainer}>
      {#each messages as m}
        <div class="{m.sender === currentUser.id ? 'text-right' : 'text-left'}">
          <div class="inline-block max-w-[70%]">
            <div class="px-4 py-2 rounded-2xl {m.sender === currentUser.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}">
              {#if m.type === 'text'} 
                {m.content} 
              {/if}
              {#if m.type === 'image'} 
                <img src={pb.files.getUrl(m, m.media)} class="max-w-xs rounded-lg" alt="Image"/> 
              {/if}
              {#if m.type === 'video'} 
                <video src={pb.files.getUrl(m, m.media)} controls class="max-w-xs rounded-lg"/> 
              {/if}
            </div>
            <div class="text-xs text-muted-foreground mt-1 px-2">
              {new Date(m.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Input -->
    <div class="p-4 flex gap-2 border-t border-border">
      <input 
        type="text" 
        bind:value={messageInput} 
        on:keypress={handleKeyPress}
        placeholder="Message..." 
        class="flex-1 px-4 py-2 rounded-full bg-muted outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
      />
      <button 
        on:click={sendMessage} 
        disabled={!messageInput.trim()}
        class="px-6 py-2 bg-primary text-primary-foreground rounded-full font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        Send
      </button>
    </div>
  </main>
</div>