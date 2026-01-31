<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import pb from '$lib/pocketbase';
  import { House, Search, SquarePlus, Bell } from 'lucide-svelte';

  const user = pb.authStore.model;

  function isActive(path) {
    return $page.url.pathname === path;
  }
</script>

<!--
  SOLID OPAQUE BOTTOM NAV — no transparency possible:
  - bg-background is the base solid colour
  - border-t gives a hard top edge
  - shadow-lg draws a visible shadow above it, separating it from the feed
  - z-50 ensures it layers above everything else on the page
-->
<nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-lg">
  <div class="flex items-center justify-around py-3">

    <!-- Home -->
    <button
      on:click={() => goto('/home')}
      class="flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors {isActive('/home') ? 'text-primary' : 'text-foreground'}"
    >
      <House
        class="w-6 h-6"
        strokeWidth={isActive('/home') ? 2.5 : 2}
        fill={isActive('/home') ? 'currentColor' : 'none'}
      />
      <!-- <span class="text-xs {isActive('/home') ? 'font-semibold' : ''}">Home</span> -->
    </button>

    <!-- Search -->
    <button
      on:click={() => goto('/search')}
      class="flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors {isActive('/search') ? 'text-primary' : 'text-foreground'}"
    >
      <Search
        class="w-5 h-5"
        strokeWidth={isActive('/search') ? 2.5 : 2}
      />
      <!-- <span class="text-xs {isActive('/search') ? 'font-semibold' : ''}">Search</span> -->
    </button>

    <!-- Create -->
    <button
      on:click={() => goto('/create')}
      class="flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors {isActive('/create') ? 'text-primary' : 'text-foreground'}"
    >
      <SquarePlus
        class="w-6 h-6"
        strokeWidth={isActive('/create') ? 2.5 : 2}
      />
      <!-- <span class="text-xs {isActive('/create') ? 'font-semibold' : ''}">Create</span> -->
    </button>

    <!-- Notifications -->
    <button
      on:click={() => goto('/notifications')}
      class="flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors {isActive('/notifications') ? 'text-primary' : 'text-foreground'}"
    >
      <Bell
        class="w-6 h-6"
        strokeWidth={isActive('/notifications') ? 2.5 : 2}
        fill={isActive('/notifications') ? 'currentColor' : 'none'}
      />
      <!-- <span class="text-xs {isActive('/notifications') ? 'font-semibold' : ''}">Notifs</span> -->
    </button>

    <!-- Profile -->
    <button
      on:click={() => goto(`/profile/${user?.username}`)}
      class="flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors {isActive(`/profile/${user?.username}`) ? 'text-primary' : 'text-foreground'}"
    >
      <img
        src={user?.avatar
          ? pb.files.getUrl(user, user.avatar)
          : '/images/profilePlaceholder.jpg'}
        alt="Profile"
        class="w-6 h-6 rounded-full object-cover {isActive(`/profile/${user?.username}`) ? 'ring-2 ring-primary' : ''}"
      />
      <!-- <span class="text-xs {isActive(`/profile/${user?.username}`) ? 'font-semibold' : ''}">Profile</span> -->
    </button>

  </div>
</nav>