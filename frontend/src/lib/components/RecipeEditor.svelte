<script>
  import { tick } from 'svelte';
  import {
    XIcon, ImageIcon, TextHIcon, TextTIcon, ListBulletsIcon,
    ListNumbersIcon, DotsThreeVerticalIcon, TrashIcon,
    ArrowUpIcon, ArrowDownIcon, BookOpenTextIcon
  } from 'phosphor-svelte';

  export let editingRecipe = null;
  export let onSave;
  export let onClose;
  export let recipeTitle = '';
  export let recipeTags  = '';
  export let recipeCoverPreview = null;
  export let recipeBlocks = [];

  let recipeCoverFile = null;
  let savingRecipe = false;
  let activeBlockMenu = null;

  const BLOCK_TYPES = [
    { type: 'heading',   label: 'Heading',  Icon: TextHIcon       },
    { type: 'paragraph', label: 'Text',      Icon: TextTIcon       },
    { type: 'bullet',    label: 'Bullet',    Icon: ListBulletsIcon },
    { type: 'numbered',  label: 'Numbered',  Icon: ListNumbersIcon },
    { type: 'image',     label: 'Image',     Icon: ImageIcon       },
  ];

  function mkBlock(type = 'paragraph') {
    return { id: `b${Date.now()}${Math.random().toString(36).slice(2,6)}`, type, content: '', file: null, preview: null };
  }

  function addBlockAfter(idx, type = 'paragraph') {
    const b = mkBlock(type);
    recipeBlocks = [...recipeBlocks.slice(0, idx+1), b, ...recipeBlocks.slice(idx+1)];
    tick().then(() => {
      const all = document.querySelectorAll('.block-input');
      if (all[idx+1]) all[idx+1].focus();
    });
  }

  function removeBlock(id) {
    const idx = recipeBlocks.findIndex(b => b.id === id);
    if (recipeBlocks.length <= 1) return;
    recipeBlocks = recipeBlocks.filter(b => b.id !== id);
    activeBlockMenu = null;
    tick().then(() => {
      const all = document.querySelectorAll('.block-input');
      if (all[Math.max(0, idx-1)]) all[Math.max(0, idx-1)].focus();
    });
  }

  function moveBlock(id, dir) {
    const idx = recipeBlocks.findIndex(b => b.id === id);
    const ni = idx + dir;
    if (ni < 0 || ni >= recipeBlocks.length) return;
    const a = [...recipeBlocks];
    [a[idx], a[ni]] = [a[ni], a[idx]];
    recipeBlocks = a;
    activeBlockMenu = null;
  }

  function changeType(id, type) {
    recipeBlocks = recipeBlocks.map(b => b.id === id ? { ...b, type, file: null, preview: null } : b);
    activeBlockMenu = null;
  }

  function updateContent(id, val) {
    recipeBlocks = recipeBlocks.map(b => b.id === id ? { ...b, content: val } : b);
  }

  function handleBlockImg(id, e) {
    const f = e.target.files[0]; if (!f) return;
    new FileReader().onload = ev => {
      recipeBlocks = recipeBlocks.map(b => b.id === id ? { ...b, preview: ev.target.result, file: f } : b);
    };
    const fr = new FileReader();
    fr.onload = ev => { recipeBlocks = recipeBlocks.map(b => b.id === id ? { ...b, preview: ev.target.result, file: f } : b); };
    fr.readAsDataURL(f);
  }

  function handleCoverFile(e) {
    recipeCoverFile = e.target.files[0];
    if (!recipeCoverFile) return;
    const fr = new FileReader();
    fr.onload = ev => recipeCoverPreview = ev.target.result;
    fr.readAsDataURL(recipeCoverFile);
  }

  function onBlockKey(e, idx, block) {
    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'image') {
      e.preventDefault();
      addBlockAfter(idx, block.type === 'bullet' ? 'bullet' : block.type === 'numbered' ? 'numbered' : 'paragraph');
    }
    if (e.key === 'Backspace' && block.content === '' && recipeBlocks.length > 1) {
      e.preventDefault();
      removeBlock(block.id);
    }
  }

  function grow(e) {
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  }

  async function save() {
    if (!recipeTitle.trim()) { alert('Please add a title'); return; }
    savingRecipe = true;
    try {
      const tags   = recipeTags.split(',').map(t => t.trim()).filter(Boolean);
      const blocks = recipeBlocks.map(b => ({ type: b.type, content: b.content }));
      const fd = new FormData();
      fd.append('title',  recipeTitle.trim());
      fd.append('tags',   JSON.stringify(tags));
      fd.append('blocks', JSON.stringify(blocks));
      if (recipeCoverFile) fd.append('cover_image', recipeCoverFile);
      recipeBlocks.forEach((b, i) => { if (b.file) fd.append(`blockImage_${i}`, b.file); });
      await onSave(fd);
    } finally {
      savingRecipe = false;
    }
  }

  // Close menu when clicking outside
  function onWindowClick(e) {
    if (!e.target.closest('.bm-btn') && !e.target.closest('.bm-popup')) {
      activeBlockMenu = null;
    }
  }
