<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import pb from '$lib/pocketbase';

  function isActive(path) {
    return $page.url.pathname === path;
  }

  function logout() {
    pb.authStore.clear();
    goto('/auth/login');
  }

  const user = pb.authStore.model;
</script>

<aside class="w-64 border-r border-border p-6 flex flex-col">
  <!-- LOGO -->
  <h1 class="text-2xl font-bold mb-8">FoodSocial</h1>

  <!-- NAV -->
  <nav class="flex-1 space-y-2">
    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left {isActive('/home') ? 'bg-muted font-semibold' : ''}"
      on:click={() => goto('/home')}
    >
      <span>Home</span>
    </button>

    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left {isActive('/search') ? 'bg-muted font-semibold' : ''}"
      on:click={() => goto('/search')}
    >
      <span>Search</span>
    </button>

    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left {isActive('/messages') ? 'bg-muted font-semibold' : ''}"
      on:click={() => goto('/messages')}
    >
      <span>Messages</span>
    </button>

    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left {isActive('/notifications') ? 'bg-muted font-semibold' : ''}"
      on:click={() => goto('/notifications')}
    >
      <span>Notifications</span>
    </button>

    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left {isActive('/create') ? 'bg-muted font-semibold' : ''}"
      on:click={() => goto('/create')}
    >
      <span>Create</span>
    </button>

    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left {isActive(`/profile/${user?.username}`) ? 'bg-muted font-semibold' : ''}"
      on:click={() => goto(`/profile/${user?.username}`)}
    >
      <img
        src={user?.avatar
          ? pb.files.getUrl(user, user.avatar)
          : '/images/profilePlaceholder.jpg'}
        alt="Profile"
        class="w-6 h-6 rounded-full object-cover"
      />
      <span>Profile</span>
    </button>
  </nav>

  <!-- LOGOUT -->
  <button
    class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left mt-auto"
    on:click={logout}
  >
    <span>Logout</span>
  </button>
</aside>