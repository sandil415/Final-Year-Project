<script>
  import Sidebar from '$lib/components/Sidebar.svelte';
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import { Camera } from 'lucide-svelte';
  import { CameraIcon, ArrowLeftIcon} from "phosphor-svelte";
	import Header from '$lib/components/Header.svelte';
  

  let user = null;
  let selectedFile = null;
  let previewUrl = null;
  let caption = '';
  let uploading = false;
  let dragActive = false;

  // Aspect ratio and crop settings
  let aspectRatio = 'square'; // square, portrait, landscape, original
  let filterActive = 'none';
  let filterScrollContainer;

  const filters = [
    { name: 'none', label: 'Original' },
    { name: 'grayscale', label: 'Mono' },
    { name: 'sepia', label: 'Sepia' },
    { name: 'brightness', label: 'Bright' },
    { name: 'contrast', label: 'Vivid' },
    { name: 'saturate', label: 'Pop' },
    { name: 'huerotate', label: 'Cool' },
    { name: 'warm', label: 'Warm' },
  ];

  onMount(async () => {
    // Check auth first
    if (!pb.authStore.isValid) {
      console.log('Not authenticated, redirecting to login');
      goto('/login');
      return;
    }
    
    user = pb.authStore.model;
    console.log('User authenticated:', user);
  });

  function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      selectedFile = file;
      previewUrl = URL.createObjectURL(file);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    dragActive = false;
    
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      selectedFile = file;
      previewUrl = URL.createObjectURL(file);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    dragActive = true;
  }

  function handleDragLeave() {
    dragActive = false;
  }

  function removeImage() {
    selectedFile = null;
    previewUrl = null;
    caption = '';
    filterActive = 'none';
    aspectRatio = 'square';
  }

  function getFilterStyle(filter) {
    const filters = {
      none: '',
      grayscale: 'grayscale(100%)',
      sepia: 'sepia(60%)',
      brightness: 'brightness(1.2) contrast(1.1)',
      contrast: 'contrast(1.3) saturate(1.3)',
      saturate: 'saturate(1.8) contrast(1.1)',
      huerotate: 'hue-rotate(180deg) saturate(1.2)',
      warm: 'sepia(30%) saturate(1.4) brightness(1.05)',
    };
    return filters[filter] || '';
  }

  function getAspectRatioStyle(ratio) {
    const styles = {
      square: { paddingBottom: '100%' }, // 1:1
      portrait: { paddingBottom: '125%' }, // 4:5
      landscape: { paddingBottom: '56.25%' }, // 16:9
      original: { paddingBottom: '0' },
    };
    return styles[ratio] || styles.square;
  }

  async function handlePost() {
    if (!selectedFile || uploading) return;

    // Double-check authentication
    if (!pb.authStore.isValid || !pb.authStore.model) {
      console.error('User not authenticated');
      alert('You must be logged in to create a post.');
      goto('/login');
      return;
    }

    uploading = true;

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('caption', caption);
      formData.append('user', pb.authStore.model.id);

      console.log('Creating post...');
      console.log('User ID:', pb.authStore.model.id);
      console.log('Auth token exists:', !!pb.authStore.token);

      const post = await pb.collection('posts').create(formData);

      console.log('Post created successfully:', post);
      
      // Redirect to user's profile
      goto(`/profile`);
    } catch (err) {
      console.error('Failed to create post:', err);
      console.error('Error details:', err.response?.data);
      console.error('Error message:', err.message);
      
      // Check if it's an auth error
      if (err.status === 401 || err.status === 403) {
        alert('Authentication error. Please log in again.');
        pb.authStore.clear();
        goto('/login');
        return;
      }
      
      const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
      alert(`Failed to create post: ${errorMsg}`);
    } finally {
      uploading = false;
    }
  }

  function triggerFileInput() {
    document.getElementById('file-input').click();
  }
