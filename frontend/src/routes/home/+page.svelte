<script>
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import Header from '$lib/components/Header.svelte';
	import { goto } from '$app/navigation';
  import { ArrowRightIcon, MagnifyingGlassIcon } from 'phosphor-svelte';
  
  let map;
  let mapContainer;
  
  // Sample food spots in Kathmandu
  const foodSpots = [
    { id: 1, name: "Thamel Momo Corner", lat: 27.7172, lng: 85.3240, type: "Restaurant", cuisine: "Nepali" },
    { id: 2, name: "Newari Kitchen", lat: 27.6915, lng: 85.3209, type: "Home Kitchen", cuisine: "Newari" },
    { id: 3, name: "Dal Bhat House", lat: 27.7089, lng: 85.3312, type: "Restaurant", cuisine: "Nepali" },
    { id: 4, name: "Street Food Hub", lat: 27.7000, lng: 85.3100, type: "Street Food", cuisine: "Mixed" },
    { id: 5, name: "Himalayan Sweets", lat: 27.7250, lng: 85.3400, type: "Bakery", cuisine: "Desserts" }
  ];
  
  const featuredDishes = [
    { id: 1, name: "Momo Platter", price: "250", image: "🥟", rating: 4.8, seller: "Thamel Momo Corner" },
    { id: 2, name: "Dal Bhat Set", price: "350", image: "🍛", rating: 4.9, seller: "Dal Bhat House" },
    { id: 3, name: "Newari Khaja Set", price: "450", image: "🍱", rating: 4.7, seller: "Newari Kitchen" }
  ];
  
  const trendingNow = [
    { id: 1, name: "Chatamari", image: "🫓", orders: "234" },
    { id: 2, name: "Sel Roti", image: "🍩", orders: "189" },
    { id: 3, name: "Yomari", image: "🥟", orders: "156" },
    { id: 4, name: "Samosa", image: "🥟", orders: "298" }
  ];
  
  let searchQuery = '';
  let activeCategory = 'all';
  
  onMount(() => {
    // Initialize Leaflet map
    map = L.map(mapContainer, {
      center: [27.7172, 85.3240], // Kathmandu center
      zoom: 13,
      zoomControl: true
    });
    
    // Add OpenStreetMap tiles (completely free!)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    
    // Add food spot markers
    foodSpots.forEach(spot => {
      const markerIcon = L.divIcon({
        className: 'custom-marker',
        html: `
          <div class="marker-pin">
            <div class="marker-inner">
              <span class="marker-icon">🍽️</span>
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 40]
      });
      
      L.marker([spot.lat, spot.lng], { icon: markerIcon })
        .addTo(map)
        .bindPopup(`
          <div class="p-2">
            <h3 class="font-bold text-sm mb-1">${spot.name}</h3>
            <p class="text-xs text-muted-foreground">${spot.cuisine} • ${spot.type}</p>
          </div>
        `);
    });
  });
  
  function handleSearch() {
    console.log('Searching for:', searchQuery);
  }
  
  function setCategory(category) {
    activeCategory = category;
  }
</script>

<div class="min-h-screen bg-background">
  <Header />

  <!-- Hero Section -->
  <section class="hero-section relative overflow-hidden">
    <div class="max-w-7xl mx-auto px-6 py-20 lg:py-28">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <!-- Left Content -->
        <div class="space-y-8">
          <span class="hero-badge inline-block px-4 py-2 border-2 rounded-full text-xs font-bold tracking-wider">
            DISCOVER LOCAL FLAVORS
          </span>
          
          <h1 class="h1">
            AUTHENTIC<br/>
            NEPALI<br/>
            CUISINES
          </h1>
          
          <p class="text-content max-w-md text-muted-foreground">
            Connect with home cooks, restaurants, and food lovers across Nepal. Share recipes, order dishes, and celebrate our culinary heritage.
          </p>
          
          <div class="flex flex-wrap gap-4">
            <button class="cta-primary px-8 py-4 rounded-full font-bold inline-flex items-center gap-3 transition-all group" on:click={goto('/search')}>
              <span>EXPLORE FOOD</span>
              <ArrowRightIcon size={24}/>
            </button>
            <button class="cta-secondary px-8 py-4 border-2 border-border rounded-full font-bold hover:border-orange transition-all" on:click={goto('/create')}>
              CREATE YOUR POSTS
            </button>
            <button class="cta-secondary px-8 py-4 border-2 border-border rounded-full font-bold hover:border-orange transition-all" on:click={goto('/profile/edit')}>
              START SELLING FOOD
            </button>
          </div>
        </div>
        
        <!-- Right Content - Floating Cards -->
        <div class="relative h-[400px] hidden lg:block">
          <div class="floating-card card-1">
            <span class="text-5xl">🥟</span>
            <span class="ml-3 font-bold text-lg">Momo</span>
          </div>
          <div class="floating-card card-2">
            <span class="text-5xl">🍛</span>
            <span class="ml-3 font-bold text-lg">Dal Bhat</span>
          </div>
          <div class="floating-card card-3">
            <span class="text-5xl">🫓</span>
            <span class="ml-3 font-bold text-lg">Sel Roti</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Trending Now -->
  <section class="max-w-7xl mx-auto px-6 py-16">
    <h3 class="h3 mb-8">Trending Now</h3>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      {#each trendingNow as item}
        <button class="trending-card bg-background border-2 border-border p-6 rounded-2xl hover:border-orange transition-all hover:shadow-lg group">
          <div class="text-5xl mb-3">{item.image}</div>
          <h4 class="font-bold mb-1">{item.name}</h4>
          <p class="text-xs text-muted-foreground">{item.orders} orders today</p>
        </button>
      {/each}
    </div>
  </section>

  <!-- Featured Dishes -->
  <section class="max-w-7xl mx-auto px-6 py-16">
    <div class="flex items-center justify-between mb-8">
      <h3 class="h2">Today's Specials</h3>
      <button class="px-6 py-2.5 border-2 border-border rounded-full font-semibold text-sm hover:border-orange hover:text-orange transition-all">
        View All →
      </button>
    </div>
    
    <div class="grid md:grid-cols-3 gap-6">
      {#each featuredDishes as dish}
        <div class="dish-card bg-background border-2 border-border rounded-3xl overflow-hidden hover:border-orange hover:shadow-2xl transition-all duration-300 group">
          <div class="p-8 text-center bg-secondary/30">
            <div class="text-7xl">{dish.image}</div>
          </div>
          <div class="p-6 space-y-3">
            <div>
              <h4 class="font-bold text-xl mb-1">{dish.name}</h4>
              <p class="text-sm text-muted-foreground">{dish.seller}</p>
            </div>
            <div class="flex items-center justify-between">
              <span class="price-tag text-2xl font-bold">रू {dish.price}</span>
              <span class="text-sm font-semibold text-muted-foreground">⭐ {dish.rating}</span>
            </div>
            <button class="add-to-cart w-full py-3 rounded-xl font-bold hover:scale-105 transition-all">
              Add to Cart
            </button>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Map Section -->
  <section class="max-w-7xl mx-auto px-6 py-16">
    <div class="mb-8 space-y-6">
      <div>
        <h2 class="h2 mb-2">Explore Food Spots</h2>
        <p class="text-content text-muted-foreground">Discover restaurants, home kitchens, and street food across Kathmandu</p>
      </div>
      
      <!-- Categories -->
      <div class="flex flex-wrap gap-3">
        <button 
          class="category-btn px-5 py-2.5 rounded-full font-semibold text-sm transition-all"
          class:active={activeCategory === 'all'}
          on:click={() => setCategory('all')}
        >
          All Places
        </button>
        <button 
          class="category-btn px-5 py-2.5 rounded-full font-semibold text-sm transition-all"
          class:active={activeCategory === 'restaurant'}
          on:click={() => setCategory('restaurant')}
        >
          Restaurants
        </button>
        <button 
          class="category-btn px-5 py-2.5 rounded-full font-semibold text-sm transition-all"
          class:active={activeCategory === 'home'}
          on:click={() => setCategory('home')}
        >
          Home Kitchens
        </button>
        <button 
          class="category-btn px-5 py-2.5 rounded-full font-semibold text-sm transition-all"
          class:active={activeCategory === 'street'}
          on:click={() => setCategory('street')}
        >
          Favourites
        </button>
      </div>
    </div>
    
    <!-- Map Container -->
    <div class="relative h-[600px] rounded-3xl overflow-hidden border-2 border-border shadow-2xl">
      <div bind:this={mapContainer} class="w-full h-full"></div>
      
      <!-- Search Overlay -->
      <div class="absolute top-6 left-6 right-6 z-[1000] pointer-events-none">
        <div class="search-box max-w-md bg-background shadow-2xl rounded-full px-6 py-4 flex items-center gap-3 pointer-events-auto border border-border">
          <MagnifyingGlassIcon size={16}/>
          <input 
            type="text" 
            placeholder="Search food spots, dishes, cuisines..."
            class="flex-1 bg-transparent border-none outline-none text-sm"
            bind:value={searchQuery}
            on:keypress={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
      </div>
    </div>
  </section>

  <!-- App Download CTA -->
  <!-- <section class="max-w-7xl mx-auto px-6 py-16">
    <div class="app-download-cta relative overflow-hidden rounded-3xl p-12 text-center">
      <div class="relative z-10 space-y-6 max-w-2xl mx-auto">
        <div class="flex items-center justify-center gap-6">
          <div class="app-icon-card">
            📱
          </div>
          <div class="app-icon-card">
            🍎
          </div>
        </div>
        <h3 class="h2">Get the Tastyhub App</h3>
        <p class="text-lg text-muted-foreground">Order food, share recipes, and connect with food lovers</p>
        <div class="rating-box inline-flex items-center gap-3 bg-background px-6 py-3 rounded-full shadow-lg border border-border">
          <span class="rating-score text-2xl font-bold">4.9</span>
          <span>⭐⭐⭐⭐⭐</span>
          <span class="text-sm text-muted-foreground">12,450 reviews</span>
        </div>
      </div>
    </div>
  </section> -->
</div>

<style>
  /* Hero Section */
  .hero-section {
    background: linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--secondary)) 100%);
  }
  
  .hero-badge {
    border-color: #FF6B35;
    color: #FF6B35;
    background-color: hsl(var(--background));
  }
  
  /* Buttons */
  .cta-primary {
    background-color: #FF6B35;
    color: hsl(var(--primary-foreground));
  }
  
  .cta-primary:hover {
    background-color: #E85A2A;
    box-shadow: 0 8px 24px rgba(255, 107, 53, 0.3);
  }
  
  .cta-secondary:hover {
    border-color: #FF6B35;
  }
  
  /* Floating Cards Animation */
  .floating-card {
    position: absolute;
    background-color: hsl(var(--background));
    padding: 1.5rem;
    border-radius: 1.5rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    animation: float 3s ease-in-out infinite;
    border: 1px solid hsl(var(--border));
  }
  
  .card-1 {
    top: 10%;
    left: 10%;
    animation-delay: 0s;
  }
  
  .card-2 {
    top: 45%;
    right: 10%;
    animation-delay: 1s;
  }
  
  .card-3 {
    bottom: 10%;
    left: 25%;
    animation-delay: 2s;
  }
  
  @keyframes float {
    0%, 100% {
      transform: translateY(0px);
    }
    50% {
      transform: translateY(-20px);
    }
  }
  
  /* Trending Cards */
  .trending-card:hover {
    border-color: #FF6B35;
  }
  
  /* Dish Cards */
  .dish-card:hover {
    border-color: #FF6B35;
  }
  
  .price-tag {
    color: #FF6B35;
  }
  
  .add-to-cart {
    background-color: #FF6B35;
    color: hsl(var(--primary-foreground));
  }
  
  .add-to-cart:hover {
    background-color: #E85A2A;
  }
  
  /* Category Buttons */
  .category-btn {
    background-color: hsl(var(--secondary));
    color: hsl(var(--foreground));
  }
  
  .category-btn:hover {
    background-color: #FF6B35;
    color: hsl(var(--primary-foreground));
  }
  
  .category-btn.active {
    background-color: #FF6B35;
    color: hsl(var(--primary-foreground));
    box-shadow: 0 4px 20px rgba(255, 107, 53, 0.3);
  }
  
  /* App Download Section */
  .app-download-cta {
    background: linear-gradient(135deg, #FFE8DC 0%, #FFD4C4 100%);
  }
  
  .app-icon-card {
    width: 5rem;
    height: 5rem;
    background-color: hsl(var(--background));
    border-radius: 1rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    transition: transform 0.3s ease;
    cursor: pointer;
  }
  
  .app-icon-card:first-child:hover {
    transform: rotate(-6deg);
  }
  
  .app-icon-card:last-child:hover {
    transform: rotate(6deg);
  }
  
  .rating-score {
    color: #FF6B35;
  }
  
  /* Leaflet Marker Styles */
  :global(.custom-marker) {
    background: transparent !important;
    border: none !important;
  }
  
  :global(.marker-pin) {
    position: relative;
    width: 40px;
    height: 40px;
  }
  
  :global(.marker-inner) {
    width: 40px;
    height: 40px;
    background-color: hsl(var(--background));
    border: 3px solid #FF6B35;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    transition: all 0.3s ease;
    animation: pulse 2s ease-in-out infinite;
  }
  
  :global(.marker-inner:hover) {
    transform: scale(1.2);
    box-shadow: 0 6px 20px rgba(255, 107, 53, 0.4);
  }
  
  :global(.marker-icon) {
    font-size: 1.5rem;
  }
  
  @keyframes pulse {
    0%, 100% {
      box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
    }
    50% {
      box-shadow: 0 4px 20px rgba(255, 107, 53, 0.6);
    }
  }
  
  /* Leaflet Popup Styles */
  :global(.leaflet-popup-content-wrapper) {
    border-radius: 0.75rem;
    border: 2px solid hsl(var(--border));
    background-color: hsl(var(--background));
  }
  
  :global(.leaflet-popup-content) {
    margin: 0 !important;
  }
  
  :global(.leaflet-popup-tip) {
    background-color: hsl(var(--background));
    border: 2px solid hsl(var(--border));
    border-top: none;
    border-right: none;
  }
</style>