<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { CameraIcon, ArrowLeftIcon } from "phosphor-svelte";
  import Header from '$lib/components/Header.svelte';


  let user = null;
  let selectedFile = null;
  let previewUrl = null;
  let caption = '';
  let uploading = false;
  let dragActive = false;
  let canvasRef = null; // hidden canvas for processing

  let aspectRatio = 'square';
  let filterActive = 'none';
  let filterScrollContainer;

  const filters = [
    { name: 'none',       label: 'Original' },
    { name: 'grayscale',  label: 'Mono'     },
    { name: 'sepia',      label: 'Sepia'    },
    { name: 'brightness', label: 'Bright'   },
    { name: 'contrast',   label: 'Vivid'    },
    { name: 'saturate',   label: 'Pop'      },
    { name: 'huerotate',  label: 'Cool'     },
    { name: 'warm',       label: 'Warm'     },
  ];

  // Maps filter names → CSS filter strings (used both for preview AND canvas)
  const filterStyles = {
    none:       '',
    grayscale:  'grayscale(100%)',
    sepia:      'sepia(60%)',
    brightness: 'brightness(1.2) contrast(1.1)',
    contrast:   'contrast(1.3) saturate(1.3)',
    saturate:   'saturate(1.8) contrast(1.1)',
    huerotate:  'hue-rotate(180deg) saturate(1.2)',
    warm:       'sepia(30%) saturate(1.4) brightness(1.05)',
  };

  // Aspect ratios as [width, height] — null means original
  const aspectRatios = {
    square:    [1, 1],
    portrait:  [4, 5],
    landscape: [16, 9],
    original:  null,
  };

  onMount(() => {
    if (!pb.authStore.isValid) {
      goto('/login');
      return;
    }
    user = pb.authStore.record ?? pb.authStore.model;
  });

  function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setFile(file);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    dragActive = false;
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setFile(file);
    }
  }

  function setFile(file) {
    selectedFile = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
  }

  function handleDragOver(event) { event.preventDefault(); dragActive = true; }
  function handleDragLeave() { dragActive = false; }

  function removeImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    selectedFile = null;
    previewUrl = null;
    caption = '';
    filterActive = 'none';
    aspectRatio = 'square';
  }

  function getFilterStyle(filter) {
    return filterStyles[filter] || '';
  }

  function getAspectPaddingBottom(ratio) {
    const map = {
      square:    '100%',
      portrait:  '125%',
      landscape: '56.25%',
      original:  '0',
    };
    return map[ratio] || '100%';
  }

  /**
   * Core fix: render image + filter + crop onto a canvas,
   * then export as a Blob to upload instead of the raw file.
   */
  function processImageToBlob() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef;

        // Determine output dimensions based on aspect ratio
        const ratio = aspectRatios[aspectRatio];
        let outW, outH;

        if (!ratio) {
          // Original — use natural image dimensions
          outW = img.naturalWidth;
          outH = img.naturalHeight;
        } else {
          const [rW, rH] = ratio;
          const targetRatio = rW / rH;
          const imgRatio = img.naturalWidth / img.naturalHeight;

          if (imgRatio > targetRatio) {
            // Image is wider than target — crop sides
            outH = img.naturalHeight;
            outW = Math.round(outH * targetRatio);
          } else {
            // Image is taller than target — crop top/bottom
            outW = img.naturalWidth;
            outH = Math.round(outW / targetRatio);
          }
        }

        canvas.width = outW;
        canvas.height = outH;

        const ctx = canvas.getContext('2d');

        // Apply CSS filter string to canvas context
        const cssFilter = filterStyles[filterActive];
        if (cssFilter) {
          ctx.filter = cssFilter;
        }

        // Center-crop: calculate source x/y offset
        const srcX = Math.round((img.naturalWidth - outW) / 2);
        const srcY = Math.round((img.naturalHeight - outH) / 2);

        ctx.drawImage(
          img,
          srcX, srcY, outW, outH,  // source rect (cropped)
          0,    0,    outW, outH   // destination rect (full canvas)
        );

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob failed'));
          },
          'image/jpeg',
          0.92 // quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = previewUrl;
    });
  }

  async function handlePost() {
    if (!selectedFile || uploading) return;

    if (!pb.authStore.isValid) {
      goto('/login');
      return;
    }

    uploading = true;

    try {
      // Process image with filter + crop baked in
      const processedBlob = await processImageToBlob();

      // Create a File from the blob so it has a proper filename
      const processedFile = new File(
        [processedBlob],
        selectedFile.name.replace(/\.[^.]+$/, '.jpg'),
        { type: 'image/jpeg' }
      );

      const formData = new FormData();
      formData.append('image', processedFile);
      formData.append('caption', caption);
      formData.append('user', (pb.authStore.record ?? pb.authStore.model).id);

      await pb.collection('posts').create(formData);
      goto('/profile');
    } catch (err) {
      console.error('Failed to create post:', err);

      if (err.status === 401 || err.status === 403) {
        pb.authStore.clear();
        goto('/login');
        return;
      }

      alert(err.response?.data?.message || err.message || 'Failed to create post');
    } finally {
      uploading = false;
    }
  }

  function triggerFileInput() {
    document.getElementById('file-input').click();
  }
