<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import Sidebar from '$lib/components/Sidebar.svelte';

  let user;

  // TEMP placeholders
  let postsCount = 0;
  let followersCount = 0;
  let followingCount = 0;

  onMount(() => {
    requireAuth();
    user = pb.authStore.model;
  });
</script>

{#if user}
<div class="min-h-screen flex bg-background text-foreground">
  <!-- SIDEBAR -->
  <Sidebar />

  <!-- MAIN CONTENT -->
  <main class="flex-1 p-10">
    <div class="max-w-4xl mx-auto">
      <!-- HEADER -->
      <div class="flex gap-10 items-center">
        <img
          src={user.avatar
            ? pb.files.getUrl(user, user.avatar)
            : '/images/profilePlaceholder.jpg'}
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
            <span><b>{followersCount}</b> followers</span>
            <span><b>{followingCount}</b> following</span>
          </div>

          <p class="mt-4 text-muted-foreground">
            {user.bio || 'No bio yet'}
          </p>
        </div>
      </div>

      <!-- POSTS SECTION -->
      {#if postsCount === 0}
        <!-- EMPTY STATE -->
        <div class="flex flex-col items-center mt-28 text-center">
          <div class="w-16 h-16 border rounded-full flex items-center justify-center mb-6">
            📷
          </div>

          <h2 class="text-xl font-semibold mb-2">
            Share photos
          </h2>

          <p class="text-muted-foreground mb-4">
            When you share photos, they’ll appear on your profile.
          </p>

          <button class="text-primary font-medium">
            Share your first photo
          </button>
        </div>
      {:else}
        <!-- POSTS GRID (future) -->
        <div class="grid grid-cols-3 gap-2 mt-10">
          {#each Array(postsCount) as _}
            <div class="aspect-square bg-muted rounded-lg"></div>
          {/each}
        </div>
      {/if}
    </div>
  </main>
</div>
{/if}
