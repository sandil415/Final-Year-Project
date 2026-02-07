<script>
  import pb from '$lib/pocketbase';
  import { X, Upload, Image as ImageIcon } from 'lucide-svelte';

  export let userId;
  export let onClose;

  let title = '';
  let coverImage = null;
  let coverImagePreview = null;
  let mediaFiles = [];
  let mediaPreview = [];
  let uploading = false;

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

  function handleMediaFilesChange(e) {
    const files = Array.from(e.target.files);
    mediaFiles = [...mediaFiles, ...files];

    // Create previews
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        mediaPreview = [...mediaPreview, {
          url: e.target.result,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          file: file
        }];
      };
      reader.readAsDataURL(file);
    });
  }

  function removeMedia(index) {
    mediaFiles = mediaFiles.filter((_, i) => i !== index);
    mediaPreview = mediaPreview.filter((_, i) => i !== index);
  }

  async function handleSubmit() {
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }

    if (mediaFiles.length === 0) {
      alert('Please add at least one photo or video');
      return;
    }

    try {
      uploading = true;

      // Create the highlight
      const formData = new FormData();
      formData.append('title', title);
      formData.append('user', userId);
      
      if (coverImage) {
        formData.append('cover_image', coverImage);
      }

      const highlight = await pb.collection('highlights').create(formData);

      // Upload each media item
      for (let i = 0; i < mediaFiles.length; i++) {
        const itemFormData = new FormData();
        itemFormData.append('highlight', highlight.id);
        itemFormData.append('user', userId);
        itemFormData.append('media', mediaFiles[i]);
        itemFormData.append('order', i);

        await pb.collection('highlight_items').create(itemFormData);
      }

      onClose();
    } catch (err) {
      console.error('Failed to create highlight:', err);
      alert('Failed to create highlight: ' + err.message);
    } finally {
      uploading = false;
    }
  }
</script>

<div class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" on:click={onClose}>
  <div class="bg-background rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" on:click|stopPropagation>
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background z-10">
      <h2 class="text-lg font-semibold">Create Highlight</h2>
      <button on:click={onClose} class="p-2 hover:bg-muted rounded-full">
        <X class="w-5 h-5" />
      </button>
    </div>

    <!-- Content -->
    <div class="p-6 space-y-6">
      <!-- Title -->
      <div>
        <label class="block text-sm font-medium mb-2">
          Highlight Title 
        </label>
        <input
          type="text"
          bind:value={title}
          placeholder="e.g., Travel, Food, Pets"
          class="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          maxlength="50"
        />
        <!-- <p class="text-xs text-muted-foreground mt-1">
          {title.length}/50 characters
        </p> -->
      </div>

      <!-- Cover Image -->
      <div>
        <label class="block text-sm font-medium mb-2">
          Cover Image (Optional)
        </label>
        <p class="text-xs text-muted-foreground mb-3">
          This will be shown as the highlight thumbnail
        </p>

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

      <!-- Media Files -->
      <div>
        <label class="block text-sm font-medium mb-2">
          Photos & Videos *
        </label>
        <p class="text-xs text-muted-foreground mb-3">
          Add the content for this highlight
        </p>

        <!-- Upload Button -->
        <label class="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted mb-4">
          <Upload class="w-5 h-5 text-muted-foreground" />
          <span class="text-sm">Choose files</span>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            on:change={handleMediaFilesChange}
            class="hidden"
          />
        </label>

        <!-- Preview Grid -->
        {#if mediaPreview.length > 0}
          <div class="grid grid-cols-3 gap-2">
            {#each mediaPreview as media, index}
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
                    alt="Preview {index + 1}"
                    class="w-full h-full object-cover"
                  />
                {/if}
                <button
                  on:click={() => removeMedia(index)}
                  class="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X class="w-4 h-4" />
                </button>
                <div class="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
                  {index + 1}
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
          disabled={uploading || !title.trim() || mediaFiles.length === 0}
          class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Creating...' : 'Create Highlight'}
        </button>
      </div>
    </div>
  </div>
</div>