<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { Plus, Pencil, Trash2 } from 'lucide-svelte';
  import CreateHighlightModal from './CreateHighlightModal.svelte';
  import ViewHighlightModal from './ViewHighlightModal.svelte';
  import EditHighlightModal from './EditHighlightModal.svelte';

  export let userId;
  export let isOwnProfile = false;

  let highlights = [];
  let loading = false;
  let showCreateModal = false;
  let selectedHighlight = null;
  let showViewModal = false;
  let showEditModal = false;
  let mounted = false;
  let currentUserId = null;

  onMount(() => {
    mounted = true;
    if (userId) {
      currentUserId = userId;
      loadHighlights();
    }
  });

  async function loadHighlights() {
    try {
      loading = true;
      const result = await pb.collection('highlights').getList(1, 50, {
        filter: `user = "${userId}"`,
        sort: 'created',
        expand: 'highlight_items(highlight)'
      });

      highlights = result.items.map(h => ({
        ...h,
        itemCount: h.expand?.['highlight_items(highlight)']?.length || 0
      }));

      console.log('Loaded highlights:', highlights);
    } catch (err) {
      console.error('Failed to load highlights:', err);
      highlights = [];
    } finally {
      loading = false;
    }
  }

  function handleCreateClick() {
    showCreateModal = true;
  }

  function handleHighlightClick(highlight) {
    selectedHighlight = highlight;
    showViewModal = true;
  }

  function handleEditClick(e, highlight) {
    e.stopPropagation();
    selectedHighlight = highlight;
    showEditModal = true;
  }

  async function handleDeleteClick(e, highlight) {
    e.stopPropagation();
    
    if (!confirm(`Delete highlight "${highlight.title}"?`)) {
      return;
    }

    try {
      const items = await pb.collection('highlight_items').getFullList({
        filter: `highlight = "${highlight.id}"`
      });

      for (const item of items) {
        await pb.collection('highlight_items').delete(item.id);
      }

      await pb.collection('highlights').delete(highlight.id);
      
      // Update local state immediately without reload
      highlights = highlights.filter(h => h.id !== highlight.id);
      
    } catch (err) {
      console.error('Failed to delete highlight:', err);
      alert('Failed to delete highlight');
    }
  }

  function handleModalClose() {
    const wasCreateModal = showCreateModal;
    const wasEditModal = showEditModal;
    
    showCreateModal = false;
    showViewModal = false;
    showEditModal = false;
    selectedHighlight = null;
    
    // Only reload if user created or edited (not just viewed)
    if (wasCreateModal || wasEditModal) {
      loadHighlights();
    }
  }
</script>

<!-- Fixed container with consistent height -->
<div class="py-4 min-h-[120px]">
  {#if loading}
    <div class="flex items-center justify-center h-24">
      <p class="text-sm text-muted-foreground">Loading highlights...</p>
    </div>
  {:else}
    <div class="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
      <!-- Create New Highlight Button -->
      {#if isOwnProfile}
        <button
          on:click={handleCreateClick}
          class="flex flex-col items-center gap-2 flex-shrink-0 group"
        >
          <div class="w-20 h-20 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center group-hover:border-foreground transition-colors">
            <Plus class="w-8 h-8 text-muted-foreground group-hover:text-foreground" />
          </div>
          <span class="text-xs text-muted-foreground group-hover:text-foreground max-w-[80px] truncate">
            New
          </span>
        </button>
      {/if}

      <!-- Existing Highlights with keyed each block -->
      {#each highlights as highlight (highlight.id)}
        <div class="relative flex-shrink-0 group">
          <button
            on:click={() => handleHighlightClick(highlight)}
            class="flex flex-col items-center gap-2"
          >
            <div class="w-20 h-20 rounded-full border-2 border-border overflow-hidden bg-muted">
              {#if highlight.cover_image}
                <img
                  src={pb.files.getURL(highlight, highlight.cover_image)}
                  alt={highlight.title}
                  class="w-full h-full object-cover"
                />
              {:else}
                <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                  <span class="text-2xl font-bold text-primary">
                    {highlight.title.charAt(0).toUpperCase()}
                  </span>
                </div>
              {/if}
            </div>
            <span class="text-xs text-foreground max-w-[80px] truncate">
              {highlight.title}
            </span>
          </button>

          <!-- Edit/Delete buttons -->
          {#if isOwnProfile}
            <div class="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                on:click={(e) => handleEditClick(e, highlight)}
                class="p-1 bg-background/80 backdrop-blur-sm rounded-full border border-border hover:bg-muted"
                title="Edit highlight"
              >
                <Pencil class="w-3 h-3" />
              </button>
              <button
                on:click={(e) => handleDeleteClick(e, highlight)}
                class="p-1 bg-background/80 backdrop-blur-sm rounded-full border border-border hover:bg-destructive hover:text-destructive-foreground"
                title="Delete highlight"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Modals -->
{#if showCreateModal}
  <CreateHighlightModal {userId} onClose={handleModalClose} />
{/if}

{#if showViewModal && selectedHighlight}
  <ViewHighlightModal highlight={selectedHighlight} onClose={handleModalClose} />
{/if}

{#if showEditModal && selectedHighlight}
  <EditHighlightModal highlight={selectedHighlight} onClose={handleModalClose} />
{/if}

<style>
  /* Hide scrollbar for cleaner look */
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>