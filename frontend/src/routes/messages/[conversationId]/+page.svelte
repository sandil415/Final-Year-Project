<script>
  import Sidebar from '$lib/components/Sidebar.svelte';
  import pb from '$lib/pocketbase';
  import { onMount, onDestroy } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  let messages = [];
  let conversation = null;
  let otherUser = null;
  let currentUser = null;
  let loading = true;
  let messageInput = '';
  let messagesContainer;
  let unsubscribe;
  let fileInput;
  let uploading = false;
  
  // Edit state
  let editingMessageId = null;
  let editingContent = '';

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.model;
    
    console.log('Current User:', currentUser);
    
    const conversationId = $page.params.conversationId;
    await loadConversation(conversationId);
    await loadMessages(conversationId);
    await subscribeToMessages(conversationId);
    
    scrollToBottom();
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  async function loadConversation(conversationId) {
    try {
      conversation = await pb.collection('conversations').getOne(conversationId, {
        expand: 'participants'
      });

      console.log('Conversation loaded:', conversation);

      if (conversation.expand?.participants) {
        otherUser = conversation.expand.participants.find(p => p.id !== currentUser.id);
        console.log('Other user:', otherUser);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
      goto('/messages');
    }
  }

  async function loadMessages(conversationId) {
    try {
      const records = await pb.collection('messages').getList(1, 100, {
        filter: `conversation = "${conversationId}"`,
        sort: 'created'
      });

      messages = records.items;
      loading = false;
      
      console.log('Messages loaded:', messages.length);
      
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Failed to load messages:', err);
      loading = false;
    }
  }

  // WebSocket subscription for real-time updates
  async function subscribeToMessages(conversationId) {
    try {
      unsubscribe = await pb.collection('messages').subscribe('*', async (e) => {
        console.log('WebSocket event:', e.action, e.record);
        
        if (e.record.conversation !== conversationId) {
          return;
        }

        if (e.action === 'create') {
          messages = [...messages, e.record];
          setTimeout(scrollToBottom, 100);
        } else if (e.action === 'update') {
          messages = messages.map(msg => 
            msg.id === e.record.id ? { ...msg, ...e.record } : msg
          );
        } else if (e.action === 'delete') {
          messages = messages.filter(msg => msg.id !== e.record.id);
        }
      }, {
        filter: `conversation = "${conversationId}"`
      });

      console.log('WebSocket subscribed successfully');
    } catch (err) {
      console.error('Failed to subscribe to messages:', err);
    }
  }

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  async function sendMessage() {
    if (!messageInput.trim() || !conversation) return;

    const content = messageInput.trim();
    messageInput = '';

    console.log('Sending message as:', currentUser.id, currentUser.username);

    try {
      const newMessage = await pb.collection('messages').create({
        conversation: conversation.id,
        sender: currentUser.id,
        content: content,
        type: 'text',
        read: false
      });

      console.log('Message sent:', newMessage);

      await pb.collection('conversations').update(conversation.id, {
        lastMessage: content,
        lastMessageTime: new Date().toISOString()
      });

      scrollToBottom();
    } catch (err) {
      console.error('Failed to send message:', err);
      messageInput = content;
      alert('Failed to send message. Please try again.');
    }
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ✏️ START EDITING
  function startEdit(message) {
    if (message.sender !== currentUser.id || message.type !== 'text') return;
    
    editingMessageId = message.id;
    editingContent = message.content;
  }

  // ❌ CANCEL EDITING
  function cancelEdit() {
    editingMessageId = null;
    editingContent = '';
  }

  // ✅ SAVE EDIT
  async function saveEdit(messageId) {
    if (!editingContent.trim()) {
      alert('Message cannot be empty');
      return;
    }

    try {
      await pb.collection('messages').update(messageId, {
        content: editingContent.trim()
      });

      // Update last message in conversation if it's the most recent
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.id === messageId) {
        await pb.collection('conversations').update(conversation.id, {
          lastMessage: editingContent.trim()
        });
      }

      editingMessageId = null;
      editingContent = '';
    } catch (err) {
      console.error('Failed to update message:', err);
      alert('Failed to update message. Please try again.');
    }
  }

  // 🗑️ DELETE MESSAGE
  async function deleteMessage(messageId) {
    if (!confirm('Delete this message?')) return;

    try {
      await pb.collection('messages').delete(messageId);

      // If it was the last message, update conversation
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.id === messageId) {
        const remainingMessages = messages.filter(m => m.id !== messageId);
        const newLastMsg = remainingMessages[remainingMessages.length - 1];
        
        await pb.collection('conversations').update(conversation.id, {
          lastMessage: newLastMsg?.content || 'Message deleted',
          lastMessageTime: newLastMsg?.created || new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
      alert('Failed to delete message. Please try again.');
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !conversation) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      alert('Please upload an image or video file');
      return;
    }

    uploading = true;

    try {
      const formData = new FormData();
      formData.append('conversation', conversation.id);
      formData.append('sender', currentUser.id);
      formData.append('content', '');
      formData.append('type', isImage ? 'image' : 'video');
      formData.append('media', file);
      formData.append('read', false);

      await pb.collection('messages').create(formData);

      const mediaText = isImage ? '📷 Photo' : '🎥 Video';
      await pb.collection('conversations').update(conversation.id, {
        lastMessage: mediaText,
        lastMessageTime: new Date().toISOString()
      });

      scrollToBottom();
    } catch (err) {
      console.error('Failed to upload media:', err);
      alert('Failed to send media. Please try again.');
    } finally {
      uploading = false;
      if (fileInput) fileInput.value = '';
    }
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }
</script>

<!-- Fixed height container for the entire page -->
<div class="h-screen flex bg-background text-foreground overflow-hidden">
  <Sidebar />

  <main class="flex-1 flex flex-col min-w-0">
    {#if loading}
      <div class="flex-1 flex items-center justify-center">
        <p class="text-muted-foreground">Loading conversation...</p>
      </div>
    {:else if otherUser}
      <!-- CHAT HEADER - Fixed height -->
      <div class="border-b border-border p-4 flex items-center gap-3 flex-shrink-0">
        <button on:click={() => goto('/messages')} class="hover:opacity-70">
          ←
        </button>
        <img
          src={otherUser.avatar
            ? pb.files.getUrl(otherUser, otherUser.avatar)
            : '/images/profilePlaceholder.jpg'}
          alt={otherUser.username}
          class="w-10 h-10 rounded-full object-cover"
        />
        <button 
          class="font-semibold hover:opacity-70"
          on:click={() => goto(`/profile/${otherUser.username}`)}
        >
          {otherUser.username}
        </button>
        <div class="ml-auto text-xs text-muted-foreground">
          Logged in as: {currentUser?.username}
        </div>
      </div>

      <!-- MESSAGES - Scrollable area with flex-1 -->
      <div 
        bind:this={messagesContainer}
        class="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
      >
        {#if messages.length === 0}
          <div class="text-center text-muted-foreground py-20">
            <p>No messages yet. Start the conversation!</p>
          </div>
        {/if}

        {#each messages as message}
          {@const isOwn = message.sender === currentUser.id}
          {@const isEditing = editingMessageId === message.id}
          
          <div class="flex {isOwn ? 'justify-end' : 'justify-start'} group">
            <div class="relative max-w-md">
              <div class="{isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'} 
                          rounded-2xl px-4 py-2 break-words">
                
                {#if isEditing}
                  <!-- EDIT MODE -->
                  <div class="space-y-2">
                    <textarea
                      bind:value={editingContent}
                      class="w-full bg-transparent border border-current rounded p-2 resize-none"
                      rows="3"
                      autofocus
                    />
                    <div class="flex gap-2 justify-end">
                      <button
                        on:click={cancelEdit}
                        class="px-3 py-1 text-xs rounded hover:opacity-70"
                      >
                        Cancel
                      </button>
                      <button
                        on:click={() => saveEdit(message.id)}
                        class="px-3 py-1 text-xs rounded bg-white/20 hover:bg-white/30"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                {:else}
                  <!-- NORMAL VIEW -->
                  {#if message.type === 'text'}
                    <p class="whitespace-pre-wrap">{message.content}</p>
                  {:else if message.type === 'image'}
                    <img
                      src={pb.files.getUrl(message, message.media)}
                      alt="Shared image"
                      class="rounded-lg max-w-full cursor-pointer"
                      on:click={() => window.open(pb.files.getUrl(message, message.media), '_blank')}
                    />
                  {:else if message.type === 'video'}
                    <video
                      src={pb.files.getUrl(message, message.media)}
                      controls
                      class="rounded-lg max-w-full"
                    />
                  {/if}
                  
                  <div class="flex items-center gap-2 text-xs opacity-70 mt-1">
                    <span>{formatTime(message.created)}</span>
                    {#if message.updated !== message.created}
                      <span class="text-[10px]">(edited)</span>
                    {/if}
                  </div>
                {/if}
              </div>

              <!-- EDIT/DELETE BUTTONS (only for own text messages) -->
              {#if isOwn && message.type === 'text' && !isEditing}
                <div class="flex gap-2 mt-1 justify-end text-xs opacity-70">
                  <button
                    on:click={() => startEdit(message)}
                    class="p-1.5 hover:bg-muted rounded text-sm"
                    title="Edit message"
                  >
                    Edit
                  </button>
                  <button
                    on:click={() => deleteMessage(message.id)}
                    class="p-1.5 hover:bg-muted rounded text-sm"
                    title="Delete message"
                  >
                    Delete
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- INPUT - Fixed height -->
      <div class="border-t border-border p-4 flex items-center gap-2 flex-shrink-0">
        <input
          type="file"
          bind:this={fileInput}
          on:change={handleFileUpload}
          accept="image/*,video/*"
          class="hidden"
        />

        <button
          on:click={() => fileInput?.click()}
          disabled={uploading}
          class="p-2 hover:bg-muted rounded-full disabled:opacity-50"
          title="Upload image or video"
        >
          {uploading ? '...' : '+'}
        </button>

        <input
          type="text"
          bind:value={messageInput}
          on:keypress={handleKeyPress}
          placeholder="Message..."
          class="flex-1 px-4 py-2 rounded-full bg-muted outline-none"
        />

        <button
          on:click={sendMessage}
          disabled={!messageInput.trim()}
          class="px-4 py-2 font-semibold text-primary disabled:opacity-50 hover:opacity-70"
        >
          Send
        </button>
      </div>
    {:else}
      <div class="flex-1 flex items-center justify-center">
        <p class="text-muted-foreground">Conversation not found</p>
      </div>
    {/if}
  </main>
</div>