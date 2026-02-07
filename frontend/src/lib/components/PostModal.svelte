<script>
  import { onMount } from 'svelte';
  import pb from '$lib/pocketbase';
  import { Heart, MessageCircle, X, MoreVertical, Trash2 } from 'lucide-svelte';
  import { notifyLike, notifyComment } from '$lib/notifications';

  export let postId;
  export let onClose;
  export let onDelete = null;

  let post = null;
  let comments = [];
  let loading = true;
  let commentText = '';
  let isLiked = false;
  let likesCount = 0;
  let likeRecordId = null;
  let currentUser = pb.authStore.model;
  let submittingComment = false;
  let showDeleteMenu = false;
  let deleting = false;
  let commentInputRef;

  $: isOwnPost = post && currentUser && post.user === currentUser.id;

  onMount(async () => {
    await loadPost();
    await loadComments();
    await checkIfLiked();

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (showDeleteMenu) {
          showDeleteMenu = false;
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    
    const handleClickOutside = (e) => {
      if (showDeleteMenu && !e.target.closest('.delete-menu-container')) {
        showDeleteMenu = false;
      }
    };
    document.addEventListener('click', handleClickOutside);
    
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.removeEventListener('click', handleClickOutside);
    };
  });

  async function loadPost() {
    try {
      post = await pb.collection('posts').getOne(postId, {
        expand: 'user'
      });
      likesCount = await getLikesCount();
    } catch (err) {
      console.error('Failed to load post:', err);
    } finally {
      loading = false;
    }
  }

  async function loadComments() {
    try {
      const result = await pb.collection('comments').getList(1, 50, {
        filter: `post = "${postId}"`,
        sort: 'created',
        expand: 'user'
      });
      comments = result.items;
    } catch (err) {
      console.error('Failed to load comments:', err);
    }
  }

  async function getLikesCount() {
    try {
      const result = await pb.collection('likes').getList(1, 1, {
        filter: `post = "${postId}"`
      });
      return result.totalItems;
    } catch (err) {
      return 0;
    }
  }

  async function checkIfLiked() {
    try {
      const result = await pb.collection('likes').getList(1, 1, {
        filter: `post = "${postId}" && user = "${currentUser.id}"`
      });
      if (result.items.length > 0) {
        isLiked = true;
        likeRecordId = result.items[0].id;
      }
    } catch (err) {
      console.error('Failed to check like status:', err);
    }
  }

  async function toggleLike() {
    if (isLiked) {
      // Unlike
      try {
        await pb.collection('likes').delete(likeRecordId);
        isLiked = false;
        likeRecordId = null;
        likesCount = Math.max(0, likesCount - 1);
      } catch (err) {
        console.error('Failed to unlike:', err);
      }
    } else {
      // Like
      try {
        const like = await pb.collection('likes').create({
          post: postId,
          user: currentUser.id
        });
        
        isLiked = true;
        likeRecordId = like.id;
        likesCount += 1;

        // Use notification helper (non-blocking)
        if (post.user !== currentUser.id) {
          notifyLike(
            post.user,
            currentUser.id,
            currentUser.username,
            postId
          ).catch(err => {
            console.error('Failed to send like notification:', err);
          });
        }
      } catch (err) {
        console.error('Failed to like:', err);
      }
    }
  }

  async function handleComment() {
    if (!commentText.trim() || submittingComment) return;

    submittingComment = true;

    try {
      const comment = await pb.collection('comments').create({
        post: postId,
        user: currentUser.id,
        text: commentText.trim()
      });

      const expandedComment = await pb.collection('comments').getOne(comment.id, {
        expand: 'user'
      });

      comments = [...comments, expandedComment];
      commentText = '';

      // ✅ Use notification helper (non-blocking)
      if (post.user !== currentUser.id) {
        notifyComment(
          post.user,
          currentUser.id,
          currentUser.username,
          postId
        ).catch(err => {
          console.error('Failed to send comment notification:', err);
        });
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
      alert('Failed to post comment. Please try again.');
    } finally {
      submittingComment = false;
    }
  }

  async function handleDeletePost() {
    if (!isOwnPost || deleting) return;

    showDeleteMenu = false;
    
    const confirmDelete = confirm('Are you sure you want to delete this post? This action cannot be undone.');
    
    if (!confirmDelete) return;

    deleting = true;

    try {
      await pb.collection('posts').delete(postId);
      
      if (onDelete) {
        onDelete(postId);
      }
      
      onClose();
    } catch (err) {
      console.error('Failed to delete post:', err);
      alert('Failed to delete post. Please try again.');
      deleting = false;
    }
  }

  // ✅ NEW: Delete comment function
  async function deleteComment(commentId) {
    const confirmDelete = confirm('Are you sure you want to delete this comment?');
    
    if (!confirmDelete) return;

    try {
      await pb.collection('comments').delete(commentId);
      
      // Remove from local state
      comments = comments.filter(c => c.id !== commentId);
      
      console.log('Comment deleted successfully');
    } catch (err) {
      console.error('Failed to delete comment:', err);
      alert('Failed to delete comment. Please try again.');
    }
  }

  function focusCommentInput() {
    if (commentInputRef) {
      commentInputRef.focus();
    }
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function toggleDeleteMenu(e) {
    e.stopPropagation();
    showDeleteMenu = !showDeleteMenu;
  }
</script>

<div
  class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
  on:click={handleBackdropClick}
  role="dialog"
  aria-modal="true"
>
  <div class="bg-background rounded-lg max-w-5xl w-full max-h-[90vh] flex overflow-hidden shadow-2xl" on:click|stopPropagation>
    {#if loading}
      <div class="flex-1 flex items-center justify-center p-20">
        <p class="text-muted-foreground">Loading post...</p>
      </div>
    {:else if post}
      <div class="flex-1 bg-black flex items-center justify-center min-w-0">
        <img
          src={pb.files.getUrl(post, post.image)}
          alt={post.caption || 'Post'}
          class="max-w-full max-h-[90vh] w-auto h-auto object-contain"
        />
      </div>

      <div class="w-[400px] flex flex-col border-l border-border">
        <div class="p-4 border-b border-border flex items-center gap-3">
          <img
            src={post.expand?.user?.avatar
              ? pb.files.getUrl(post.expand.user, post.expand.user.avatar)
              : '/images/profilePlaceholder.jpg'}
            alt={post.expand?.user?.username}
            class="w-10 h-10 rounded-full object-cover"
          />
          <a href="/profile/{post.expand?.user?.username}" class="font-semibold hover:opacity-70 text-foreground" on:click={onClose}>
            {post.expand?.user?.username}
          </a>
          
          <div class="ml-auto flex items-center gap-2">
            {#if isOwnPost}
              <div class="relative delete-menu-container">
                <button 
                  on:click={toggleDeleteMenu}
                  class="hover:bg-muted rounded-full p-1.5 transition-colors"
                  aria-label="More options"
                >
                  <MoreVertical class="w-5 h-5 text-foreground" />
                </button>

                {#if showDeleteMenu}
                  <div class="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-20 min-w-[180px]">
                    <button
                      on:click={handleDeletePost}
                      disabled={deleting}
                      class="w-full px-4 py-3 text-left hover:bg-muted flex items-center gap-3 text-red-500 font-semibold disabled:opacity-50 transition-colors"
                    >
                      <Trash2 class="w-4 h-4" />
                      <span class="text-sm">{deleting ? 'Deleting...' : 'Delete'}</span>
                    </button>
                  </div>
                {/if}
              </div>
            {/if}

            <button on:click={onClose} class="hover:bg-muted rounded-full p-1.5 transition-colors" aria-label="Close">
              <X class="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          {#if post.caption}
            <div class="flex gap-3">
              <img
                src={post.expand?.user?.avatar
                  ? pb.files.getUrl(post.expand.user, post.expand.user.avatar)
                  : '/images/profilePlaceholder.jpg'}
                alt={post.expand?.user?.username}
                class="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
              <div class="flex-1 min-w-0">
                <div>
                  <a href="/profile/{post.expand?.user?.username}" class="font-semibold hover:opacity-70 text-foreground" on:click={onClose}>
                    {post.expand?.user?.username}
                  </a>
                  <span class="ml-2 text-foreground">{post.caption}</span>
                </div>
                <p class="text-xs text-muted-foreground mt-1">{formatDate(post.created)}</p>
              </div>
            </div>
          {/if}

          {#each comments as comment}
            <div class="flex gap-3 group relative">
              <img
                src={comment.expand?.user?.avatar
                  ? pb.files.getUrl(comment.expand.user, comment.expand.user.avatar)
                  : '/images/profilePlaceholder.jpg'}
                alt={comment.expand?.user?.username}
                class="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1">
                    <a href="/profile/{comment.expand?.user?.username}" class="font-semibold hover:opacity-70 text-foreground" on:click={onClose}>
                      {comment.expand?.user?.username}
                    </a>
                    <span class="ml-2 text-foreground">{comment.text}</span>
                  </div>
                  
                  <!-- ✅ Delete button with Trash2 icon (only show for comment owner) -->
                  {#if comment.user === currentUser.id}
                    <button
                      on:click={() => deleteComment(comment.id)}
                      class="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-500/10 rounded-full"
                      aria-label="Delete comment"
                      title="Delete comment"
                    >
                      <Trash2 class="w-4 h-4 text-red-500" strokeWidth={2} />
                    </button>
                  {/if}
                </div>
                <p class="text-xs text-muted-foreground mt-1">{formatDate(comment.created)}</p>
              </div>
            </div>
          {/each}

          {#if comments.length === 0 && !post.caption}
            <p class="text-muted-foreground text-sm text-center py-8">No comments yet. Be the first to comment!</p>
          {/if}
        </div>

        <div class="border-t border-border">
          <div class="p-3 flex items-center gap-4">
            <button 
              on:click={toggleLike} 
              class="hover:opacity-70 transition-all active:scale-110" 
              aria-label={isLiked ? 'Unlike' : 'Like'}
            >
              <Heart 
                class="w-7 h-7 {isLiked ? 'fill-red-500 text-red-500' : 'text-foreground'}" 
                strokeWidth={1.5}
              />
            </button>
            <button 
              on:click={focusCommentInput}
              class="hover:opacity-70 transition-all active:scale-110" 
              aria-label="Comment"
            >
              <MessageCircle class="w-7 h-7 text-foreground" strokeWidth={1.5} />
            </button>
          </div>

          <div class="px-4 pb-3">
            {#if likesCount > 0}
              <p class="font-semibold text-sm text-foreground">{likesCount} {likesCount === 1 ? 'like' : 'likes'}</p>
            {:else}
              <p class="text-sm text-muted-foreground">Be the first to like this</p>
            {/if}
            <p class="text-xs text-muted-foreground mt-1">{formatDate(post.created)}</p>
          </div>

          <div class="p-3 border-t border-border flex gap-3 items-center">
            <input
              bind:this={commentInputRef}
              type="text"
              bind:value={commentText}
              placeholder="Add a comment..."
              class="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
              on:keypress={(e) => e.key === 'Enter' && handleComment()}
              disabled={submittingComment}
            />
            <button
              on:click={handleComment}
              disabled={!commentText.trim() || submittingComment}
              class="text-primary font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-70"
            >
              {submittingComment ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    {:else}
      <div class="flex-1 flex items-center justify-center p-20">
        <p class="text-muted-foreground">Post not found</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .overflow-y-auto {
    scrollbar-width: thin;
    scrollbar-color: rgba(155, 155, 155, 0.3) transparent;
  }

  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }

  .overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb {
    background-color: rgba(155, 155, 155, 0.3);
    border-radius: 3px;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background-color: rgba(155, 155, 155, 0.5);
  }
</style>