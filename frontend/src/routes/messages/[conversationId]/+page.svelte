<script>
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { requireAuth } from '$lib/auth';
  import { goto } from '$app/navigation';
  import { notifyMessage } from '$lib/Notifications.js';
  import Header from '$lib/components/Header.svelte';
  import { ArrowLeftIcon, ChatTeardropIcon, PaperPlaneRightIcon } from 'phosphor-svelte';

  let messages = [], conversation = null, currentUser = null;
  let otherUser = null, loading = true, messageInput = '';
  let messagesContainer, unsubscribe;

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.model;
    const conversationId = $page.params.conversationId;

    await setActiveConversation(conversationId);
    await loadConversation(conversationId);
    await loadMessages(conversationId);
    await subscribeToMessages(conversationId);

    scrollToBottom();
  });

  onDestroy(async () => {
    unsubscribe?.();
    await clearActiveConversation();
  });

  async function setActiveConversation(conversationId) {
    try {
      await pb.collection('users').update(currentUser.id, {
        activeConversation: conversationId
      });
    } catch (err) {
      console.error('Failed to set active conversation:', err);
    }
  }

  async function clearActiveConversation() {
    try {
      await pb.collection('users').update(currentUser.id, {
        activeConversation: null
      });
    } catch (err) {
      console.error('Failed to clear active conversation:', err);
    }
  }

  async function loadConversation(convoId) {
    try {
      conversation = await pb.collection('conversations').getOne(convoId, {
        expand: 'participants'
      });
      otherUser = conversation.expand.participants.find(p => p.id !== currentUser.id);
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      loading = false;
    }
  }

  async function loadMessages(convoId) {
    try {
      const res = await pb.collection('messages').getList(1, 100, {
        filter: `conversation = "${convoId}"`,
        sort: 'created'
      });
      messages = res.items;
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
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

      notifyMessage(
        otherUser.id,
        currentUser.id,
        currentUser.username,
        content,
        conversation.id
      ).catch(err => {
        console.error('Notification failed (non-critical):', err);
      });

      scrollToBottom();
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('Failed to send message. Please try again.');
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

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else goto('/messages');
  }
</script>

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />

  <main class="flex-1 flex flex-col overflow-hidden">
    <div class="max-w-7xl mx-auto w-full px-6 flex flex-col flex-1 overflow-hidden">

      <!-- Top bar — mirrors messages/+page.svelte exactly -->
      <div class="flex-shrink-0 border-b border-border py-3 flex items-center gap-3">
        <button on:click={goBack} class="p-2 hover:bg-muted rounded-full transition-colors">
          <ArrowLeftIcon size={20} />
        </button>

        {#if loading}
          <div class="w-10 h-10 rounded-full bg-muted animate-pulse flex-shrink-0"></div>
          <div class="flex-1 space-y-1.5">
            <div class="h-3.5 w-28 rounded bg-muted animate-pulse"></div>
            <div class="h-3 w-16 rounded bg-muted animate-pulse"></div>
          </div>
        {:else if otherUser}
          <img
            src={otherUser.avatar
              ? pb.files.getUrl(otherUser, otherUser.avatar)
              : '/images/profilePlaceholder.jpg'}
            alt={otherUser.username}
            class="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-1 ring-border"
          />
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm text-foreground truncate">{otherUser.username}</p>
            <p class="text-xs text-muted-foreground">
              {#if otherUser.accountType === 'business'}
                {otherUser.businessName || 'Business'}
              {:else}
                @{otherUser.username}
              {/if}
            </p>
          </div>
        {/if}
      </div>

      <!-- Message list -->
      <div
        class="flex-1 overflow-y-auto py-4 space-y-2 min-h-0"
        bind:this={messagesContainer}
      >
        {#if messages.length === 0 && !loading}
          <div class="flex flex-col items-center justify-center h-full text-center py-16">
            <div class="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <ChatTeardropIcon size={28} class="text-muted-foreground" />
            </div>
            <p class="font-semibold text-sm text-foreground mb-1">No messages yet</p>
            <p class="text-xs text-muted-foreground">Say hello to {otherUser?.username || 'them'}!</p>
          </div>
        {:else}
          {#each messages as m (m.id)}
            {@const own = m.sender === currentUser?.id}
            <div class="flex {own ? 'justify-end' : 'justify-start'} items-end gap-2">

              {#if !own}
                <img
                  src={otherUser?.avatar
                    ? pb.files.getUrl(otherUser, otherUser.avatar)
                    : '/images/profilePlaceholder.jpg'}
                  alt=""
                  class="w-7 h-7 rounded-full object-cover flex-shrink-0 mb-1"
                />
              {/if}

              <div class="flex flex-col {own ? 'items-end' : 'items-start'} max-w-[68%]">
                <div
                  class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words
                    {own ? 'rounded-br-md text-white' : 'rounded-bl-md bg-muted text-foreground'}"
                  style={own ? 'background-color: #FF6B35;' : ''}
                >
                  {#if m.type === 'text' || !m.type}
                    {m.content}
                  {:else if m.type === 'image'}
                    <img src={pb.files.getUrl(m, m.media)} class="max-w-xs rounded-xl" alt="Image" />
                  {:else if m.type === 'video'}
                    <video src={pb.files.getUrl(m, m.media)} controls class="max-w-xs rounded-xl" />
                  {/if}
                </div>
                <span class="text-[10px] text-muted-foreground mt-1 px-1">
                  {new Date(m.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {#if own}
                <div class="w-7 flex-shrink-0"></div>
              {/if}

            </div>
          {/each}
        {/if}
      </div>

      <!-- Input bar -->
      <div class="flex-shrink-0 border-t border-border py-3 flex items-center gap-2">
        <input
          type="text"
          bind:value={messageInput}
          on:keypress={handleKeyPress}
          placeholder="Message {otherUser?.username || ''}…"
          class="flex-1 px-4 py-2.5 rounded-full bg-muted outline-none text-sm text-foreground
                 placeholder:text-muted-foreground focus:ring-2 focus:ring-border transition-shadow"
        />
        <button
          on:click={sendMessage}
          disabled={!messageInput.trim()}
          class="w-10 h-10 rounded-full flex items-center justify-center text-white
                 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
          style="background-color: #FF6B35;"
          aria-label="Send message"
        >
          <PaperPlaneRightIcon size={20} weight="fill" color="white" />
        </button>
      </div>

    </div>
  </main>
</div>