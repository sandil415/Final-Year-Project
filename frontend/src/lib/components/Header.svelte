<script>
  let mobileMenuOpen = false;
</script>

<nav class="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
  <div class="max-w-7xl mx-auto px-6 py-4">
    <div class="flex items-center justify-between">
      <!-- Logo -->
      <div class="flex flex-col gap-1">
        <h1 class="text-2xl font-bold tracking-tight text-foreground">FIESTRA</h1>
        <span class="text-xs font-medium tracking-wider" style="color: #FF6B35;">Explore Nepali Cuisines with Us</span>
      </div>
      
      <!-- Desktop Navigation Links -->
      <div class="hidden md:flex items-center gap-8">
        <a href="/demo" class="text-sm font-medium text-foreground relative group">
          Home
          <span class="absolute -bottom-1 left-0 w-0 h-0.5 transition-all duration-300 group-hover:w-full" style="background-color: #FF6B35;"></span>
        </a>
        <a href="/search" class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          Search
        </a>
        <a href="/explore" class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          Explore
        </a>
        <a href="/messages" class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          Messages
        </a>
        <a 
          href="/create" 
          class="px-5 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 transition-all hover:shadow-lg"
          style="background-color: #FF6B35; color: hsl(var(--primary-foreground));"
        >
          <span class="text-xl font-light">+</span>
          Create
        </a>
      </div>
      
      <!-- Right Icons -->
      <div class="flex items-center gap-4">
        <!-- Cart/Bag -->
        <button class="relative p-2 hover:bg-secondary rounded-full transition-colors">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
          <span 
            class="absolute -top-1 -right-1 w-5 h-5 text-xs rounded-full flex items-center justify-center font-bold"
            style="background-color: #FF6B35; color: hsl(var(--primary-foreground));"
          >
            3
          </span>
        </button>
        
        <!-- Notifications -->
        <button class="relative p-2 hover:bg-secondary rounded-full transition-colors">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          <span 
            class="absolute -top-1 -right-1 w-5 h-5 text-xs rounded-full flex items-center justify-center font-bold"
            style="background-color: #FF6B35; color: hsl(var(--primary-foreground));"
          >
            5
          </span>
        </button>
        
        <!-- Profile Avatar -->
        <button 
          class="w-9 h-9 rounded-full text-sm font-bold flex items-center justify-center hover:shadow-lg transition-all"
          style="background: linear-gradient(135deg, #FF6B35 0%, #FF8555 100%); color: hsl(var(--primary-foreground));"
        >
          A
        </button>
        
        <!-- Mobile Menu Toggle -->
        <button 
          class="md:hidden p-2 hover:bg-secondary rounded-lg transition-colors"
          on:click={() => mobileMenuOpen = !mobileMenuOpen}
        >
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            {#if mobileMenuOpen}
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            {:else}
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            {/if}
          </svg>
        </button>
      </div>
    </div>
    
    <!-- Mobile Menu -->
    {#if mobileMenuOpen}
      <div class="md:hidden pt-4 pb-2 border-t border-border mt-4">
        <div class="flex flex-col gap-3">
          <a href="/" class="text-sm font-medium text-foreground py-2 px-3 hover:bg-secondary rounded-lg transition-colors">
            Home
          </a>
          <a href="/search" class="text-sm font-medium text-muted-foreground py-2 px-3 hover:bg-secondary rounded-lg transition-colors">
            Search
          </a>
          <a href="/explore" class="text-sm font-medium text-muted-foreground py-2 px-3 hover:bg-secondary rounded-lg transition-colors">
            Explore
          </a>
          <a href="/messages" class="text-sm font-medium text-muted-foreground py-2 px-3 hover:bg-secondary rounded-lg transition-colors">
            Messages
          </a>
          <a 
            href="/create" 
            class="px-5 py-3 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-all"
            style="background-color: #FF6B35; color: hsl(var(--primary-foreground));"
          >
            <span class="text-xl font-light">+</span>
            Create
          </a>
        </div>
      </div>
    {/if}
  </div>
</nav>