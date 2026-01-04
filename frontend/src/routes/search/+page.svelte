<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { requireAuth } from '$lib/auth';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import { goto } from '$app/navigation';

  let query = '';
  let results = [];
  let loading = false;

  onMount(() => {
    requireAuth();
  });

  async function searchUsers() {
    if (!query || query.trim().length === 0) {
      results = [];
      return;
    }

    loading = true;

    try {
      const safeQuery = query.trim();

      const res = await pb.collection('users').getList(1, 10, {
        filter: `username ?~ "${safeQuery}"`,
        sort: 'username'
      });

      results = res.items;
      console.log('Search results:', res.items);
    } catch (err) {
      console.error('Search failed:', err);
      results = [];
    } finally {
      loading = false;
    }
  }

  function openProfile(userId, username) {
    console.log('Opening profile for:', userId, username);
    goto(`/profile/${username}`);
  }
</script>

<div class="min-h-screen flex bg-background text-foreground">
  <!-- SIDEBAR -->
  <Sidebar />

  <!-- MAIN -->
  <main class="flex-1 p-10">
    <div class="max-w-xl mx-auto">
      <!-- SEARCH INPUT -->
      <input
        type="text"
        placeholder="Search"
        bind:value={query}
        on:input={searchUsers}
        class="w-full px-4 py-3 rounded-lg bg-muted outline-none"
      />

      <!-- RESULTS -->
      <div class="mt-6 space-y-3">
        {#if loading}
          <p class="text-sm text-muted-foreground mt-3">
            Searching for "{query}"…
          </p>
        {/if}

        {#each results as user (user.id)}
          <button
            class="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-muted text-left"
            on:click={() => openProfile(user.id, user.username)}
          >
            <img
              src={user.avatar
                ? pb.files.getUrl(user, user.avatar)
                : '/images/profilePlaceholder.jpg'}
              alt={user.username}
              class="w-10 h-10 rounded-full object-cover"
            />

            <span class="font-medium">{user.username}</span>
          </button>
        {/each}

        {#if !loading && results.length === 0 && query.length > 0}
          <p class="text-sm text-muted-foreground">
            No users found.
          </p>
        {/if}
      </div>
    </div>
  </main>
</div>