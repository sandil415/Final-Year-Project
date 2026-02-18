<script>
  import Sidebar from '$lib/components/Sidebar.svelte';
  import PostModal from '$lib/components/PostModal.svelte';
  import HighlightsSection from '$lib/components/HighlightsSection.svelte';
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import { page } from '$app/stores';
  import { Camera, Heart, MessageCircle } from 'lucide-svelte';
	import Header from '$lib/components/Header.svelte';

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
  let postStats = {};

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
      await loadPosts();
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

  async function loadPosts() {
    try {
      loadingPosts = true;
      const result = await pb.collection('posts').getList(1, 50, {
        filter: `user = "${user.id}"`,
        sort: '-created',
      });

      posts = result.items;
      postsCount = result.totalItems;
      
      await loadPostsStats();
      
      console.log('Loaded posts:', posts);
    } catch (err) {
      console.error('Failed to load posts:', err);
      posts = [];
      postsCount = 0;
    } finally {
      loadingPosts = false;
    }
  }

  async function loadPostsStats() {
    for (const post of posts) {
      try {
        const [likesResult, commentsResult] = await Promise.all([
          pb.collection('likes').getList(1, 1, {
            filter: `post = "${post.id}"`
          }),
          pb.collection('comments').getList(1, 1, {
            filter: `post = "${post.id}"`
          })
        ]);
        
        postStats[post.id] = {
          likes: likesResult.totalItems,
          comments: commentsResult.totalItems
        };
      } catch (err) {
        console.error('Failed to load stats for post:', post.id, err);
        postStats[post.id] = { likes: 0, comments: 0 };
      }
    }
    postStats = postStats;
  }

  async function toggleFollow() { 
    console.log('Toggle follow clicked');
    console.log('Current user:', currentUser?.id, currentUser?.username);
    console.log('Profile user:', user?.id, user?.username);
    console.log('Is following:', isFollowing);

    if (isFollowing) { 
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
    loadPosts();
  }

  function handlePostDeleted(deletedPostId) {
    posts = posts.filter(p => p.id !== deletedPostId);
    postsCount = Math.max(0, postsCount - 1);
    delete postStats[deletedPostId];
    console.log('Post deleted successfully');
  }
</script>

<div class="h-screen flex bg-background text-foreground overflow-hidden">
  <Header />

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
              ? pb.files.getURL(user, user.avatar)
              : '/images/profilePlaceholder.jpg'}
            alt={user.username}
            class="w-24 h-24 rounded-full object-cover"
          />

          <div class="flex-1">
            <div class="flex items-center gap-6">
              <h1 class="text-xl font-semibold text-foreground">{user.username}</h1>

              {#if isOwnProfile}
                <button
                  class="border border-border text-foreground px-4 py-1 rounded-lg text-sm hover:bg-muted transition-colors"
                  on:click={() => goto('/profile/edit')}
                >
                  Edit profile
                </button>
              {:else}
                <div class="flex gap-2">
                  <button 
                    class="{isFollowing ? 'border border-border text-foreground hover:bg-muted' : 'bg-primary text-primary-foreground'} px-6 py-1 rounded-lg hover:opacity-90 text-sm transition-colors"
                    on:click={toggleFollow}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  <button 
                    class="border border-border text-foreground px-4 py-1 rounded-lg hover:bg-muted text-sm transition-colors" 
                    on:click={messageUser}
                  >
                    Message
                  </button>
                </div>
              {/if}
            </div>

            <div class="flex gap-6 mt-4 text-sm">
              <span class="text-foreground"><strong>{postsCount}</strong> posts</span>
              <button class="hover:opacity-70 text-foreground">
                <strong>{followersCount}</strong> followers
              </button>
              <button class="hover:opacity-70 text-foreground">
                <strong>{followingCount}</strong> following
              </button>
            </div>

            <p class="mt-4 text-muted-foreground">
              {user.bio || 'No bio yet'}
            </p>
          </div>
        </div>

        <!-- HIGHLIGHTS SECTION -->
        <div class="mt-8 border-t border-border">
          <HighlightsSection userId={user.id} isOwnProfile={isOwnProfile} />
        </div>

        <!-- DIVIDER -->
        <div class="border-t border-border mt-4 mb-6"></div>

        <!-- POSTS SECTION -->
        {#if loadingPosts}
          <div class="text-center py-20">
            <p class="text-muted-foreground">Loading posts...</p>
          </div>
        {:else if postsCount === 0}
          <!-- EMPTY STATE -->
          <div class="flex flex-col items-center mt-20 text-center">
            <div class="w-16 h-16 border border-border rounded-full flex items-center justify-center mb-6">
              <Camera class="w-8 h-8 text-muted-foreground" />
            </div>

            <h2 class="text-xl font-semibold mb-2 text-foreground">
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
                  src={pb.files.getURL(post, post.image)}
                  alt={post.caption || 'Post'}
                  class="w-full h-full object-cover"
                />
                
                <!-- Hover overlay -->
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white font-semibold">
                  <span class="flex items-center gap-2">
                    <Heart class="w-5 h-5 fill-white" />
                    <span>{postStats[post.id]?.likes || 0}</span>
                  </span>
                  <span class="flex items-center gap-2">
                    <MessageCircle class="w-5 h-5" />
                    <span>{postStats[post.id]?.comments || 0}</span>
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
  <PostModal 
    postId={selectedPostId} 
    onClose={closePost}
    onDelete={handlePostDeleted}
  />
{/if}