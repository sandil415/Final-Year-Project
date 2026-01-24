<script>
  import { onMount } from 'svelte';
  import pb from '$lib/pocketbase';

  export let postId;
  export let onClose;

  let post = null;
  let comments = [];
  let loading = true;
  let commentText = '';
  let isLiked = false;
  let likesCount = 0;
  let likeRecordId = null;
  let currentUser = pb.authStore.model;
  let submittingComment = false;

  onMount(async () => {
    await loadPost();
    await loadComments();
    await checkIfLiked();

    // Close on ESC key
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
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
      try {
        await pb.collection('likes').delete(likeRecordId);
        isLiked = false;
        likeRecordId = null;
        likesCount = Math.max(0, likesCount - 1);
      } catch (err) {
        console.error('Failed to unlike:', err);
      }
    } else {
      try {
        const like = await pb.collection('likes').create({
          post: postId,
          user: currentUser.id
        });
        isLiked = true;
        likeRecordId = like.id;
        likesCount += 1;

        // Create notification if not own post
        if (post.user !== currentUser.id) {
          try {
            await pb.collection('notifications').create({
              user: post.user,
              triggeredBy: currentUser.id,
              type: 'like',
              post: postId,
              message: `${currentUser.username} liked your post.`,
              read: false
            });
          } catch (notifErr) {
            console.error('Failed to create notification:', notifErr);
          }
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

      // Expand user for display
      const expandedComment = await pb.collection('comments').getOne(comment.id, {
        expand: 'user'
      });

      comments = [...comments, expandedComment];
      commentText = '';

      // Create notification if not own post
      if (post.user !== currentUser.id) {
        try {
          await pb.collection('notifications').create({
            user: post.user,
            triggeredBy: currentUser.id,
            type: 'comment',
            post: postId,
            message: `${currentUser.username} commented on your post.`,
            read: false
          });
        } catch (notifErr) {
          console.error('Failed to create notification:', notifErr);
        }
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
      alert('Failed to post comment. Please try again.');
    } finally {
      submittingComment = false;
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
</script>

<!-- Modal Backdrop -->
<div
  class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
  on:click={handleBackdropClick}
  role="dialog"
  aria-modal="true"
>
  <!-- Modal Content -->
  <div class="bg-background rounded-lg max-w-5xl w-full max-h-[90vh] flex overflow-hidden shadow-2xl" on:click|stopPropagation>
    {#if loading}
      <div class="flex-1 flex items-center justify-center p-20">
        <p class="text-muted-foreground">Loading post...</p>
      </div>
    {:else if post}
      <!-- Left Side: Image -->
      <div class="flex-1 bg-black flex items-center justify-center min-w-0">
        <img
          src={pb.files.getUrl(post, post.image)}
          alt={post.caption || 'Post'}
          class="max-w-full max-h-[90vh] w-auto h-auto object-contain"
        />
      </div>

      <!-- Right Side: Details, Comments, Actions -->
      <div class="w-[400px] flex flex-col border-l border-border">
        <!-- Header: User Info -->
        <div class="p-4 border-b border-border flex items-center gap-3">
          <img
            src={post.expand?.user?.avatar
              ? pb.files.getUrl(post.expand.user, post.expand.user.avatar)
              : '/images/profilePlaceholder.jpg'}
            alt={post.expand?.user?.username}
            class="w-10 h-10 rounded-full object-cover"
          />
          <a href="/profile/{post.expand?.user?.username}" class="font-semibold hover:opacity-70" on:click={onClose}>
            {post.expand?.user?.username}
          </a>
          <button on:click={onClose} class="ml-auto text-2xl hover:opacity-70 leading-none" aria-label="Close">
            ✕
          </button>
        </div>

        <!-- Comments Section -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <!-- Post Caption -->
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
                  <a href="/profile/{post.expand?.user?.username}" class="font-semibold hover:opacity-70" on:click={onClose}>
                    {post.expand?.user?.username}
                  </a>
                  <span class="ml-2">{post.caption}</span>
                </div>
                <p class="text-xs text-muted-foreground mt-1">{formatDate(post.created)}</p>
              </div>
            </div>
          {/if}

          <!-- Comments -->
          {#each comments as comment}
            <div class="flex gap-3">
              <img
                src={comment.expand?.user?.avatar
                  ? pb.files.getUrl(comment.expand.user, comment.expand.user.avatar)
                  : '/images/profilePlaceholder.jpg'}
                alt={comment.expand?.user?.username}
                class="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
              <div class="flex-1 min-w-0">
                <div>
                  <a href="/profile/{comment.expand?.user?.username}" class="font-semibold hover:opacity-70" on:click={onClose}>
                    {comment.expand?.user?.username}
                  </a>
                  <span class="ml-2">{comment.text}</span>
                </div>
                <p class="text-xs text-muted-foreground mt-1">{formatDate(comment.created)}</p>
              </div>
            </div>
          {/each}

          {#if comments.length === 0 && !post.caption}
            <p class="text-muted-foreground text-sm text-center py-8">No comments yet. Be the first to comment!</p>
          {/if}
        </div>

        <!-- Actions & Add Comment -->
        <div class="border-t border-border">
          <!-- Like, Comment Icons -->
          <div class="p-3 flex items-center gap-4">
            <button 
              on:click={toggleLike} 
              class="hover:opacity-70 text-2xl transition-transform active:scale-110" 
              aria-label={isLiked ? 'Unlike' : 'Like'}
            >
              {isLiked ? '❤️' : '🤍'}
            </button>
            <button class="hover:opacity-70 text-2xl" aria-label="Comment">
              💬
            </button>
          </div>

          <!-- Likes Count -->
          <div class="px-4 pb-3">
            {#if likesCount > 0}
              <p class="font-semibold text-sm">{likesCount} {likesCount === 1 ? 'like' : 'likes'}</p>
            {:else}
              <p class="text-sm text-muted-foreground">Be the first to like this</p>
            {/if}
            <p class="text-xs text-muted-foreground mt-1">{formatDate(post.created)}</p>
          </div>

          <!-- Add Comment -->
          <div class="p-3 border-t border-border flex gap-3 items-center">
            <input
              type="text"
              bind:value={commentText}
              placeholder="Add a comment..."
              class="flex-1 bg-transparent border-none outline-none text-sm"
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
  /* Custom scrollbar for comments */
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