</script>

<!-- Hidden canvas used for image processing — never shown to user -->
<canvas bind:this={canvasRef} class="hidden" aria-hidden="true"></canvas>

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />

  <main class="flex-1 overflow-y-auto">
    <div class="max-w-4xl mx-auto p-6">
      <div class="flex mb-8 gap-4 items-center">
        <button on:click={() => window.history.back} class="p-2 hover:bg-muted rounded-lg transition-colors">
          <ArrowLeftIcon />
        </button>
        <h1 class="text-2xl font-semibold">Create new post</h1>
      </div>

      {#if !previewUrl}
        <!-- Upload Area -->
        <div
          class="border-2 border-dashed rounded-2xl p-16 text-center transition-colors cursor-pointer
            {dragActive ? 'border-primary bg-muted' : 'border-border hover:border-primary/50'}"
          on:drop={handleDrop}
          on:dragover={handleDragOver}
          on:dragleave={handleDragLeave}
          role="button"
          tabindex="0"
          on:click={triggerFileInput}
          on:keypress={(e) => e.key === 'Enter' && triggerFileInput()}
        >
          <div class="flex flex-col items-center gap-4">
            <div class="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <CameraIcon class="w-10 h-10 text-muted-foreground" />
            </div>
            <div>
              <h2 class="text-xl font-medium mb-2">Drag photos here</h2>
              <p class="text-muted-foreground mb-4">or</p>
              <button
                class="px-6 py-2 rounded-lg text-white font-medium hover:opacity-90 transition-opacity"
                style="background-color: #FF6B35;"
                on:click|stopPropagation={triggerFileInput}
              >
                Select from computer
              </button>
            </div>
          </div>
        </div>

        <input
          id="file-input"
          type="file"
          accept="image/*"
          class="hidden"
          on:change={handleFileSelect}
        />

      {:else}
        <!-- Preview and Edit Area -->
        <div class="border border-border rounded-2xl overflow-hidden bg-card">
          <div class="grid grid-cols-1 lg:grid-cols-[1.2fr,1fr]">

            <!-- Left: Image Preview -->
            <div class="bg-black flex items-center justify-center min-h-[400px] lg:min-h-[500px]">
              <div class="w-full h-full flex items-center justify-center p-6">
                {#if aspectRatio === 'original'}
                  <img
                    src={previewUrl}
                    alt="Preview"
                    class="max-w-full max-h-[450px] w-auto h-auto object-contain"
                    style="filter: {getFilterStyle(filterActive)}; transition: filter 0.2s ease;"
                  />
                {:else}
                  <div
                    class="relative w-full"
                    style="max-width: 420px; padding-bottom: {getAspectPaddingBottom(aspectRatio)};"
                  >
                    <img
                      src={previewUrl}
                      alt="Preview"
                      class="absolute inset-0 w-full h-full object-cover"
                      style="filter: {getFilterStyle(filterActive)}; transition: filter 0.2s ease;"
                    />
                  </div>
                {/if}
              </div>
            </div>

            <!-- Right: Controls -->
            <div class="flex flex-col border-l border-border">

              <!-- Caption -->
              <div class="p-4 border-b border-border">
                <textarea
                  bind:value={caption}
                  placeholder="Write a caption..."
                  class="w-full bg-transparent border-none resize-none focus:outline-none text-sm"
                  rows="6"
                  maxlength="2200"
                />
                <div class="text-right text-xs text-muted-foreground mt-1">
                  {caption.length}/2,200
                </div>
              </div>

              <!-- Filters -->
              <div class="p-4 border-b border-border">
                <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Filter
                </p>
                <div
                  bind:this={filterScrollContainer}
                  class="flex gap-3 overflow-x-auto pb-2 filter-scroll"
                  style="cursor: grab;"
                  on:mousedown={(e) => {
                    const slider = e.currentTarget;
                    slider.style.cursor = 'grabbing';
                    let startX = e.pageX - slider.offsetLeft;
                    let scrollLeft = slider.scrollLeft;

                    const onMove = (e) => {
                      const x = e.pageX - slider.offsetLeft;
                      slider.scrollLeft = scrollLeft - (x - startX) * 1.5;
                    };
                    const onUp = () => {
                      slider.style.cursor = 'grab';
                      document.removeEventListener('mousemove', onMove);
                      document.removeEventListener('mouseup', onUp);
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                  }}
                >
                  {#each filters as filter}
                    <button
                      class="flex-shrink-0 flex flex-col items-center gap-1.5"
                      on:click={() => filterActive = filter.name}
                    >
                      <div
                        class="w-14 h-14 rounded-xl overflow-hidden border-2 transition-all"
                        style={filterActive === filter.name
                          ? 'border-color: #FF6B35; box-shadow: 0 0 0 2px #FF6B3530;'
                          : 'border-color: var(--border);'}
                      >
                        <img
                          src={previewUrl}
                          alt={filter.label}
                          class="w-full h-full object-cover pointer-events-none select-none"
                          style="filter: {getFilterStyle(filter.name)}; transition: filter 0.2s ease;"
                          draggable="false"
                        />
                      </div>
                      <span
                        class="text-[10px] whitespace-nowrap font-medium"
                        style={filterActive === filter.name ? 'color: #FF6B35;' : 'color: var(--muted-foreground);'}
                      >
                        {filter.label}
                      </span>
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Aspect Ratio -->
              <div class="p-4 border-b border-border">
                <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Crop
                </p>
                <div class="grid grid-cols-4 gap-2">
                  {#each [
                    { value: 'original', label: 'Original' },
                    { value: 'square',   label: '1:1'      },
                    { value: 'portrait', label: '4:5'      },
                    { value: 'landscape',label: '16:9'     },
                  ] as ratio}
                    <button
                      class="py-2 px-1 rounded-xl border text-xs font-medium transition-all"
                      style={aspectRatio === ratio.value
                        ? 'background-color: #FF6B35; color: white; border-color: #FF6B35;'
                        : 'border-color: var(--border); color: var(--muted-foreground);'}
                      on:click={() => aspectRatio = ratio.value}
                    >
                      {ratio.label}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Info note so user understands what's happening -->
              <div class="px-4 py-3 bg-muted/40">
                <p class="text-xs text-muted-foreground">
                  ✓ Filter and crop will be applied to the uploaded image
                </p>
              </div>

              <!-- Actions -->
              <div class="p-4 mt-auto space-y-2">
                <button
                  class="w-full py-2.5 rounded-xl text-white font-semibold text-sm
                         hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  style="background-color: #FF6B35;"
                  on:click={handlePost}
                  disabled={uploading}
                >
                  {#if uploading}
                    <span class="flex items-center justify-center gap-2">
                      <svg class="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Processing & uploading...
                    </span>
                  {:else}
                    Share
                  {/if}
                </button>

                <button
                  class="w-full border border-border py-2.5 rounded-xl hover:bg-muted
                         text-sm font-medium transition-colors"
                  on:click={removeImage}
                  disabled={uploading}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </main>
</div>

<style>
  .filter-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgba(155,155,155,0.3) transparent;
  }
  .filter-scroll::-webkit-scrollbar { height: 4px; }
  .filter-scroll::-webkit-scrollbar-track { background: transparent; }
  .filter-scroll::-webkit-scrollbar-thumb {
    background-color: rgba(155,155,155,0.3);
    border-radius: 2px;
  }
</style>