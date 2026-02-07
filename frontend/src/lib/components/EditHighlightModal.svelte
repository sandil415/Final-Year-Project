<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { X, Upload, Trash2, Image as ImageIcon } from 'lucide-svelte';

  export let highlight;
  export let onClose;

  let title = highlight.title;
  let coverImage = null;
  let coverImagePreview = null;
  let existingItems = [];
  let newMediaFiles = [];
  let newMediaPreview = [];
  let uploading = false;
  let loading = true;

  onMount(async () => {
    await loadItems();
    
    // Set cover image preview if exists
    if (highlight.cover_image) {
      coverImagePreview = pb.files.getUrl(highlight, highlight.cover_image);
    }
  });

  async function loadItems() {
    try {
      loading = true;
      const result = await pb.collection('highlight_items').getFullList({
        filter: `highlight = "${highlight.id}"`,
        sort: 'order'
      });

      existingItems = result.map((item, index) => ({
        ...item,
        order: index,
        isExisting: true
      }));
      
      console.log('Loaded existing items:', existingItems);
    } catch (err) {
      console.error('Failed to load items:', err);
    } finally {
      loading = false;
    }
  }

  function handleCoverImageChange(e) {
    const file = e.target.files[0];
    if (file) {
      coverImage = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        coverImagePreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  function handleNewMediaChange(e) {
    const files = Array.from(e.target.files);
    newMediaFiles = [...newMediaFiles, ...files];

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newMediaPreview = [...newMediaPreview, {
          url: e.target.result,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          file: file
        }];
      };
      reader.readAsDataURL(file);
    });
  }

  function removeNewMedia(index) {
    newMediaFiles = newMediaFiles.filter((_, i) => i !== index);
    newMediaPreview = newMediaPreview.filter((_, i) => i !== index);
  }

  async function removeExistingItem(item) {
    if (!confirm('Remove this item from highlight?')) {
      return;
    }

    try {
      await pb.collection('highlight_items').delete(item.id);
      existingItems = existingItems.filter(i => i.id !== item.id);
      
      // Update order
      existingItems = existingItems.map((item, index) => ({
        ...item,
        order: index
      }));
    } catch (err) {
      console.error('Failed to delete item:', err);
      alert('Failed to remove item');
    }
  }

  function getMediaUrl(item) {
    return pb.files.getUrl(item, item.media);
  }

  function isVideo(media) {
    if (typeof media === 'string') {
      return media.endsWith('.mp4') || media.endsWith('.mov') || media.endsWith('.webm');
    }
    return false;
  }

  async function handleSubmit() {
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }

    if (existingItems.length === 0 && newMediaFiles.length === 0) {
      alert('Highlight must have at least one item');
      return;
    }

    try {
      uploading = true;

      // Update highlight details
      const formData = new FormData();
      formData.append('title', title);
      
      if (coverImage) {
        formData.append('cover_image', coverImage);
      }

      await pb.collection('highlights').update(highlight.id, formData);

      // Update order of existing items
      for (const item of existingItems) {
        await pb.collection('highlight_items').update(item.id, {
          order: item.order
        });
      }

      // Add new items
      const startOrder = existingItems.length;
      for (let i = 0; i < newMediaFiles.length; i++) {
        const itemFormData = new FormData();
        itemFormData.append('highlight', highlight.id);
        itemFormData.append('user', highlight.user);
        itemFormData.append('media', newMediaFiles[i]);
        itemFormData.append('order', startOrder + i);

        await pb.collection('highlight_items').create(itemFormData);
      }

      onClose();
    } catch (err) {
      console.error('Failed to update highlight:', err);
      alert('Failed to update highlight: ' + err.message);
    } finally {
      uploading = false;
    }
  }
</script>

