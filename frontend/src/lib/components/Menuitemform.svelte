<script>
  import pb from '$lib/pocketbase';
  import { XIcon, PencilSimpleIcon, TrashIcon, PlusIcon } from 'phosphor-svelte';
  import { ToggleLeft, ToggleRight } from 'lucide-svelte';

  // ── Props ─────────────────────────────────────────────────────────────────────
  export let editingItem = null;   // null = create mode, object = edit mode
  export let userId;               // seller's user id
  export let onSave;               // async (savedItem) => void
  export let onClose;              // () => void

  // ── Constants ─────────────────────────────────────────────────────────────────
  const MENU_CATS = ['Momo', 'Thali', 'Chowmein', 'Snacks', 'Drinks', 'Desserts', 'Rice', 'Other'];

  // ── Form state ────────────────────────────────────────────────────────────────
  let form = initForm();
  let imageFile = null;
  let imagePreview = null;
  let saving = false;
  let error = '';

  // ── Modifier builder state ────────────────────────────────────────────────────
  let editingModifierIdx = null;   // null | 'new' | number
  let draftModifier = emptyModifier();
  let draftOption   = emptyOption();

  // ── Init ──────────────────────────────────────────────────────────────────────
  function initForm() {
    if (!editingItem) {
      return {
        name: '', description: '', price: '',
        category: MENU_CATS[0], preparationTime: '15',
        isAvailable: true, modifiers: [],
      };
    }
    let mods = [];
    if (editingItem.modifiers) {
      try {
        mods = typeof editingItem.modifiers === 'string'
          ? JSON.parse(editingItem.modifiers)
          : editingItem.modifiers;
      } catch (_) {}
    }
    imagePreview = editingItem.image ? pb.files.getUrl(editingItem, editingItem.image) : null;
    return {
      name:            editingItem.name,
      description:     editingItem.description || '',
      price:           editingItem.price,
      category:        editingItem.category || MENU_CATS[0],
      preparationTime: String(editingItem.preparationTime || 15),
      isAvailable:     editingItem.isAvailable,
      modifiers:       mods,
    };
  }

  function emptyModifier() {
    return { id: `mod_${Date.now()}`, label: '', type: 'radio', required: false, options: [] };
  }

  function emptyOption() {
    return { id: '', name: '', price: '' };
  }

  // ── Image handling ────────────────────────────────────────────────────────────
  function handleImage(e) {
    imageFile = e.target.files[0];
    if (imageFile) {
      const r = new FileReader();
      r.onload = ev => imagePreview = ev.target.result;
      r.readAsDataURL(imageFile);
    }
  }

  function clearImage() {
    imageFile = null;
    imagePreview = null;
  }

  // ── Modifier builder ──────────────────────────────────────────────────────────
  function startNewModifier() {
    draftModifier = emptyModifier();
    draftOption   = emptyOption();
    editingModifierIdx = 'new';
  }

  function startEditModifier(idx) {
    draftModifier = JSON.parse(JSON.stringify(form.modifiers[idx]));
    draftOption   = emptyOption();
    editingModifierIdx = idx;
  }

  function cancelModifier() {
    editingModifierIdx = null;
  }

  function addDraftOption() {
    const name = draftOption.name.trim();
    if (!name) return;
    const opt = { id: `opt_${Date.now()}`, name, price: parseFloat(draftOption.price) || 0 };
    draftModifier = { ...draftModifier, options: [...draftModifier.options, opt] };
    draftOption = emptyOption();
  }

  function removeDraftOption(optId) {
    draftModifier = { ...draftModifier, options: draftModifier.options.filter(o => o.id !== optId) };
  }

  function saveDraftModifier() {
    error = '';
    if (!draftModifier.label.trim()) { error = 'Group label required'; return; }
    if (draftModifier.options.length === 0) { error = 'Add at least one option'; return; }

    if (editingModifierIdx === 'new') {
      form = { ...form, modifiers: [...form.modifiers, { ...draftModifier }] };
    } else {
      const mods = [...form.modifiers];
      mods[editingModifierIdx] = { ...draftModifier };
      form = { ...form, modifiers: mods };
    }
    editingModifierIdx = null;
  }

  function removeModifier(idx) {
    form = { ...form, modifiers: form.modifiers.filter((_, i) => i !== idx) };
    if (editingModifierIdx === idx) editingModifierIdx = null;
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function save() {
    error = '';
    if (!form.name.trim() || !form.price) {
      error = 'Name and price are required';
      return;
    }

    saving = true;
    try {
      const fd = new FormData();
      fd.append('name',            form.name.trim());
      fd.append('description',     form.description);
      fd.append('price',           parseFloat(form.price));
      fd.append('category',        form.category);
      fd.append('preparationTime', parseInt(form.preparationTime) || 15);
      fd.append('isAvailable',     form.isAvailable ? 'true' : 'false');
      fd.append('seller',          userId);
      fd.append('modifiers',       JSON.stringify(form.modifiers));
      if (imageFile) fd.append('image', imageFile);

      let saved;
      if (editingItem) {
        saved = await pb.collection('menuItems').update(editingItem.id, fd);
      } else {
        saved = await pb.collection('menuItems').create(fd);
      }

      await onSave(saved);
    } catch (err) {
      error = err.message || 'Failed to save';
    } finally {
      saving = false;
    }
  }
</script>

<!-- ════════ MODAL BACKDROP ════════════════════════════════════════════════════ -->
<!--
  z-[60]  → sits above the sticky Header (z-50)
  pt-16   → top padding equal to header height so the modal is never hidden behind it
  items-start on mobile becomes items-center on sm+ so it centres nicely on larger screens
-->
<div
  class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 pt-20 sm:pt-4 overflow-y-auto"
  on:click|self={onClose}
>
  <div
    class="bg-background border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden my-auto"
    style="max-height: calc(100vh - 80px);"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
      <h2 class="font-bold text-base">{editingItem ? 'Edit item' : 'Add menu item'}</h2>
      <button class="p-1.5 hover:bg-muted rounded-lg" on:click={onClose}>
        <XIcon size={18} />
      </button>
    </div>

    <!-- Scrollable body -->
    <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">

      {#if error}
        <p class="text-sm text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-xl">{error}</p>
      {/if}

      <!-- Name -->
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-1">
          Name <span class="text-red-500">*</span>
        </label>
        <input
          class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm"
          bind:value={form.name}
          placeholder="e.g. Chicken Momo"
        />
      </div>

      <!-- Description -->
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-1">Description</label>
        <textarea
          rows="2"
          class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm resize-none"
          bind:value={form.description}
          placeholder="What's special about this dish?"
        />
      </div>

      <!-- Price + Prep time -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-1">
            Base price (Rs.) <span class="text-red-500">*</span>
          </label>
          <input
            type="number"
            class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm"
            bind:value={form.price}
            placeholder="0"
            min="0"
          />
        </div>
        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-1">Prep time (min)</label>
          <input
            type="number"
            class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm"
            bind:value={form.preparationTime}
            placeholder="15"
            min="1"
          />
        </div>
      </div>

      <!-- Category -->
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-1">Category</label>
        <select
          class="w-full border border-border rounded-xl px-3 py-2 bg-background text-foreground text-sm"
          bind:value={form.category}
        >
          {#each MENU_CATS as cat}<option value={cat}>{cat}</option>{/each}
        </select>
      </div>

      <!-- Photo -->
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-2">Photo</label>
        {#if imagePreview}
          <div class="relative w-20 h-20 mb-2">
            <img src={imagePreview} alt="" class="w-full h-full rounded-xl object-cover" />
            <button
              class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"
              on:click={clearImage}
            >
              <XIcon size={10} />
            </button>
          </div>
        {/if}
        <label class="cursor-pointer inline-flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-muted transition-colors">
          Choose photo
          <input type="file" accept="image/*" class="hidden" on:change={handleImage} />
        </label>
      </div>

      <!-- Availability toggle -->
      <div class="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-xl">
        <span class="text-sm font-medium">Available to order</span>
        <button on:click={() => form.isAvailable = !form.isAvailable}>
          {#if form.isAvailable}
            <ToggleRight class="w-7 h-7" style="color:#FF6B35;" />
          {:else}
            <ToggleLeft class="w-7 h-7 text-muted-foreground" />
          {/if}
        </button>
      </div>

      <!-- ── MODIFIERS / ADD-ONS SECTION ───────────────────────────────────── -->
      <div class="border-t border-border pt-4">
        <div class="flex items-center justify-between mb-3">
          <div>
            <p class="text-sm font-semibold">Add-ons & options</p>
            <p class="text-xs text-muted-foreground">Let customers customise their order</p>
          </div>
          {#if editingModifierIdx === null}
            <button
              class="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white hover:opacity-90"
              style="background-color:#FF6B35;"
              on:click={startNewModifier}
            >
              <PlusIcon size={12} /> Add group
            </button>
          {/if}
        </div>

        <!-- Existing modifier groups list -->
        {#if form.modifiers.length > 0 && editingModifierIdx === null}
          <div class="space-y-2 mb-3">
            {#each form.modifiers as mod, idx}
              <div class="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-card">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{mod.label}</p>
                  <p class="text-xs text-muted-foreground">
                    {mod.type === 'radio' ? 'Pick one' : 'Pick any'} ·
                    {mod.options.length} option{mod.options.length !== 1 ? 's' : ''}
                    {mod.required ? ' · Required' : ''}
                  </p>
                </div>
                <button
                  class="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"
                  on:click={() => startEditModifier(idx)}
                >
                  <PencilSimpleIcon size={14} />
                </button>
                <button
                  class="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg text-red-500"
                  on:click={() => removeModifier(idx)}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Modifier group editor (inline) -->
        {#if editingModifierIdx !== null}
          <div class="border border-[#FF6B35]/30 bg-[#FF6B3504] rounded-xl p-3 space-y-3">

            <!-- Group label + type -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Group label <span class="text-red-500">*</span>
                </label>
                <input
                  class="w-full border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground text-sm"
                  bind:value={draftModifier.label}
                  placeholder="e.g. Choose filling"
                />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-muted-foreground mb-1">Selection type</label>
                <select
                  class="w-full border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground text-sm"
                  bind:value={draftModifier.type}
                >
                  <option value="radio">Pick one only</option>
                  <option value="multi">Pick any (multi)</option>
                </select>
              </div>
            </div>

            <!-- Required checkbox -->
            <div class="flex items-center gap-2">
              <input type="checkbox" id="modRequired" bind:checked={draftModifier.required} class="rounded" />
              <label for="modRequired" class="text-sm font-medium cursor-pointer">
                Required (customer must choose)
              </label>
            </div>

            <!-- Current options -->
            {#if draftModifier.options.length > 0}
              <div class="space-y-1">
                {#each draftModifier.options as opt}
                  <div class="flex items-center gap-2 text-sm px-2 py-1.5 bg-background rounded-lg border border-border">
                    <span class="flex-1 truncate">{opt.name}</span>
                    {#if opt.price !== 0}
                      <span class="text-xs text-muted-foreground">
                        {opt.price > 0 ? '+' : ''}Rs. {opt.price}
                      </span>
                    {/if}
                    <button class="text-red-500 p-0.5 rounded" on:click={() => removeDraftOption(opt.id)}>
                      <XIcon size={13} />
                    </button>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Add option row -->
            <div class="flex gap-2">
              <input
                class="flex-1 border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground text-sm"
                bind:value={draftOption.name}
                placeholder="Option name"
                on:keydown={e => e.key === 'Enter' && addDraftOption()}
              />
              <div class="relative">
                <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rs.</span>
                <input
                  type="number"
                  class="w-24 border border-border rounded-lg pl-8 pr-2 py-1.5 bg-background text-foreground text-sm"
                  bind:value={draftOption.price}
                  placeholder="0"
                />
              </div>
              <button
                class="px-2.5 py-1.5 rounded-lg text-white text-xs font-semibold hover:opacity-90"
                style="background-color:#FF6B35;"
                on:click={addDraftOption}
              >
                Add
              </button>
            </div>

            <p class="text-[11px] text-muted-foreground">
              Use negative price (e.g. −20) for cheaper variants.
            </p>

            <!-- Modifier save / cancel -->
            <div class="flex gap-2 pt-1">
              <button
                class="flex-1 border border-border py-1.5 rounded-lg text-sm font-medium hover:bg-muted"
                on:click={cancelModifier}
              >
                Cancel
              </button>
              <button
                class="flex-1 py-1.5 rounded-lg text-white text-sm font-semibold hover:opacity-90"
                style="background-color:#FF6B35;"
                on:click={saveDraftModifier}
              >
                Save group
              </button>
            </div>
          </div>
        {/if}
      </div>
      <!-- end modifiers -->

    </div><!-- end scrollable body -->

    <!-- Footer actions -->
    <div class="px-5 py-4 border-t border-border flex gap-2 flex-shrink-0">
      <button
        class="flex-1 border border-border py-2 rounded-xl text-sm font-medium hover:bg-muted"
        on:click={onClose}
        disabled={saving}
      >
        Cancel
      </button>
      <button
        class="flex-1 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        style="background-color:#FF6B35;"
        disabled={saving}
        on:click={save}
      >
        {saving ? 'Saving…' : editingItem ? 'Save changes' : 'Add item'}
      </button>
    </div>
  </div>
</div>