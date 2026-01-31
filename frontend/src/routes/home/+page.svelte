<script>
  import Sidebar from "$lib/components/Sidebar.svelte";
  import PostModal from "$lib/components/PostModal.svelte";
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import { Heart, MessageCircle, Bookmark, MoreHorizontal } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { notifyLike, notifyComment } from '$lib/notifications';

  let currentUser = null;
  let posts = [];
  let loading = true;
  let selectedPostId = null;

  // Like states for each post
  let postLikes = {}; // { postId: { isLiked: boolean, likeId: string, count: number } }
  let postComments = {}; // { postId: count }

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.model;
    
    if (currentUser) {
      await loadFeed();
    }
  });

  async function loadFeed() {
    try {
      loading = true;

      // Get list of users current user follows
      const followingResult = await pb.collection('follows').getFullList({
        filter: `follower = "${currentUser.id}"`
      });

      const followingIds = followingResult.map(f => f.following);

      // Build filter: posts from following users OR current user
      let filter = `user = "${currentUser.id}"`;
      
      if (followingIds.length > 0) {
        const followingFilter = followingIds.map(id => `user = "${id}"`).join(' || ');
        filter = `(${filter} || ${followingFilter})`;
      }

      // Fetch posts
      const result = await pb.collection('posts').getList(1, 50, {
        filter: filter,
        sort: '-created',
        expand: 'user'
      });

      posts = result.items;

      // Load likes and comments for each post
      await loadPostStats();

    } catch (err) {
      console.error('Failed to load feed:', err);
      posts = [];
    } finally {
      loading = false;
    }
  }

  async function loadPostStats() {
    for (const post of posts) {
      // Check if current user liked this post
      const likeCheck = await pb.collection('likes').getList(1, 1, {
        filter: `post = "${post.id}" && user = "${currentUser.id}"`
      });

      const likesCount = await pb.collection('likes').getList(1, 1, {
        filter: `post = "${post.id}"`
      });

      const commentsCount = await pb.collection('comments').getList(1, 1, {
        filter: `post = "${post.id}"`
      });

      postLikes[post.id] = {
        isLiked: likeCheck.items.length > 0,
        likeId: likeCheck.items[0]?.id || null,
        count: likesCount.totalItems
      };

      postComments[post.id] = commentsCount.totalItems;
    }

    // Force reactivity
    postLikes = postLikes;
    postComments = postComments;
  }

  async function toggleLike(post) {
    const currentLikeState = postLikes[post.id];
    
    if (currentLikeState.isLiked) {
      // Unlike
      try {
        await pb.collection('likes').delete(currentLikeState.likeId);
        
        postLikes[post.id] = {
          isLiked: false,
          likeId: null,
          count: Math.max(0, currentLikeState.count - 1)
        };
        postLikes = postLikes;
      } catch (err) {
        console.error('Failed to unlike:', err);
      }
    } else {
      // Like
      try {
        const like = await pb.collection('likes').create({
          post: post.id,
          user: currentUser.id
        });

        postLikes[post.id] = {
          isLiked: true,
          likeId: like.id,
          count: currentLikeState.count + 1
        };
        postLikes = postLikes;

        // Send notification if not own post
        if (post.user !== currentUser.id) {
          notifyLike(post.user, currentUser.id, currentUser.username, post.id);
        }
      } catch (err) {
        console.error('Failed to like:', err);
      }
    }
  }

  function openPost(postId) {
    selectedPostId = postId;
  }

  function closePost() {
    selectedPostId = null;
    // Reload stats when modal closes
    loadPostStats();
  }

  function handlePostDeleted(deletedPostId) {
    posts = posts.filter(p => p.id !== deletedPostId);
    delete postLikes[deletedPostId];
    delete postComments[deletedPostId];
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

  function goToProfile(username) {
    goto(`/profile/${username}`);
  }
</script>

<!-- CHANGE 1: Changed min-h-screen to h-screen -->
<!-- CHANGE 2: Added overflow-hidden to prevent outer scroll -->
<div class="h-screen bg-background flex overflow-hidden">
  <!-- CHANGE 3: Wrapped Sidebar in a container with w-64, flex-shrink-0, and overflow-y-auto -->
  <!-- This prevents the sidebar from expanding and makes it independently scrollable -->
  <div class="w-64 border-r border-border flex-shrink-0 overflow-y-auto">
    <Sidebar />
  </div>

  <!-- MAIN FEED AREA - Only this section scrolls -->
  <!-- CHANGE 4: Main content has overflow-y-auto so only it scrolls -->
  <main class="flex-1 flex justify-center overflow-y-auto">
    <div class="w-full max-w-[470px] py-8 px-4">
      {#if loading}
        <div class="text-center py-20">
          <p class="text-muted-foreground">Loading feed...</p>
        </div>
      {:else if posts.length === 0}
        <!-- Empty State -->
        <div class="text-center py-20">
          <div class="w-20 h-20 rounded-full border-2 border-border flex items-center justify-center mx-auto mb-6">
            <Heart class="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 class="text-2xl font-semibold mb-2 text-foreground">No posts yet</h2>
          <p class="text-muted-foreground mb-6">
            Follow people to see their posts in your feed
          </p>
          <a 
            href="/search" 
            class="inline-block px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Find people to follow
          </a>
        </div>
      {:else}
        <!-- POSTS FEED -->
        <div class="space-y-6">
          {#each posts as post}
            <article class="bg-card border border-border rounded-xl overflow-hidden">
              <!-- POST HEADER -->
              <div class="flex items-center justify-between p-3">
                <button 
                  class="flex items-center gap-3 hover:opacity-70 transition-opacity"
                  on:click={() => goToProfile(post.expand?.user?.username)}
                >
                  <img
                    src={post.expand?.user?.avatar
                      ? pb.files.getUrl(post.expand.user, post.expand.user.avatar)
                      : '/images/profilePlaceholder.jpg'}
                    alt={post.expand?.user?.username}
                    class="w-8 h-8 rounded-full object-cover"
                  />
                  <div class="text-left">
                    <p class="font-semibold text-sm text-foreground">
                      {post.expand?.user?.username}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      {formatDate(post.created)}
                    </p>
                  </div>
                </button>

                <button class="p-2 hover:bg-muted rounded-full transition-colors">
                  <MoreHorizontal class="w-5 h-5 text-foreground" />
                </button>
              </div>

              <!-- POST IMAGE -->
              <button 
                class="w-full aspect-square bg-black"
                on:click={() => openPost(post.id)}
              >
                <img
                  src={pb.files.getUrl(post, post.image)}
                  alt={post.caption || 'Post'}
                  class="w-full h-full object-contain"
                />
              </button>

              <!-- POST ACTIONS -->
              <div class="p-3 space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-4">
                    <!-- Like Button -->
                    <button 
                      on:click={() => toggleLike(post)}
                      class="hover:opacity-70 transition-all active:scale-110"
                      aria-label={postLikes[post.id]?.isLiked ? 'Unlike' : 'Like'}
                    >
                      <Heart 
                        class="w-6 h-6 {postLikes[post.id]?.isLiked ? 'fill-red-500 text-red-500' : 'text-foreground'}" 
                        strokeWidth={1.5}
                      />
                    </button>

                    <!-- Comment Button -->
                    <button 
                      on:click={() => openPost(post.id)}
                      class="hover:opacity-70 transition-all active:scale-110"
                      aria-label="Comment"
                    >
                      <MessageCircle class="w-6 h-6 text-foreground" strokeWidth={1.5} />
                    </button>
                  </div>

                  <!-- Bookmark Button -->
                  <button 
                    class="hover:opacity-70 transition-all active:scale-110"
                    aria-label="Save"
                  >
                    <Bookmark class="w-6 h-6 text-foreground" strokeWidth={1.5} />
                  </button>
                </div>

                <!-- Likes Count -->
                {#if postLikes[post.id]?.count > 0}
                  <button 
                    on:click={() => openPost(post.id)}
                    class="font-semibold text-sm text-foreground hover:opacity-70"
                  >
                    {postLikes[post.id].count} {postLikes[post.id].count === 1 ? 'like' : 'likes'}
                  </button>
                {:else}
                  <p class="text-sm text-muted-foreground">Be the first to like this</p>
                {/if}

                <!-- Caption -->
                {#if post.caption}
                  <div class="text-sm">
                    <button 
                      class="font-semibold hover:opacity-70 text-foreground"
                      on:click={() => goToProfile(post.expand?.user?.username)}
                    >
                      {post.expand?.user?.username}
                    </button>
                    <span class="ml-2 text-foreground">{post.caption}</span>
                  </div>
                {/if}

                <!-- View Comments -->
                {#if postComments[post.id] > 0}
                  <button 
                    on:click={() => openPost(post.id)}
                    class="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View all {postComments[post.id]} {postComments[post.id] === 1 ? 'comment' : 'comments'}
                  </button>
                {/if}
              </div>
            </article>
          {/each}
        </div>

        <!-- End of Feed Message -->
        <div class="text-center py-12">
          <p class="text-muted-foreground text-sm">You're all caught up! 🎉</p>
        </div>
      {/if}
    </div>
  </main>

  <!-- RIGHT SIDEBAR -->
  <!-- CHANGE 5: Wrapped right sidebar in container with flex-shrink-0 and overflow-y-auto -->
  <aside class="hidden xl:block w-80 border-l border-border flex-shrink-0 overflow-y-auto">
    <div class="p-6">
      <h3 class="text-sm font-semibold text-muted-foreground mb-4">
        Suggestions for you
      </h3>
      <p class="text-sm text-muted-foreground">
        Coming soon...
      </p>
    </div>
  </aside>
</div>

<!-- Post Modal -->
{#if selectedPostId}
  <PostModal 
    postId={selectedPostId} 
    onClose={closePost}
    onDelete={handlePostDeleted}
  />
{/if}