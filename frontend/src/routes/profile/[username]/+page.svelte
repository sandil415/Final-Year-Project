<script>
  import Sidebar from '$lib/components/Sidebar.svelte';
  import PostModal from '$lib/components/PostModal.svelte';
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import { page } from '$app/stores';

  let user = null;
  let loading = true;
  let isOwnProfile = false;
  let currentUser = null;
  let isFollowing = false;
  let followRecordId = null;

  // Posts data
  let posts = [];
  let postsCount = 0;
  let loadingPosts = true;
  let selectedPostId = null;

  // Stats
  let followersCount = 0;
  let followingCount = 0;

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.model;
    
    const username = $page.params?.username || currentUser.username;
    isOwnProfile = username === currentUser.username;
    
    if (isOwnProfile) {
      user = currentUser;
      loading = false;
    } else {
      await loadUserProfile(username);
    }

    if (user) {
      await loadFollowData();
      await loadPosts(); // Actually load the posts!
    }
  });

  async function loadUserProfile(username) {
    try {
      const records = await pb.collection('users').getList(1, 1, {
        filter: `username = "${username}"`
      });

      if (records.items.length > 0) {
        user = records.items[0];
      } else {
        console.error('User not found');
        goto('/search');
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      goto('/search');
    } finally {
      loading = false;
    }
  }

  async function loadFollowData() {
    try {
      const followersData = await pb.collection('follows').getList(1, 1, {
        filter: `following = "${user.id}"`
      });
      followersCount = followersData.totalItems;

      const followingData = await pb.collection('follows').getList(1, 1, {
        filter: `follower = "${user.id}"`
      });
      followingCount = followingData.totalItems;

      if (!isOwnProfile) {
        const followCheck = await pb.collection('follows').getList(1, 1, {
          filter: `follower = "${currentUser.id}" && following = "${user.id}"`
        });
        
        if (followCheck.items.length > 0) {
          isFollowing = true;
          followRecordId = followCheck.items[0].id;
        }
      }
    } catch (err) {
      console.error('Failed to load follow data:', err);
    }
  }

  // FIXED: Actually load posts from database
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
      posts = [];
      postsCount = 0;
    } finally {
      loadingPosts = false;
    }
  }

  async function toggleFollow() { 
    console.log('Toggle follow clicked');
    console.log('Current user:', currentUser?.id, currentUser?.username);
    console.log('Profile user:', user?.id, user?.username);
    console.log('Is following:', isFollowing);

    if (isFollowing) { 
      // UNFOLLOW
      try {
        console.log('Attempting to unfollow, record ID:', followRecordId);
        
        await pb.collection('follows').delete(followRecordId);
        
        console.log('Unfollow successful');
        
        isFollowing = false;
        followRecordId = null;
        followersCount = Math.max(0, followersCount - 1);
        
      } catch (err) {
        console.error('Failed to unfollow:', err);
        console.error('Error details:', err.response?.data);
        alert('Failed to unfollow. Please try again.');
      }
    } else {
      // FOLLOW
      try {
        console.log('Attempting to follow...');
        
        const newFollow = await pb.collection('follows').create({
          follower: currentUser.id,
          following: user.id
        });
        
        console.log('Follow record created:', newFollow);
        
        isFollowing = true;
        followRecordId = newFollow.id;
        followersCount += 1;
        
        console.log('Creating notification...');
        
        await pb.collection('notifications').create({
          user: user.id,
          triggeredBy: currentUser.id,
          type: 'follow',
          message: `${currentUser.username} started following you.`,
          read: false
        });
        
        console.log('Follow and notification successful');

      } catch (err) {
        console.error('Error details:', err.response);
        console.error('Error data:', err.response?.data);
        
        const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
        
        if (!followRecordId) {
          isFollowing = false;
          followersCount = Math.max(0, followersCount - 1);
        }
      }
    }
  }

  async function messageUser() {
    if (!currentUser || !user) return;

    try {
      const existing = await pb.collection('conversations').getList(1, 1, {
        filter: `
          participants.id ?= "${currentUser.id}" &&
          participants.id ?= "${user.id}"
        `
      });

      if (existing.items.length > 0) {
        goto(`/messages/${existing.items[0].id}`);
        return;
      }

      const conversation = await pb.collection('conversations').create({
        participants: [currentUser.id, user.id],
        lastMessage: '',
        lastMessageTime: new Date().toISOString()
      });

      goto(`/messages/${conversation.id}`);
    } catch (err) {
      console.error('Failed to start conversation:', err);
      alert('Failed to start conversation. Please try again.');
    }
  }

  function openPost(postId) {
    selectedPostId = postId;
  }

  function closePost() {
    selectedPostId = null;
    loadPosts(); // Reload posts to update like/comment counts
  }
</script>

<div class="h-screen flex bg-background text-foreground overflow-hidden">
  <Sidebar />

  <main class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="max-w-4xl mx-auto p-10 text-center py-20">
        <p class="text-muted-foreground">Loading profile...</p>
      </div>
    {:else if user}
      <div class="max-w-4xl mx-auto p-10">
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

              {#if isOwnProfile}
                <button
                  class="border px-4 py-1 rounded-lg text-sm hover:bg-muted"
                  on:click={() => goto('/profile/edit')}
                >
                  Edit profile
                </button>
              {:else}
                <div class="flex gap-2">
                  <button 
                    class="{isFollowing ? 'border' : 'bg-primary text-primary-foreground'} px-6 py-1 rounded-lg hover:opacity-90 text-sm"
                    on:click={toggleFollow}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  <button 
                    class="border px-4 py-1 rounded-lg hover:bg-muted text-sm" 
                    on:click={messageUser}
                  >
                    Message
                  </button>
                </div>
              {/if}
            </div>

            <div class="flex gap-6 mt-4 text-sm">
              <span><strong>{postsCount}</strong> posts</span>
              <button class="hover:opacity-70">
                <strong>{followersCount}</strong> followers
              </button>
              <button class="hover:opacity-70">
                <strong>{followingCount}</strong> following
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
              {isOwnProfile ? 'Share photos' : 'No posts yet'}
            </h2>

            <p class="text-muted-foreground mb-4">
              {isOwnProfile 
                ? "When you share photos, they'll appear on your profile." 
                : `${user.username} hasn't shared any photos yet.`}
            </p>

            {#if isOwnProfile}
              <a 
                href="/create"
                class="text-primary font-medium hover:underline"
              >
                Share your first photo
              </a>
            {/if}
          </div>
        {:else}
          <!-- POSTS GRID -->
          <div class="grid grid-cols-3 gap-1 md:gap-4">
            {#each posts as post}
              <button
                class="aspect-square bg-muted rounded-sm overflow-hidden hover:opacity-90 transition-opacity relative group"
                on:click={() => openPost(post.id)}
              >
                <img
                  src={pb.files.getUrl(post, post.image)}
                  alt={post.caption || 'Post'}
                  class="w-full h-full object-cover"
                />
                
                <!-- Hover overlay -->
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white font-semibold">
                  <span class="flex items-center gap-2">
                    <span class="text-xl">❤️</span>
                    <span>0</span>
                  </span>
                  <span class="flex items-center gap-2">
                    <span class="text-xl">💬</span>
                    <span>0</span>
                  </span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="max-w-4xl mx-auto p-10 text-center py-20">
        <p class="text-muted-foreground">Profile not found</p>
      </div>
    {/if}
  </main>
</div>

<!-- Post Modal -->
{#if selectedPostId}
  <PostModal postId={selectedPostId} onClose={closePost} />
{/if}