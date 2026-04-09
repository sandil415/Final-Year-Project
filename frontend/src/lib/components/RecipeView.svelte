<script>
  import pb from '$lib/pocketbase';
  import { XIcon, PencilSimpleIcon, TrashIcon, BookOpenTextIcon, TagIcon, ClockIcon } from 'phosphor-svelte';

  export let recipe;
  export let isOwnProfile = false;
  export let onClose;
  export let onEdit;
  export let onDelete;

  $: tags = (() => {
    const t = recipe.tags;
    if (!t) return [];
    if (Array.isArray(t)) return t;
    try { return JSON.parse(t); } catch { return []; }
  })();

  $: blocks = (() => {
    const b = recipe.blocks;
    if (!b) return [];
    if (Array.isArray(b)) return b;
    try { return JSON.parse(b); } catch { return []; }
  })();

  // Count only content blocks, not images
  $: wordCount = blocks.filter(b => b.type !== 'image').map(b => (b.content||'').split(/\s+/).filter(Boolean).length).reduce((a,b) => a+b, 0);
  $: readTime = Math.max(1, Math.ceil(wordCount / 200));
</script>

<div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" on:click|self={onClose}>
  <div class="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">

    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <BookOpenTextIcon size={16} weight="duotone" style="color:#FF6B35;" />
        <span class="text-sm font-semibold text-muted-foreground truncate">Recipe</span>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        {#if isOwnProfile}
          <button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors" on:click={onEdit}>
            <PencilSimpleIcon size={13} />Edit
          </button>
          <button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors" on:click={onDelete}>
            <TrashIcon size={13} />Delete
          </button>
        {/if}
        <button class="p-1.5 hover:bg-muted rounded-lg text-muted-foreground ml-1" on:click={onClose}>
          <XIcon size={18} />
        </button>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto">

      <!-- Cover -->
      {#if recipe.cover_image}
        <div class="relative h-56 overflow-hidden">
          <img src={pb.files.getUrl(recipe, recipe.cover_image)} alt="Cover" class="w-full h-full object-cover" />
          <div class="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent"></div>
        </div>
      {/if}

      <div class="px-7 {recipe.cover_image ? 'pt-4' : 'pt-6'} pb-8">

        <!-- Title -->
        <h1 class="text-2xl font-bold leading-tight mb-3">{recipe.title}</h1>

        <!-- Meta row -->
        <div class="flex flex-wrap items-center gap-3 mb-4">
          {#if readTime}
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              <ClockIcon size={12} />{readTime} min read
            </span>
          {/if}
          {#if tags.length}
            <div class="flex flex-wrap gap-1.5">
              {#each tags as tag}
                <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400">{tag}</span>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Divider -->
        <div class="border-t border-border mb-5"></div>

        <!-- Blocks -->
        <div class="space-y-2.5 text-sm">
          {#each blocks as block, i}
            {#if block.type === 'heading'}
              <h2 class="text-lg font-bold mt-6 first:mt-0 leading-snug">{block.content}</h2>

            {:else if block.type === 'bullet'}
              <div class="flex items-start gap-3">
                <span class="mt-[0.45rem] w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:#FF6B35;"></span>
                <p class="leading-relaxed text-foreground/90">{block.content}</p>
              </div>

            {:else if block.type === 'numbered'}
              <div class="flex items-start gap-3">
                <span class="min-w-[1.6rem] font-bold text-sm flex-shrink-0" style="color:#FF6B35;">{i + 1}.</span>
                <p class="leading-relaxed text-foreground/90">{block.content}</p>
              </div>

            {:else if block.type === 'image' && block.content && block.content !== '__PENDING__'}
              <div class="my-3 rounded-xl overflow-hidden">
                <img src={block.content} alt="Step" class="w-full object-cover max-h-64" />
              </div>

            {:else if block.type !== 'image' && block.content}
              <p class="leading-relaxed whitespace-pre-line text-foreground/90">{block.content}</p>
            {/if}
          {/each}
        </div>

      </div>
    </div>
  </div>
</div>