</script>

<svelte:window on:click={onWindowClick} />

<div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
  <div class="bg-background border border-border rounded-2xl w-full max-w-2xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">

    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
      <div class="flex items-center gap-2">
        <BookOpenTextIcon size={18} style="color:#FF6B35;" weight="duotone" />
        <span class="font-bold text-sm">{editingRecipe ? 'Edit Recipe' : 'New Recipe'}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="px-4 py-1.5 rounded-lg text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
          style="background-color:#FF6B35;"
          disabled={savingRecipe}
          on:click={save}
        >
          {savingRecipe ? 'Saving…' : editingRecipe ? 'Update' : 'Publish'}
        </button>
        <button class="p-1.5 hover:bg-muted rounded-lg text-muted-foreground" on:click={onClose}>
          <XIcon size={18} />
        </button>
      </div>
    </div>

    <!-- Editor body -->
    <div class="flex-1 overflow-y-auto">

      <!-- Cover image -->
      <label class="block cursor-pointer">
        {#if recipeCoverPreview}
          <div class="relative w-full h-44 group">
            <img src={recipeCoverPreview} alt="Cover" class="w-full h-full object-cover" />
            <div class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span class="bg-black/50 text-white text-xs font-semibold px-3 py-1.5 rounded-full">Change cover</span>
            </div>
          </div>
        {:else}
          <div class="mx-5 mt-4 h-20 border-2 border-dashed border-border rounded-xl flex items-center justify-center gap-2 text-muted-foreground hover:border-orange-400 hover:text-orange-400 transition-colors">
            <ImageIcon size={18} /><span class="text-sm font-medium">Add cover image</span>
          </div>
        {/if}
        <input type="file" accept="image/*" class="hidden" on:change={handleCoverFile} />
      </label>

      <!-- Title + tags -->
      <div class="px-6 pt-4 pb-2 space-y-1.5">
        <input
          class="w-full text-2xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30"
          placeholder="Recipe title…"
          bind:value={recipeTitle}
        />
        <input
          class="w-full text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground/30 text-muted-foreground"
          placeholder="Tags: momo, nepali, quick  (comma-separated)"
          bind:value={recipeTags}
        />
      </div>

      <div class="mx-5 border-t border-border/50 mb-1"></div>

      <!-- Blocks list -->
      <div class="px-3 pb-4 space-y-0.5">
        {#each recipeBlocks as block, idx (block.id)}
          <!--
            KEY FIX: position:relative on this row + z-index on the popup.
            The popup uses position:absolute relative to THIS div, not the modal.
            overflow:visible ensures the popup is not clipped by the parent.
          -->
          <div class="relative flex items-start gap-1 group/block rounded-lg px-1 py-0.5 hover:bg-muted/20 transition-colors" style="overflow:visible;">

            <!-- ⋮ menu trigger -->
            <div class="relative flex-shrink-0 mt-1.5">
              <button
                class="bm-btn p-1 rounded text-muted-foreground opacity-0 group-hover/block:opacity-100 hover:bg-muted transition-all"
                on:click|stopPropagation={() => activeBlockMenu = activeBlockMenu === block.id ? null : block.id}
              >
                <DotsThreeVerticalIcon size={15} weight="bold" />
              </button>

              {#if activeBlockMenu === block.id}
                <!--
                  z-[9999] — above everything including the modal scroll container.
                  position:absolute, left:0, top:full means anchored to the ⋮ button.
                  stopPropagation prevents window click handler from immediately closing.
                -->
                <div
                  class="bm-popup absolute left-0 top-full mt-1 w-48 bg-background border border-border rounded-xl shadow-2xl py-1 overflow-hidden"
                  style="z-index:9999;"
                  on:click|stopPropagation
                >
                  <p class="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Change type</p>
                  {#each BLOCK_TYPES as bt}
                    <button
                      class="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors {block.type === bt.type ? 'font-semibold' : 'text-foreground'}"
                      style={block.type === bt.type ? 'color:#FF6B35;' : ''}
                      on:click={() => changeType(block.id, bt.type)}
                    >
                      <svelte:component this={bt.Icon} size={13} />{bt.label}
                    </button>
                  {/each}
                  <div class="border-t border-border my-1"></div>
                  <button class="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left hover:bg-muted text-muted-foreground transition-colors disabled:opacity-30"
                    disabled={idx === 0} on:click={() => moveBlock(block.id, -1)}>
                    <ArrowUpIcon size={13} />Move up
                  </button>
                  <button class="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left hover:bg-muted text-muted-foreground transition-colors disabled:opacity-30"
                    disabled={idx === recipeBlocks.length - 1} on:click={() => moveBlock(block.id, 1)}>
                    <ArrowDownIcon size={13} />Move down
                  </button>
                  <div class="border-t border-border my-1"></div>
                  <button class="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 transition-colors"
                    on:click={() => removeBlock(block.id)}>
                    <TrashIcon size={13} />Delete
                  </button>
                </div>
              {/if}
            </div>

            <!-- Content area -->
            <div class="flex-1 min-w-0 py-0.5">

              {#if block.type === 'heading'}
                <input
                  class="block-input w-full text-lg font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30"
                  placeholder="Heading…"
                  value={block.content}
                  on:input={e => updateContent(block.id, e.target.value)}
                  on:keydown={e => onBlockKey(e, idx, block)}
                />

              {:else if block.type === 'bullet'}
                <div class="flex items-start gap-2 pt-0.5">
                  <span class="mt-[0.45rem] w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:#FF6B35;opacity:0.7;"></span>
                  <textarea
                    class="block-input flex-1 bg-transparent border-none outline-none placeholder:text-muted-foreground/30 resize-none text-sm leading-relaxed"
                    style="min-height:1.4rem;overflow:hidden;"
                    placeholder="List item…"
                    value={block.content}
                    rows="1"
                    on:input={e => { updateContent(block.id, e.target.value); grow(e); }}
                    on:keydown={e => onBlockKey(e, idx, block)}
                  />
                </div>

              {:else if block.type === 'numbered'}
                <div class="flex items-start gap-2 pt-0.5">
                  <span class="mt-0.5 min-w-[1.2rem] text-sm font-bold flex-shrink-0" style="color:#FF6B35;">{idx + 1}.</span>
                  <textarea
                    class="block-input flex-1 bg-transparent border-none outline-none placeholder:text-muted-foreground/30 resize-none text-sm leading-relaxed"
                    style="min-height:1.4rem;overflow:hidden;"
                    placeholder="Step…"
                    value={block.content}
                    rows="1"
                    on:input={e => { updateContent(block.id, e.target.value); grow(e); }}
                    on:keydown={e => onBlockKey(e, idx, block)}
                  />
                </div>

              {:else if block.type === 'image'}
                {#if block.preview}
                  <div class="relative rounded-xl overflow-hidden my-1">
                    <img src={block.preview} alt="" class="w-full max-h-48 object-cover rounded-xl" />
                    <button
                      class="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70"
                      on:click|stopPropagation={() => { recipeBlocks = recipeBlocks.map(b => b.id === block.id ? {...b, preview:null, file:null} : b); }}
                    >
                      <XIcon size={13} />
                    </button>
                  </div>
                {:else}
                  <label class="flex items-center gap-2.5 px-3 py-2 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-orange-400 hover:text-orange-400 text-muted-foreground text-sm transition-colors my-1">
                    <ImageIcon size={16} /><span>Upload image</span>
                    <input type="file" accept="image/*" class="hidden" on:change={e => handleBlockImg(block.id, e)} />
                  </label>
                {/if}

              {:else}
                <textarea
                  class="block-input w-full bg-transparent border-none outline-none placeholder:text-muted-foreground/30 resize-none text-sm leading-relaxed"
                  style="min-height:1.4rem;overflow:hidden;"
                  placeholder="Start writing…"
                  value={block.content}
                  rows="1"
                  on:input={e => { updateContent(block.id, e.target.value); grow(e); }}
                  on:keydown={e => onBlockKey(e, idx, block)}
                />
              {/if}
            </div>
          </div>
        {/each}

        <!-- Add block toolbar -->
        <div class="flex flex-wrap items-center gap-1 pt-3 pl-7 border-t border-border/30 mt-2">
          <span class="text-xs text-muted-foreground mr-1">Add:</span>
          {#each BLOCK_TYPES as bt}
            <button
              class="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-transparent hover:border-border"
              on:click={() => addBlockAfter(recipeBlocks.length - 1, bt.type)}
              title={bt.label}
            >
              <svelte:component this={bt.Icon} size={12} />
              <span class="hidden sm:inline">{bt.label}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>