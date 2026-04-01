<script>
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import Header from '$lib/components/Header.svelte';
  import FloatingImage from '$lib/components/FloatingImage.svelte';
  import { goto } from '$app/navigation';
  import { ArrowRightIcon, MagnifyingGlassIcon, StarIcon, CookingPotIcon } from 'phosphor-svelte';
  import pb from '$lib/pocketbase';

  let map;
  let mapContainer;
  let currentUser = null;
  let locationError = null;
  let locating = true;
  let recentPosts = [];
  let loadingPosts = true;

  const foodSpots = [
    { id: 1, name: "Momo Corner",     lat: 27.7172, lng: 85.3240, type: "Restaurant",   cuisine: "Nepali"   },
    { id: 2, name: "Newari Kitchen",  lat: 27.6915, lng: 85.3209, type: "Home Kitchen", cuisine: "Newari"   },
    { id: 3, name: "Momo",            lat: 27.7089, lng: 85.3312, type: "Restaurant",   cuisine: "Nepali"   },
    { id: 4, name: "Street Food Hub", lat: 27.7000, lng: 85.3100, type: "Street Food",  cuisine: "Mixed"    },
    { id: 5, name: "Sweets Shops",    lat: 27.7250, lng: 85.3400, type: "Bakery",       cuisine: "Desserts" }
  ];

  const featuredDishes = [
    { id: 1, name: "Momo Platter",     price: "250", rating: 4.8, seller: "Thamel Momo Corner" },
    { id: 2, name: "Dal Bhat Set",     price: "350", rating: 4.9, seller: "Dal Bhat House"      },
    { id: 3, name: "Newari Khaja Set", price: "450", rating: 4.7, seller: "Newari Kitchen"      }
  ];

  let searchQuery = '';
  let activeCategory = 'all';

  onMount(async () => {
    currentUser = pb.authStore.record ?? pb.authStore.model;

    // Posts fetch
    try {
      const result = await pb.collection('posts').getList(1, 5, {
        sort: '-created',
        filter: `image != ""`,
        expand: 'user',
      });
      recentPosts = result.items;
    } catch (err) {
      console.error('Failed to load posts:', err);
      recentPosts = [];
    } finally {
      loadingPosts = false;
    }

    function initMap(lat, lng, isUserLocation = false) {
      map = L.map(mapContainer, {
        center: [lat, lng],
        zoom: isUserLocation ? 15 : 13,
        zoomControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      if (isUserLocation) {
        console.log("HELLLOOOO");
        const userIcon = L.divIcon({
          className: 'custom-marker',
          html: `
            <div class="user-location-pin">
              <div class="user-location-inner">
                <div class="user-location-dot"></div>
              </div>
              <div class="user-location-ring"></div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        L.marker([lat, lng], { icon: userIcon })
          .addTo(map)
          .bindPopup(`
            <div class="p-2">
              <h3 class="font-bold text-sm mb-1">Current Location</h3>
              <p class="text-xs text-muted-foreground">Your current location</p>
            </div>
          `)
          .openPopup();
      }

      // Orange food spot markers
      foodSpots.forEach(spot => {
        const markerIcon = L.divIcon({
          className: 'custom-marker',
          html: `
            <div class="marker-pin">
              <div class="marker-inner">
                <span class="marker-icon">dx</span>
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

      locating = false;
    } 

    // GPS logic  also inside onMount
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          initMap(position.coords.latitude, position.coords.longitude, true);
        },
        (error) => {
          console.warn('Geolocation unavailable:', error.message);
          locationError = error.code;
          initMap(27.7172, 85.3240, false);
        },
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 300000
        }
      );
    } else {
      initMap(27.7172, 85.3240, false);
    }

  }); // ← onMount closes here

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
          
          <p class="text-muted-foreground max-w-md">
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
            <!-- <button class="cta-secondary px-8 py-4 border-2 border-border rounded-full font-bold hover:border-orange transition-all" on:click={goto('/profile/edit')}>
              START SELLING FOOD
            </button> -->
          </div>
        </div>
        
        <!-- Right Content - Floating Cards -->
        <div class="relative h-[400px] hidden lg:block"> 
          <div class="floating-card card-1 w-50 h-70 top-[-15%] left-[-10%]">
            <FloatingImage src="/images/image1.jpg" />
          </div>
          <div class="floating-card card-2  w-50 h-70">
            <FloatingImage src="/images/image2.jpg" />
          </div>
          <div class="floating-card card-3 w-50 h-70">
            <FloatingImage src="/images/image3.jpg" />
          </div>
          
        </div>
      </div>
    </div>
  </section>

  <!-- Trending Now -->
<section class="max-w-7xl mx-auto px-6 py-16">
  <div class="flex items-center justify-between mb-8">
    <h3 class="h3">Trending Now</h3>
    <button
      class="text-sm font-semibold hover:opacity-70"
      style="color: #FF6B35;"
      on:click={() => goto('/home')}
    >
      See all →
    </button>
  </div>

  {#if loadingPosts}
    <!-- Shows 5 grey placeholder boxes while loading -->
    <div class="posts-grid">
      {#each Array(5) as _}
        <div class="aspect-[9/16] rounded-2xl skeleton"></div>
      {/each}
    </div>

  {:else if recentPosts.length === 0}
    <p class="text-muted-foreground text-center py-10">No posts yet.</p>

  {:else}
    <!-- 5 real post images from PocketBase -->
    <div class="posts-grid">
      {#each recentPosts as post}
        <button
          class="aspect-[9/16] relative overflow-hidden rounded-2xl group post-card"
          on:click={() => goto('/home')}
        >
          <img
            src={pb.files.getUrl(post, post.image)}
            alt=""
            class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <!-- Username fades in on hover -->
          <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 post-overlay flex flex-col justify-end p-3">
            <div class="flex items-center gap-2">
              <img
                src={post.expand?.user?.avatar
                  ? pb.files.getUrl(post.expand.user, post.expand.user.avatar)
                  : '/images/profilePlaceholder.jpg'}
                alt=""
                class="w-6 h-6 rounded-full object-cover border border-white/40"
              />
              <span class="text-white text-xs font-semibold truncate">
                {post.expand?.user?.username ?? ''}
              </span>
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
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
              <span class="price-tag text-2xl font-bold">Rs. {dish.price}</span>
              <span class="flex gap-3 justify-center text-sm font-semibold text-muted-foreground"> <StarIcon/>{dish.rating}</span>
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
      <div class="absolute top-8 left-16 right-6 z-[1000] pointer-events-none">
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
    border-radius: 1.5rem;
    display: flex;
    align-items: center;
    animation: float 3s ease-in-out infinite;
  }
  
  .card-1 {
    /* top: 10%;
    left: 10%; */
    animation-delay: 0s;
  }
  
  .card-2 {
    top: 50%;
    left: 71%;
    animation-delay: 1s;
  }
  
  .card-3 {
    bottom: 10%;
    left: 31%;
    animation-delay: 1.5s;
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

  .posts-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75rem;
}

/* Subtle lift on hover */
.post-card {
  box-shadow: 0 4px 20px rgba(0,0,0,0.10);
  transition: box-shadow 0.3s ease, transform 0.3s ease;
}
.post-card:hover {
  box-shadow: 0 12px 40px rgba(0,0,0,0.18);
  transform: translateY(-2px);
}

/* Dark gradient at bottom so username text is readable over any image */
.post-overlay {
  background: linear-gradient(to top,
    rgba(0,0,0,0.75) 0%,
    rgba(0,0,0,0.2) 40%,
    transparent 100%
  );
}

/* Shimmer animation for the grey loading placeholders */
.skeleton {
  background: linear-gradient(90deg,
    hsl(var(--muted)) 25%,
    hsl(var(--secondary)) 50%,
    hsl(var(--muted)) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer {
  0%   { background-position: 200% 0;  }
  100% { background-position: -200% 0; }
}

:global(.user-location-ring) {
  position: absolute;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: rgba(59,130,246,0.15);
  border: 2px solid rgba(59,130,246,0.35);
  animation: locationPulse 2s ease-out infinite;
}

@keyframes locationPulse {
  0%   { transform: scale(0.4); opacity: 1;  }
  100% { transform: scale(1.5); opacity: 0; }
}
</style>