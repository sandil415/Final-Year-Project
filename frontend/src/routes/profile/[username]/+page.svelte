<script>
  import Sidebar from '$lib/components/Sidebar.svelte';
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

  // Stats
  let followersCount = 0;
  let followingCount = 0;

  onMount(async () => {
    requireAuth();
    currentUser = pb.authStore.model;
    
    // Get username from URL (if exists) or use current user
    const username = $page.params?.username || currentUser.username;
    
    // Check if viewing own profile
    isOwnProfile = username === currentUser.username;
    
    if (isOwnProfile) {
      user = currentUser;
      loading = false;
    } else {
      await loadUserProfile(username);
    }

    if (user) {
      await loadFollowData();
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
      // Load followers count
      const followersData = await pb.collection('follows').getList(1, 1, {
        filter: `following = "${user.id}"`
      });
      followersCount = followersData.totalItems;

      // Load following count
      const followingData = await pb.collection('follows').getList(1, 1, {
        filter: `follower = "${user.id}"`
      });
      followingCount = followingData.totalItems;

      // Check if current user follows this profile
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

  async function toggleFollow() {
    if (isFollowing) {
      // Unfollow
      try {
        await pb.collection('follows').delete(followRecordId);
        isFollowing = false;
        followRecordId = null;
        followersCount--;
        
        // Update user's follower count
        await pb.collection('users').update(user.id, {
          'followers-': 1
        });
      } catch (err) {
        console.error('Failed to unfollow:', err);
        alert('Failed to unfollow. Please try again.');
      }
    } else {
      // Follow
      try {
        const newFollow = await pb.collection('follows').create({
          follower: currentUser.id,
          following: user.id
        });
        
        isFollowing = true;
        followRecordId = newFollow.id;
        followersCount++;
        
        // Update user's follower count
        await pb.collection('users').update(user.id, {
          'followers+': 1
        });
      } catch (err) {
        console.error('Failed to follow:', err);
        alert('Failed to follow. Please try again.');
      }
    }
  }

  async function messageUser() {
    if (!currentUser || !user) return;

    try {
      // Check if conversation already exists
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

      // Create new conversation
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

            <!-- COUNTS -->
            <div class="flex gap-6 mt-4 text-sm">
              <span><strong>0</strong> posts</span>
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

        <!-- EMPTY POSTS STATE -->
        <div class="mt-24 flex flex-col items-center text-center text-muted-foreground">
          <div class="w-14 h-14 rounded-full border flex items-center justify-center mb-6">
            📷
          </div>
          <h2 class="text-xl font-semibold text-foreground mb-2">
            {isOwnProfile ? 'Share photos' : 'No posts yet'}
          </h2>
          <p>
            {isOwnProfile 
              ? "When you share photos, they'll appear on your profile." 
              : `${user.username} hasn't shared any photos yet.`}
          </p>
        </div>
      </div>
    {:else}
      <div class="max-w-4xl mx-auto p-10 text-center py-20">
        <p class="text-muted-foreground">Profile not found</p>
      </div>
    {/if}
  </main>
</div>