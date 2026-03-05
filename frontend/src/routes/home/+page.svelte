<script>
  import { onMount } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import Header from '$lib/components/Header.svelte';
  import { goto } from '$app/navigation';
  import { ArrowRightIcon, MagnifyingGlassIcon } from 'phosphor-svelte';
  import pb from '$lib/pocketbase';

  let map;
  let mapContainer;
  let currentUser = null;

  const foodSpots = [
    { id: 1, name: "Thamel Momo Corner",  lat: 27.7172, lng: 85.3240, type: "Restaurant",   cuisine: "Nepali"   },
    { id: 2, name: "Newari Kitchen",       lat: 27.6915, lng: 85.3209, type: "Home Kitchen", cuisine: "Newari"   },
    { id: 3, name: "Dal Bhat House",       lat: 27.7089, lng: 85.3312, type: "Restaurant",   cuisine: "Nepali"   },
    { id: 4, name: "Street Food Hub",      lat: 27.7000, lng: 85.3100, type: "Street Food",  cuisine: "Mixed"    },
    { id: 5, name: "Himalayan Sweets",     lat: 27.7250, lng: 85.3400, type: "Bakery",       cuisine: "Desserts" }
  ];

  const featuredDishes = [
    { id: 1, name: "Momo Platter",    price: "250", image: "🥟", rating: 4.8, seller: "Thamel Momo Corner" },
    { id: 2, name: "Dal Bhat Set",    price: "350", image: "🍛", rating: 4.9, seller: "Dal Bhat House"      },
    { id: 3, name: "Newari Khaja Set",price: "450", image: "🍱", rating: 4.7, seller: "Newari Kitchen"      }
  ];

  const trendingNow = [
    { id: 1, name: "Chatamari", image: "🫓", orders: "234" },
    { id: 2, name: "Sel Roti",  image: "🍩", orders: "189" },
    { id: 3, name: "Yomari",    image: "🥟", orders: "156" },
    { id: 4, name: "Samosa",    image: "🥟", orders: "298" }
  ];

  // The three floating food cards — image paths point to static/images/
  const floatingFoods = [
    { name: "Momo",     sub: "Dumplings",      src: "/images/image1.jpg" },
    { name: "Dal Bhat", sub: "Traditional Set", src: "/images/image2.jpg" },
    { name: "Sel Roti", sub: "Rice Donut",      src: "/images/image3.jpg" },
  ];

  // CSS class for each card's position — index maps to card-0, card-1, card-2
  const cardPositionClass = ["card-0", "card-1", "card-2"];

  let searchQuery = '';
  let activeCategory = 'all';

  // Read the current user from PocketBase authStore on mount
  // accountType field on the user record is what separates business from personal
  onMount(() => {
    currentUser = pb.authStore.record ?? pb.authStore.model;
  });

  // Derived: true when the logged-in user has upgraded to a business account
  // This single reactive variable drives ALL the conditional UI differences
  $: isBusiness = currentUser?.accountType === 'business';

  onMount(() => {
    currentUser = pb.authStore.record ?? pb.authStore.model;

    map = L.map(mapContainer, {
      center: [27.7172, 85.3240],
      zoom: 13,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

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

  function handleSearch() { console.log('Searching for:', searchQuery); }
  function setCategory(cat) { activeCategory = cat; }
</script>

<div class="min-h-screen bg-background">
  <Header />

  <!-- ══════════════════════════════════════════
       HERO SECTION
  ══════════════════════════════════════════ -->
  <section class="hero-section relative overflow-hidden">
    <div class="max-w-7xl mx-auto px-6 py-20 lg:py-28">
      <div class="grid lg:grid-cols-2 gap-12 items-center">

        <!-- LEFT: copy + CTA buttons -->
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
            Connect with home cooks, restaurants, and food lovers across Nepal.
            Share recipes, order dishes, and celebrate our culinary heritage.
          </p>

          <div class="flex flex-wrap gap-4">
            <!-- Always visible -->
            <button
              class="cta-primary px-8 py-4 rounded-full font-bold inline-flex items-center gap-3 transition-all"
              on:click={() => goto('/search')}
            >
              <span>EXPLORE FOOD</span>
              <ArrowRightIcon size={24} />
            </button>

            <!-- Always visible -->
            <button
              class="cta-secondary px-8 py-4 border-2 border-border rounded-full font-bold transition-all"
              on:click={() => goto('/create')}
            >
              CREATE YOUR POSTS
            </button>

            <!--
              BUSINESS ACCOUNT DIFFERENTIATION — BUTTON 3:
              ─────────────────────────────────────────────
              isBusiness === false  →  show "START SELLING FOOD"
                                       clicking goes to /profile/edit
                                       where they can upgrade to a business account

              isBusiness === true   →  show "GO TO DASHBOARD"
                                       clicking goes to /business/dashboard
                                       which is only useful once they ARE a business

              The {#if} block swaps the entire button so the label, destination,
              and visual style all change together. There's no way a personal user
              accidentally ends up on the business dashboard from here.
            -->
            {#if isBusiness}
              <button
                class="cta-primary px-8 py-4 rounded-full font-bold inline-flex items-center gap-3 transition-all"
                on:click={() => goto('/business/dashboard')}
              >
                <span>GO TO DASHBOARD</span>
                <ArrowRightIcon size={24} />
              </button>
            {:else}
              <button
                class="cta-secondary px-8 py-4 border-2 border-border rounded-full font-bold transition-all"
                on:click={() => goto('/profile/edit')}
              >
                START SELLING FOOD
              </button>
            {/if}
          </div>
        </div>

        <!-- RIGHT: three floating food image cards -->
        <!--
          The container is relative + fixed height so the absolutely-positioned
          cards have a coordinate system to anchor against.
          hidden lg:block = only renders on large screens, no mobile clutter.
        -->
        <div class="relative h-[500px] hidden lg:block">
          {#each floatingFoods as food, i}
            <!--
              cardPositionClass[i] applies card-0 / card-1 / card-2
              which set top/left/right/bottom in the <style> block below.
              The animation-delay is inlined so each card bobs at a different time.
            -->
            <div
              class="floating-card {cardPositionClass[i]}"
              style="animation-delay: {i}s;"
            >
              <!--
                IMAGE SIZING EXPLANATION:
                ─────────────────────────
                .card-img-wrap is a fixed 72×72px box.
                overflow-hidden clips the photo to that box.
                border-radius: 0.875rem rounds the corners of the clip mask,
                  making the image appear with rounded corners even though
                  <img> itself has no border-radius — the parent clips it.
                flex-shrink: 0 stops the box from squishing when the card
                  is narrower than image+text combined.

                Inside the box, the <img> has:
                  width: 100%   → fill the 72px wide box exactly
                  height: 100%  → fill the 72px tall box exactly
                  object-fit: cover → scale the photo so it covers the entire
                    72×72 area without distorting, cropping excess from edges.
                    This means a portrait photo won't squash to a square —
                    it fills the square and the top/bottom edges get hidden.
              -->
              <div class="card-img-wrap">
                <img
                  src={food.src}
                  alt={food.name}
                  class="card-img"
                />
              </div>

              <!-- Text column: name on top, subtitle below -->
              <div class="card-text">
                <span class="card-name">{food.name}</span>
                <span class="card-sub">{food.sub}</span>
              </div>
            </div>
          {/each}
        </div>

      </div>
    </div>
  </section>

  <!-- ══════════════════════════════════════════
       TRENDING NOW
  ══════════════════════════════════════════ -->
  <section class="max-w-7xl mx-auto px-6 py-16">
    <h3 class="h3 mb-8">Trending Now</h3>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      {#each trendingNow as item}
        <button class="trending-card bg-background border-2 border-border p-6 rounded-2xl hover:border-orange transition-all hover:shadow-lg">
          <div class="text-5xl mb-3">{item.image}</div>
          <h4 class="font-bold mb-1">{item.name}</h4>
          <p class="text-xs text-muted-foreground">{item.orders} orders today</p>
        </button>
      {/each}
    </div>
  </section>

  <!-- ══════════════════════════════════════════
       TODAY'S SPECIALS
  ══════════════════════════════════════════ -->
  <section class="max-w-7xl mx-auto px-6 py-16">
    <div class="flex items-center justify-between mb-8">
      <h3 class="h2">Today's Specials</h3>
      <button class="px-6 py-2.5 border-2 border-border rounded-full font-semibold text-sm hover:border-orange transition-all">
        View All →
      </button>
    </div>

    <div class="grid md:grid-cols-3 gap-6">
      {#each featuredDishes as dish}
        <div class="dish-card bg-background border-2 border-border rounded-3xl overflow-hidden transition-all duration-300">
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

  <!-- ══════════════════════════════════════════
       MAP SECTION
  ══════════════════════════════════════════ -->
  <section class="max-w-7xl mx-auto px-6 py-16">
    <div class="mb-8 space-y-6">
      <div>
        <h2 class="h2 mb-2">Explore Food Spots</h2>
        <p class="text-content text-muted-foreground">
          Discover restaurants, home kitchens, and street food across Kathmandu
        </p>
      </div>

      <div class="flex flex-wrap gap-3">
        {#each [
          { value: 'all',        label: 'All Places'    },
          { value: 'restaurant', label: 'Restaurants'   },
          { value: 'home',       label: 'Home Kitchens' },
          { value: 'street',     label: 'Favourites'    },
        ] as cat}
          <button
            class="category-btn px-5 py-2.5 rounded-full font-semibold text-sm transition-all"
            class:active={activeCategory === cat.value}
            on:click={() => setCategory(cat.value)}
          >
            {cat.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="relative h-[600px] rounded-3xl overflow-hidden border-2 border-border shadow-2xl">
      <div bind:this={mapContainer} class="w-full h-full"></div>

      <div class="absolute top-6 left-6 right-6 z-[1000] pointer-events-none">
        <div class="search-box max-w-md bg-background shadow-2xl rounded-full px-6 py-4 flex items-center gap-3 pointer-events-auto border border-border">
          <MagnifyingGlassIcon size={16} />
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
  /* ── Hero ── */
  .hero-section {
    background: linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--secondary)) 100%);
  }
  .hero-badge {
    border-color: #FF6B35;
    color: #FF6B35;
    background-color: hsl(var(--background));
  }

  /* ── Buttons ── */
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

  /* ══════════════════════════════════════════
     FLOATING CARDS — full explanation
  ══════════════════════════════════════════

  WHY these rules exist and what each one does:
  ─────────────────────────────────────────────

  .floating-card
    position: absolute
      Takes the card OUT of normal document flow. Without this, the three
      cards would stack vertically and push other content down. absolute
      means "position me relative to the nearest positioned ancestor",
      which is the `relative h-[500px]` parent div.

    display: flex + align-items: center + gap
      Makes image and text sit side-by-side horizontally and vertically
      centred — like a row with the photo on the left, text on the right.

    padding: 0.75rem 1.25rem 0.75rem 0.75rem
      Left/top/bottom padding is smaller (0.75rem) so the image hugs the
      left edge. Right padding is larger (1.25rem) so the text has
      breathing room before the card edge.

    border-radius: 1.5rem
      Pill-ish rounded corners, matches the rest of the app's card style.

    animation: float 3s ease-in-out infinite
      Runs the @keyframes float (translateY 0→-18px→0) forever.
      Each card has a different animation-delay set inline in the template
      (0s, 1s, 2s) so they bob at offset times — creates the illusion of
      independent floating objects rather than three things moving together.

    min-width: 200px
      Prevents the card from collapsing narrower than its content while
      the image is still loading (before the browser knows the img size).

  .card-0 / .card-1 / .card-2
    top/left/right/bottom percentages anchor each card inside the
    relative parent. Using % instead of px means positioning scales
    if the parent height ever changes.

    card-0: top-left   — the "Momo" card
    card-1: mid-right  — the "Dal Bhat" card
    card-2: bottom-mid — the "Sel Roti" card

  .card-img-wrap
    width/height: 72px
      Fixed pixel size. The image will ALWAYS be exactly this box —
      no matter how tall or wide the source image file is.

    border-radius: 0.875rem
      This rounds the CORNERS OF THE CLIP MASK. The image inside has no
      border-radius itself — the parent clips it into a rounded square.
      overflow: hidden is what does the actual clipping.

    overflow: hidden
      The single most important rule for image sizing here.
      Without it, if the image is 800×600px it would spill outside the
      72×72 box and break the card layout entirely.
      With it, anything outside the 72×72 box is invisibly cut off.

    flex-shrink: 0
      Tells the flexbox NOT to shrink this box when space is tight.
      Without this, if the card text is long, the image could shrink
      below 72px to make room for the text.

  .card-img
    width: 100% + height: 100%
      Fill the 72×72 wrap box completely — no gaps.

    object-fit: cover
      This is the key rule for making any photo look good in a fixed box.
      It means: "scale the image up/down so it completely COVERS the box,
      keeping aspect ratio, then crop the overflow".
      Result: a tall portrait photo → fills the box, top and bottom crop.
              a wide landscape photo → fills the box, left and right crop.
              The photo is never stretched or squashed.
      display: block removes the 4px gap browsers add below inline images.

  .card-text
    flex-direction: column makes name and subtitle stack vertically.

  .card-name / .card-sub
    Standard text styles. card-sub is muted-foreground (grey) to create
    a visual hierarchy — name stands out, subtitle recedes.

  ══════════════════════════════════════════ */

  .floating-card {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.75rem 1.25rem 0.75rem 0.75rem;
    background-color: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 1.5rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
    min-width: 200px;
    animation: float 3s ease-in-out infinite;
  }

  /* Card positions within the relative parent */
  .card-0 { top: 5%;   left: 5%;  }
  .card-1 { top: 42%;  right: 0%; }
  .card-2 { bottom: 5%; left: 20%; }

  /* Image container — fixed 72×72 box that clips the photo */
  .card-img-wrap {
    width: 72px;
    height: 72px;
    border-radius: 0.875rem;
    overflow: hidden;
    flex-shrink: 0;
    background-color: hsl(var(--muted)); /* shows while image loads */
  }

  /* The actual <img> — fills the box, covers without distorting */
  .card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* Text beside the image */
  .card-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .card-name {
    font-weight: 700;
    font-size: 1rem;
    color: hsl(var(--foreground));
    line-height: 1.2;
  }
  .card-sub {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  @keyframes float {
    0%, 100% { transform: translateY(0px);  }
    50%       { transform: translateY(-18px); }
  }

  /* ── Trending ── */
  .trending-card:hover { border-color: #FF6B35; }

  /* ── Dish cards ── */
  .dish-card:hover {
    border-color: #FF6B35;
    box-shadow: 0 20px 60px rgba(0,0,0,0.08);
  }
  .price-tag    { color: #FF6B35; }
  .add-to-cart  { background-color: #FF6B35; color: hsl(var(--primary-foreground)); }
  .add-to-cart:hover { background-color: #E85A2A; }

  /* ── Category buttons ── */
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

  /* ── Leaflet marker ── */
  :global(.custom-marker)  { background: transparent !important; border: none !important; }
  :global(.marker-pin)     { position: relative; width: 40px; height: 40px; }
  :global(.marker-inner)   {
    width: 40px; height: 40px;
    background-color: hsl(var(--background));
    border: 3px solid #FF6B35;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    animation: pulse 2s ease-in-out infinite;
  }
  :global(.marker-inner:hover) {
    transform: scale(1.2);
    box-shadow: 0 6px 20px rgba(255,107,53,0.4);
  }
  :global(.marker-icon) { font-size: 1.5rem; }

  @keyframes pulse {
    0%, 100% { box-shadow: 0 4px 12px rgba(255,107,53,0.3); }
    50%       { box-shadow: 0 4px 20px rgba(255,107,53,0.6); }
  }

  :global(.leaflet-popup-content-wrapper) {
    border-radius: 0.75rem;
    border: 2px solid hsl(var(--border));
    background-color: hsl(var(--background));
  }
  :global(.leaflet-popup-content)  { margin: 0 !important; }
  :global(.leaflet-popup-tip) {
    background-color: hsl(var(--background));
  }
</style>