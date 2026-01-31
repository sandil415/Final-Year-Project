<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import pb from '$lib/pocketbase';
  // CHANGE 1: Import Lucide Svelte icons for navigation
  import { 
    Home, 
    Search, 
    MessageCircle, 
    Bell, 
    PlusSquare, 
    LogOut 
  } from 'lucide-svelte';

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
  <h1 class="text-2xl font-bold mb-8 pl-3">Fiestra</h1>

  <!-- NAV -->
  <nav class="flex-1 space-y-2">
    <!-- Home Button -->
    <!-- CHANGE 2: Added Home icon before text -->
    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left transition-colors {isActive('/home') ? 'bg-muted font-semibold' : ''}"
      on:click={() => goto('/home')}
    >
      <Home class="w-6 h-6" strokeWidth={isActive('/home') ? 2.5 : 2} />
      <span>Home</span>
    </button>

    <!-- Search Button -->
    <!-- CHANGE 3: Added Search icon before text -->
    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left transition-colors {isActive('/search') ? 'bg-muted font-semibold' : ''}"
      on:click={() => goto('/search')}
    >
      <Search class="w-6 h-6" strokeWidth={isActive('/search') ? 2.5 : 2} />
      <span>Search</span>
    </button>

    <!-- Messages Button -->
    <!-- CHANGE 4: Added MessageCircle icon before text -->
    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left transition-colors {isActive('/messages') ? 'bg-muted font-semibold' : ''}"
      on:click={() => goto('/messages')}
    >
      <MessageCircle class="w-6 h-6" strokeWidth={isActive('/messages') ? 2.5 : 2} />
      <span>Messages</span>
    </button>

    <!-- Notifications Button -->
    <!-- CHANGE 5: Added Bell icon before text -->
    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left transition-colors {isActive('/notifications') ? 'bg-muted font-semibold' : ''}"
      on:click={() => goto('/notifications')}
    >
      <Bell class="w-6 h-6" strokeWidth={isActive('/notifications') ? 2.5 : 2} />
      <span>Notifications</span>
    </button>

    <!-- Create Button -->
    <!-- CHANGE 6: Added PlusSquare icon before text -->
    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left transition-colors {isActive('/create') ? 'bg-muted font-semibold' : ''}"
      on:click={() => goto('/create')}
    >
      <PlusSquare class="w-6 h-6" strokeWidth={isActive('/create') ? 2.5 : 2} />
      <span>Create</span>
    </button>

    <!-- Profile Button -->
    <!-- CHANGE 7: Profile already has avatar image, kept as is -->
    <button
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left transition-colors {isActive(`/profile/${user?.username}`) ? 'bg-muted font-semibold' : ''}"
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
  <!-- CHANGE 8: Added LogOut icon before text -->
  <button
    class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted text-left mt-auto transition-colors"
    on:click={logout}
  >
    <LogOut class="w-6 h-6" strokeWidth={2} />
    <span>Logout</span>
  </button>
</aside>