<div class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" on:click={onClose}>
  <div class="bg-background rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" on:click|stopPropagation>
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background z-10">
      <h2 class="text-lg font-semibold">Edit Highlight</h2>
      <button on:click={onClose} class="p-2 hover:bg-muted rounded-full">
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Content -->
    <div class="p-6 space-y-6">
      <!-- Title -->
      <div>
        <label class="block text-sm font-medium mb-2">
          Highlight Title *
        </label>
        <input
          type="text"
          bind:value={title}
          placeholder="e.g., Travel, Food, Pets"
          class="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          maxlength="50"
        />
        <p class="text-xs text-muted-foreground mt-1">
          {title.length}/50 characters
        </p>
      </div>

      <!-- Cover Image -->
      <div>
        <label class="block text-sm font-medium mb-2">
          Cover Image
        </label>

        {#if coverImagePreview}
          <div class="relative w-32 h-32 mx-auto">
            <img
              src={coverImagePreview}
              alt="Cover preview"
              class="w-full h-full object-cover rounded-full"
            />
            <button
              on:click={() => {
                coverImage = null;
                coverImagePreview = null;
              }}
              class="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        {:else}
          <label class="flex flex-col items-center justify-center w-32 h-32 mx-auto border-2 border-dashed border-border rounded-full cursor-pointer hover:bg-muted">
            <ImageIcon class="w-8 h-8 text-muted-foreground mb-2" />
            <span class="text-xs text-muted-foreground">Upload</span>
            <input
              type="file"
              accept="image/*"
              on:change={handleCoverImageChange}
              class="hidden"
            />
          </label>
        {/if}
      </div>

      <!-- Existing Items -->
      {#if loading}
        <div class="text-center py-4">
          <p class="text-sm text-muted-foreground">Loading items...</p>
        </div>
      {:else if existingItems.length > 0}
        <div>
          <label class="block text-sm font-medium mb-3">
            Current Items ({existingItems.length})
          </label>
          <div class="grid grid-cols-3 gap-2">
            {#each existingItems as item, index}
              <div class="relative aspect-square bg-muted rounded-lg overflow-hidden group">
                {#if isVideo(item.media)}
                  <video
                    src={getMediaUrl(item)}
                    class="w-full h-full object-cover"
                    muted
                  />
                {:else}
                  <img
                    src={getMediaUrl(item)}
                    alt="Item {index + 1}"
                    class="w-full h-full object-cover"
                  />
                {/if}
                <button
                  on:click={() => removeExistingItem(item)}
                  class="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
                <div class="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
                  {index + 1}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Add New Items -->
      <div>
        <label class="block text-sm font-medium mb-2">
          Add New Items
        </label>

        <label class="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted mb-4">
          <Upload class="w-5 h-5 text-muted-foreground" />
          <span class="text-sm">Choose files</span>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            on:change={handleNewMediaChange}
            class="hidden"
          />
        </label>

        {#if newMediaPreview.length > 0}
          <div class="grid grid-cols-3 gap-2">
            {#each newMediaPreview as media, index}
              <div class="relative aspect-square bg-muted rounded-lg overflow-hidden group">
                {#if media.type === 'video'}
                  <video
                    src={media.url}
                    class="w-full h-full object-cover"
                    muted
                  />
                {:else}
                  <img
                    src={media.url}
                    alt="New item {index + 1}"
                    class="w-full h-full object-cover"
                  />
                {/if}
                <button
                  on:click={() => removeNewMedia(index)}
                  class="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X class="w-4 h-4" />
                </button>
                <div class="absolute bottom-2 left-2 px-2 py-1 bg-primary text-primary-foreground text-xs rounded">
                  New
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- Footer -->
    <div class="p-4 border-t border-border sticky bottom-0 bg-background">
      <div class="flex gap-3 justify-end">
        <button
          on:click={onClose}
          class="px-4 py-2 border border-border rounded-lg hover:bg-muted"
          disabled={uploading}
        >
          Cancel
        </button>
        <button
          on:click={handleSubmit}
          disabled={uploading || !title.trim() || (existingItems.length === 0 && newMediaFiles.length === 0)}
          class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  </div>
</div>