<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { X, ChevronLeft, ChevronRight } from 'lucide-svelte';

  export let highlight;
  export let onClose;

  let items = [];
  let currentIndex = 0;
  let loading = true;
  let progressBars = [];
  let isPaused = false;
  let progressInterval;

  onMount(async () => {
    await loadItems();
    startProgress();
    
    return () => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    };
  });

  async function loadItems() {
    try {
      loading = true;
      const result = await pb.collection('highlight_items').getFullList({
        filter: `highlight = "${highlight.id}"`,
        sort: 'order'
      });

      items = result;
      progressBars = items.map(() => 0);
      console.log('Loaded highlight items:', items);
    } catch (err) {
      console.error('Failed to load highlight items:', err);
    } finally {
      loading = false;
    }
  }

  function startProgress() {
    if (progressInterval) {
      clearInterval(progressInterval);
    }

    progressInterval = setInterval(() => {
      if (!isPaused && items.length > 0) {
        progressBars[currentIndex] = Math.min(progressBars[currentIndex] + 2, 100);
        progressBars = [...progressBars];

        if (progressBars[currentIndex] >= 100) {
          goToNext();
        }
      }
    }, 100); // Update every 100ms (5 seconds total per item)
  }

  function goToNext() {
    if (currentIndex < items.length - 1) {
      progressBars[currentIndex] = 100;
      currentIndex++;
      progressBars[currentIndex] = 0;
      progressBars = [...progressBars];
    } else {
      // All items viewed, close modal
      onClose();
    }
  }

  function goToPrevious() {
    if (currentIndex > 0) {
      progressBars[currentIndex] = 0;
      currentIndex--;
      progressBars[currentIndex] = 0;
      progressBars = [...progressBars];
    }
  }

  function handleKeydown(e) {
    if (e.key === 'ArrowRight') {
      goToNext();
    } else if (e.key === 'ArrowLeft') {
      goToPrevious();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  function handleBackgroundClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const halfWidth = rect.width / 2;

    if (x < halfWidth) {
      goToPrevious();
    } else {
      goToNext();
    }
  }

  function getMediaUrl(item) {
    return pb.files.getUrl(item, item.media);
  }

  function isVideo(item) {
    return item.media && (
      item.media.endsWith('.mp4') ||
      item.media.endsWith('.mov') ||
      item.media.endsWith('.webm')
    );
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="fixed inset-0 bg-black z-50 flex items-center justify-center">
  <!-- Close Button -->
  <button
    on:click={onClose}
    class="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full z-20"
  >
    <X class="w-6 h-6" />
  </button>

  {#if loading}
    <div class="text-white text-center">
      <p>Loading...</p>
    </div>
  {:else if items.length === 0}
    <div class="text-white text-center">
      <p>No items in this highlight</p>
    </div>
  {:else}
    <!-- Main Content Container -->
    <div class="relative w-full h-full max-w-lg max-h-[90vh] flex flex-col">
      <!-- Progress Bars -->
      <div class="absolute top-0 left-0 right-0 flex gap-1 p-2 z-10">
        {#each progressBars as progress, index}
          <div class="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
            <div
              class="h-full bg-white transition-all duration-100"
              style="width: {index < currentIndex ? 100 : index === currentIndex ? progress : 0}%"
            />
          </div>
        {/each}
      </div>

      <!-- Header -->
      <div class="absolute top-8 left-0 right-0 px-4 py-2 flex items-center gap-3 z-10">
        <div class="w-10 h-10 rounded-full border-2 border-white overflow-hidden bg-muted">
          {#if highlight.cover_image}
            <img
              src={pb.files.getUrl(highlight, highlight.cover_image)}
              alt={highlight.title}
              class="w-full h-full object-cover"
            />
          {:else}
            <div class="w-full h-full flex items-center justify-center bg-primary/20">
              <span class="text-white font-bold">
                {highlight.title.charAt(0).toUpperCase()}
              </span>
            </div>
          {/if}
        </div>
        <span class="text-white font-semibold">{highlight.title}</span>
      </div>

      <!-- Media Display -->
      <button
        class="flex-1 relative cursor-pointer w-full bg-transparent border-0 p-0"
        on:click={handleBackgroundClick}
        on:mouseenter={() => isPaused = true}
        on:mouseleave={() => isPaused = false}
        aria-label="Navigate through highlight items"
      >
        {#each items as item, index}
          {#if index === currentIndex}
            <div class="absolute inset-0 flex items-center justify-center">
              {#if isVideo(item)}
                <video
                  src={getMediaUrl(item)}
                  class="max-w-full max-h-full object-contain"
                  autoplay
                  muted
                  loop
                />
              {:else}
                <img
                  src={getMediaUrl(item)}
                  alt="Highlight item {index + 1}"
                  class="max-w-full max-h-full object-contain"
                />
              {/if}
            </div>
          {/if}
        {/each}

        <!-- Navigation Arrows -->
        {#if currentIndex > 0}
          <button
            on:click|stopPropagation={goToPrevious}
            class="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
          >
            <ChevronLeft class="w-6 h-6" />
          </button>
        {/if}

        {#if currentIndex < items.length - 1}
          <button
            on:click|stopPropagation={goToNext}
            class="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
          >
            <ChevronRight class="w-6 h-6" />
          </button>
        {/if}
      </button>

      <!-- Counter -->
      <div class="absolute bottom-4 left-0 right-0 text-center text-white text-sm">
        {currentIndex + 1} / {items.length}
      </div>
    </div>
  {/if}
</div>