</script>

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <!-- <Sidebar /> -->
  <Header></Header>

  <main class="flex-1 overflow-y-auto">
    <div class="max-w-4xl mx-auto p-6">
      <div class="flex mb-8 gap-4">
        <button on:click={goto('/demo')}>
        <ArrowLeftIcon/>
        </button>
        <h1 class="text-2xl font-semibold">Create new post</h1>
      </div>

      {#if !previewUrl}
        <!-- Upload Area -->
        <div
          class="border-2 border-dashed rounded-lg p-16 text-center transition-colors {dragActive
            ? 'border-primary bg-muted'
            : 'border-border'}"
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
                class="bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:opacity-90"
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
        <div class="border rounded-lg overflow-hidden bg-card">
          <div class="grid grid-cols-1 lg:grid-cols-[1.2fr,1fr]">
            <!-- Left: Image Preview -->
            <div class="bg-black flex items-center justify-center h-[500px]">
              <div class="w-full h-full flex items-center justify-center p-6">
                {#if aspectRatio === 'original'}
                  <img
                    src={previewUrl}
                    alt="Preview"
                    class="max-w-full max-h-[450px] w-auto h-auto object-contain"
                    style="filter: {getFilterStyle(filterActive)}"
                  />
                {:else}
                  <div class="relative max-w-[450px] w-full" style="padding-bottom: {getAspectRatioStyle(aspectRatio).paddingBottom}">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      class="absolute inset-0 w-full h-full object-cover"
                      style="filter: {getFilterStyle(filterActive)}"
                    />
                  </div>
                {/if}
              </div>
            </div>

            <!-- Right: Controls -->
            <div class="flex flex-col">
              <!-- Caption -->
              <div class="p-4 border-b">
                <textarea
                  bind:value={caption}
                  placeholder="Write a caption..."
                  class="w-full bg-background border-none resize-none focus:outline-none text-sm"
                  rows="8"
                  maxlength="2200"
                />
                <div class="text-right text-xs text-muted-foreground mt-1">
                  {caption.length}/2,200
                </div>
              </div>

              <!-- Filters -->
              <div class="p-4 border-b">
                <p class="text-sm font-medium mb-3">Filters</p>
                <div class="relative -mx-4 px-4">
                  <div 
                    bind:this={filterScrollContainer}
                    class="flex gap-2 overflow-x-scroll pb-2"
                    style="scroll-behavior: smooth; -webkit-overflow-scrolling: touch; cursor: grab;"
                    on:mousedown={(e) => {
                      const slider = e.currentTarget;
                      slider.style.cursor = 'grabbing';
                      let isDown = true;
                      let startX = e.pageX - slider.offsetLeft;
                      let scrollLeft = slider.scrollLeft;
                      
                      const handleMouseMove = (e) => {
                        if (!isDown) return;
                        e.preventDefault();
                        const x = e.pageX - slider.offsetLeft;
                        const walk = (x - startX) * 2;
                        slider.scrollLeft = scrollLeft - walk;
                      };
                      
                      const handleMouseUp = () => {
                        isDown = false;
                        slider.style.cursor = 'grab';
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                      };
                      
                      document.addEventListener('mousemove', handleMouseMove);
                      document.addEventListener('mouseup', handleMouseUp);
                    }}
                  >
                    {#each filters as filter}
                      <button
                        class="flex-shrink-0 flex flex-col items-center gap-1.5"
                        on:click={() => (filterActive = filter.name)}
                      >
                        <div
                          class="w-16 h-16 rounded-md overflow-hidden border-2 transition-all {filterActive === filter.name
                            ? 'border-primary ring-2 ring-primary/20'
                            : 'border-border'}"
                        >
                          <img
                            src={previewUrl}
                            alt={filter.label}
                            class="w-full h-full object-cover pointer-events-none select-none"
                            style="filter: {getFilterStyle(filter.name)}"
                            draggable="false"
                          />
                        </div>
                        <span class="text-[10px] whitespace-nowrap {filterActive === filter.name ? 'font-medium' : 'text-muted-foreground'}">
                          {filter.label}
                        </span>
                      </button>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- Aspect Ratio -->
              <div class="p-4 border-b">
                <p class="text-sm font-medium mb-3">Aspect Ratio</p>
                <div class="grid grid-cols-4 gap-2">
                  <button
                    class="py-2 px-3 rounded-lg border text-xs {aspectRatio === 'original'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted'}"
                    on:click={() => (aspectRatio = 'original')}
                  >
                    Original
                  </button>
                  <button
                    class="py-2 px-3 rounded-lg border text-xs {aspectRatio === 'square'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted'}"
                    on:click={() => (aspectRatio = 'square')}
                  >
                    1:1
                  </button>
                  <button
                    class="py-2 px-3 rounded-lg border text-xs {aspectRatio === 'portrait'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted'}"
                    on:click={() => (aspectRatio = 'portrait')}
                  >
                    4:5
                  </button>
                  <button
                    class="py-2 px-3 rounded-lg border text-xs {aspectRatio === 'landscape'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted'}"
                    on:click={() => (aspectRatio = 'landscape')}
                  >
                    16:9
                  </button>
                </div>
              </div>

              <!-- Actions -->
              <div class="p-4 mt-auto space-y-2">
                <button
                  class="w-full bg-primary text-primary-foreground py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                  on:click={handlePost}
                  disabled={uploading}
                >
                  {uploading ? 'Posting...' : 'Share'}
                </button>

                <button
                  class="w-full border border-border py-2.5 rounded-lg hover:bg-muted text-sm"
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
  img {
    transition: filter 0.2s ease;
  }

  /* Custom scrollbar for filters - visible but styled */
  .overflow-x-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgba(155, 155, 155, 0.3) transparent;
  }

  .overflow-x-scroll::-webkit-scrollbar {
    height: 6px;
  }

  .overflow-x-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .overflow-x-scroll::-webkit-scrollbar-thumb {
    background-color: rgba(155, 155, 155, 0.3);
    border-radius: 3px;
  }

  .overflow-x-scroll::-webkit-scrollbar-thumb:hover {
    background-color: rgba(155, 155, 155, 0.5);
  }
</style>