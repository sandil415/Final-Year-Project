<script>
	import Sidebar from "$lib/components/Sidebar.svelte";

  const bentoItems = [
    { id: 1, title: 'Grandma’s Kitchen', img: '/images/Curry.jpg' },
    { id: 2, title: 'Street Special', img: '/images/Stalls.jpg' },
    { id: 3, title: 'Top Rated', img: '/images/Advertisement.jpg' },
  ];
</script>

<div class="min-h-screen bg-background flex">
  <Sidebar></Sidebar>
  <main class="flex-1 p-8 grid grid-cols-12 gap-6">
    <!-- LEFT / CENTER -->
    <section class="col-span-12 lg:col-span-8 space-y-6">
      <!-- BIG BENTO -->
      <div class="relative h-[420px] rounded-3xl overflow-hidden">
        <img
          src="/images/Curry.jpg"
          alt="Hero"
          class="w-full h-full object-cover"
        />

        <div class="absolute inset-0 bg-black/30 flex items-end p-6">
          <div>
            <h2 class="text-white text-2xl font-semibold">
              Grandma’s Kitchen
            </h2>
            <p class="text-white/80 text-sm">
              17k followers
            </p>
          </div>
        </div>
      </div>

      <!-- BOTTOM BENTO GRID -->
      <div class="grid grid-cols-3 gap-6">
        {#each bentoItems as item}
          <div
            class="h-48 bg-muted rounded-2xl overflow-hidden cursor-pointer
                   hover:scale-[1.02] transition-transform"
          >
            <img
              src={item.img}
              alt={item.title}
              class="w-full h-full object-cover"
            />
          </div>
        {/each}
      </div>
    </section>

    <!-- RIGHT COLUMN -->
    <aside class="col-span-12 lg:col-span-4">
      <div class="rounded-3xl overflow-hidden h-[420px]">
        <img
          src="/images/Influencer.jpg"
          alt="Reels placeholder"
          class="w-full h-full object-cover"
        />
      </div>
    </aside>
  </main>
</div>
