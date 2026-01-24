<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { goto } from '$app/navigation';

  let user;
  let posts = [];
  let postsCount = 0;
  let followersCount = 0;
  let followingCount = 0;
  let loadingPosts = true;

  onMount(async () => {
    requireAuth();
    user = pb.authStore.model;
    
    if (user) {
      await loadPosts();
      await loadStats();
    }
  });

  async function loadPosts() {
    try {
      loadingPosts = true;
      const result = await pb.collection('posts').getList(1, 50, {
        filter: `user = "${user.id}"`,
        sort: '-created',
      });

      posts = result.items;
      postsCount = result.totalItems;
      console.log('Loaded posts:', posts);
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      loadingPosts = false;
    }
  }

  async function loadStats() {
    try {
      // Load followers
      const followersData = await pb.collection('follows').getList(1, 1, {
        filter: `following = "${user.id}"`
      });
      followersCount = followersData.totalItems;

      // Load following
      const followingData = await pb.collection('follows').getList(1, 1, {
        filter: `follower = "${user.id}"`
      });
      followingCount = followingData.totalItems;
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  function viewPost(postId) {
    // Navigate to post detail page (you'll need to create this route)
    goto(`/post/${postId}`);
  }
</script>

{#if user}
<div class="min-h-screen flex bg-background text-foreground">
  <Sidebar />

  <main class="flex-1 p-10 overflow-y-auto">
    <div class="max-w-4xl mx-auto">
      <!-- HEADER -->
      <div class="flex gap-10 items-center">
        <img
          src={user.avatar
            ? pb.files.getUrl(user, user.avatar)
            : '/images/profilePlaceholder.jpg'}
          alt={user.username}
          class="w-24 h-24 rounded-full object-cover"
        />

        <div class="flex-1">
          <div class="flex items-center gap-6">
            <h1 class="text-xl font-semibold">{user.username}</h1>

            <a
              href="/profile/edit"
              class="border px-4 py-1 rounded-lg text-sm hover:bg-muted"
            >
              Edit profile
            </a>
          </div>

          <!-- COUNTS -->
          <div class="flex gap-6 mt-4 text-sm">
            <span><b>{postsCount}</b> posts</span>
            <button class="hover:opacity-70">
              <b>{followersCount}</b> followers
            </button>
            <button class="hover:opacity-70">
              <b>{followingCount}</b> following
            </button>
          </div>

          <p class="mt-4 text-muted-foreground">
            {user.bio || 'No bio yet'}
          </p>
        </div>
      </div>

      <!-- DIVIDER -->
      <div class="border-t mt-10 mb-6"></div>

      <!-- POSTS SECTION -->
      {#if loadingPosts}
        <div class="text-center py-20">
          <p class="text-muted-foreground">Loading posts...</p>
        </div>
      {:else if postsCount === 0}
        <!-- EMPTY STATE -->
        <div class="flex flex-col items-center mt-20 text-center">
          <div class="w-16 h-16 border rounded-full flex items-center justify-center mb-6 text-3xl">
            📷
          </div>

          <h2 class="text-xl font-semibold mb-2">
            Share photos
          </h2>

          <p class="text-muted-foreground mb-4">
            When you share photos, they'll appear on your profile.
          </p>

          <a 
            href="/create"
            class="text-primary font-medium hover:underline"
          >
            Share your first photo
          </a>
        </div>
      {:else}
        <!-- POSTS GRID -->
        <div class="grid grid-cols-3 gap-1 md:gap-4">
          {#each posts as post}
            <button
              class="aspect-square bg-muted rounded-sm overflow-hidden hover:opacity-90 transition-opacity relative group"
              on:click={() => viewPost(post.id)}
            >
              <img
                src={pb.files.getUrl(post, post.image)}
                alt={post.caption || 'Post'}
                class="w-full h-full object-cover"
              />
              
              <!-- Hover overlay with caption preview -->
              <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4">
                {#if post.caption}
                  <p class="text-white text-sm line-clamp-3 text-center">
                    {post.caption}
                  </p>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </main>
</div>
{/if}