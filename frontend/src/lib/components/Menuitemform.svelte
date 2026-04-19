<script>
  import pb from '$lib/pocketbase';
  import {
    MEAL_TYPES, CUISINE_TYPES, DIET_TYPES,
    PRICE_TIERS, SPICE_LEVELS, HEALTH_TAGS,
    POPULARITY_TAGS, derivePriceTier,
  } from '$lib/menuAttributes';
  import {
    XIcon, UploadIcon, ToggleLeftIcon, ToggleRightIcon,
    PlusIcon, TrashIcon, PencilSimpleIcon, SlidersIcon,
  } from 'phosphor-svelte';
  import { onMount } from 'svelte';

  export let editingItem = null;
  export let userId;
  export let onSave;
  export let onClose;

  const CATEGORIES = ['Momo','Thali','Chowmein','Snacks','Drinks','Desserts','Rice','Other'];

  let name            = '';
  let description     = '';
  let price           = '';
  let preparationTime = '15';
  let isAvailable     = true;
  let category        = CATEGORIES[0];

  let mealType      = [];
  let cuisineType   = '';
  let dietType      = '';
  let priceTier     = '';
  let spiceLevel    = '';
  let healthTag     = 'Regular';
  let popularityTag = '';

  // Meal types where spice level makes no sense
  const NO_SPICE_MEAL_TYPES = new Set(['Drink']);

  // Derived: hide spice level when all selected meal types are in NO_SPICE set
  $: showSpiceLevel = mealType.length === 0
    || !mealType.every(mt => NO_SPICE_MEAL_TYPES.has(mt));

  // When spice becomes irrelevant, clear the value
  $: if (!showSpiceLevel && spiceLevel) spiceLevel = '';

  let imageFile    = null;
  let imagePreview = null;

  let modifiers          = [];
  let editingModifierIdx = null;
  let draftModifier      = { id: '', label: '', type: 'radio', required: false, options: [] };
  let draftOption        = { id: '', name: '', price: '' };

  let saving       = false;
  let toastMsg     = '';
  let toastVisible = false;
  let toastTimer   = null;

  function showToast(msg) {
    toastMsg = msg;
    toastVisible = true;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastVisible = false; }, 3000);
  }

  onMount(() => {
    if (!editingItem) return;

    name            = editingItem.name            ?? '';
    description     = editingItem.description     ?? '';
    price           = editingItem.price           ?? '';
    preparationTime = editingItem.preparationTime ?? '15';
    isAvailable     = editingItem.isAvailable     ?? true;
    category        = editingItem.category        ?? CATEGORIES[0];
    cuisineType     = editingItem.cuisineType     ?? '';
    dietType        = editingItem.dietType        ?? '';
    priceTier       = editingItem.priceTier       ?? '';
    spiceLevel      = editingItem.spiceLevel      ?? '';
    healthTag       = editingItem.healthTag       ?? 'Regular';
    popularityTag   = editingItem.popularityTag   ?? '';

    mealType = (() => {
      const v = editingItem.mealType;
      if (!v) return [];
      if (Array.isArray(v)) return v;
      try { return JSON.parse(v); } catch { return [v]; }
    })();

    imagePreview = editingItem.image
      ? pb.files.getUrl(editingItem, editingItem.image)
      : null;

    try {
      const raw = editingItem.modifiers;
      modifiers = typeof raw === 'string'
        ? JSON.parse(raw || '[]')
        : (raw || []);
    } catch { modifiers = []; }
  });

  function onPriceInput() {
    const numeric = parseFloat(price);
    if (!price || price === "") {
      priceTier = "";
    } else if (!isNaN(numeric)) {
      priceTier = derivePriceTier(numeric);
    }
  }

  function toggleMealType(val) {
    mealType = mealType.includes(val)
      ? mealType.filter(m => m !== val)
      : [...mealType, val];
  }

  function handleImage(e) {
    imageFile = e.target.files[0];
    if (imageFile) {
      const r = new FileReader();
      r.onload = ev => { imagePreview = ev.target.result; };
      r.readAsDataURL(imageFile);
    }
  }

  function startNewModifier() {
    draftModifier      = { id: `mod_${Date.now()}`, label: '', type: 'radio', required: false, options: [] };
    draftOption        = { id: '', name: '', price: '' };
    editingModifierIdx = 'new';
  }

  function startEditModifier(idx) {
    draftModifier      = JSON.parse(JSON.stringify(modifiers[idx]));
    draftOption        = { id: '', name: '', price: '' };
    editingModifierIdx = idx;
  }

  function addDraftOption() {
    const n = draftOption.name.trim();
    if (!n) return;
    draftModifier = {
      ...draftModifier,
      options: [...draftModifier.options, {
        id: `opt_${Date.now()}`, name: n,
        price: parseFloat(draftOption.price) || 0,
      }],
    };
    draftOption = { id: '', name: '', price: '' };
  }

  function removeDraftOption(optId) {
    draftModifier = { ...draftModifier, options: draftModifier.options.filter(o => o.id !== optId) };
  }

  function saveDraftModifier() {
    if (!draftModifier.label.trim())   { showToast('Group label is required'); return; }
    if (!draftModifier.options.length) { showToast('Add at least one option'); return; }
    if (editingModifierIdx === 'new') {
      modifiers = [...modifiers, { ...draftModifier }];
    } else {
      modifiers = modifiers.map((m, i) => i === editingModifierIdx ? { ...draftModifier } : m);
    }
    editingModifierIdx = null;
  }

  function removeModifier(idx) {
    modifiers = modifiers.filter((_, i) => i !== idx);
    if (editingModifierIdx === idx) editingModifierIdx = null;
  }

  async function save() {
    if (!name.trim())     { showToast('Name is required'); return; }
    if (!price)           { showToast('Price is required'); return; }
    if (!cuisineType)     { showToast('Select a cuisine type'); return; }
    if (!dietType)        { showToast('Select diet type'); return; }
    if (!mealType.length) { showToast('Select at least one meal type'); return; }

    saving = true;
    try {
      const fd = new FormData();
      fd.append('name',            name.trim());
      fd.append('description',     description);
      fd.append('price',           String(parseFloat(price)));
      fd.append('preparationTime', String(parseInt(preparationTime) || 15));
      fd.append('isAvailable',     isAvailable ? 'true' : 'false');
      fd.append('seller',          userId);
      fd.append('category',        category);
      fd.append('mealType',        JSON.stringify(mealType));
      fd.append('cuisineType',     cuisineType);
      fd.append('dietType',        dietType);
      fd.append('priceTier',       priceTier || derivePriceTier(parseFloat(price) || 0));
      fd.append('spiceLevel',      spiceLevel);
      fd.append('healthTag',       healthTag);
      fd.append('popularityTag',   popularityTag);
      fd.append('modifiers',       JSON.stringify(modifiers));
      if (imageFile) fd.append('image', imageFile);

      const saved = editingItem
        ? await pb.collection('menuItems').update(editingItem.id, fd)
        : await pb.collection('menuItems').create(fd);

      onSave(saved);
    } catch (err) {
      showToast(err?.response?.message || err.message || 'Failed to save');
    } finally {
      saving = false;
    }
  }
</script>

{#if toastVisible}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-xl shadow-xl text-sm font-semibold text-white pointer-events-none"
    style="background-color:#EF4444;">
    {toastMsg}
  </div>
{/if}

<div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
  on:click|self={onClose}>

  <div class="bg-background border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden"
    style="max-height:92vh;">

    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
      <h2 class="font-bold text-base">{editingItem ? 'Edit item' : 'Add menu item'}</h2>
      <button class="p-1.5 hover:bg-muted rounded-lg" on:click={onClose}>
        <XIcon size={18} />
      </button>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">

      <!-- Basic info -->
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-1">
            Name <span class="text-red-500">*</span>
          </label>
          <input class="w-full border border-border rounded-xl px-3 py-2.5 bg-background text-foreground text-sm"
            bind:value={name} placeholder="e.g. Chicken Sekuwa, Veg Thukpa" />
        </div>

        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-1">Description</label>
          <textarea rows="2"
            class="w-full border border-border rounded-xl px-3 py-2.5 bg-background text-foreground text-sm resize-none"
            bind:value={description} placeholder="What makes this dish special?" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1">
              Price (Rs.) <span class="text-red-500">*</span>
            </label>
            <input type="number" min="0"
              class="w-full border border-border rounded-xl px-3 py-2.5 bg-background text-foreground text-sm"
              bind:value={price} on:input={onPriceInput} placeholder="0" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-muted-foreground mb-1">Prep time (min)</label>
            <input type="number" min="1"
              class="w-full border border-border rounded-xl px-3 py-2.5 bg-background text-foreground text-sm"
              bind:value={preparationTime} placeholder="15" />
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-muted-foreground mb-1">Menu group</label>
          <select class="w-full border border-border rounded-xl px-3 py-2.5 bg-background text-foreground text-sm"
            bind:value={category}>
            {#each CATEGORIES as cat}<option value={cat}>{cat}</option>{/each}
          </select>
          <p class="text-[11px] text-muted-foreground mt-1">Used to group items visually on your menu page.</p>
        </div>
      </div>

      <hr class="border-border" />

      <!-- Meal Type -->
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-2">
          Meal Type <span class="text-red-500">*</span>
          <span class="font-normal ml-1">(pick all that apply)</span>
        </label>
        <div class="flex flex-wrap gap-2">
          {#each MEAL_TYPES as mt}
            {@const active = mealType.includes(mt.value)}
            <button type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all"
              style={active
                ? 'background-color:#FF6B3515;border-color:#FF6B35;color:#FF6B35;'
                : 'border-color:hsl(var(--border));color:hsl(var(--muted-foreground));'}
              on:click={() => toggleMealType(mt.value)}
            >
              <svelte:component this={mt.icon} size={14} />
              {mt.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Cuisine Type -->
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-2">
          Cuisine Type <span class="text-red-500">*</span>
        </label>
        <div class="flex flex-wrap gap-2">
          {#each CUISINE_TYPES as ct}
            {@const active = cuisineType === ct.value}
            <button type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all"
              style={active
                ? 'background-color:#FF6B3515;border-color:#FF6B35;color:#FF6B35;'
                : 'border-color:hsl(var(--border));color:hsl(var(--muted-foreground));'}
              on:click={() => cuisineType = ct.value}
            >
              <svelte:component this={ct.icon} size={14} />
              {ct.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Diet Type -->
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-2">
          Diet Type <span class="text-red-500">*</span>
        </label>
        <div class="flex gap-2">
          {#each DIET_TYPES as dt}
            {@const active = dietType === dt.value}
            <button type="button"
              class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-semibold transition-all"
              style={active
                ? `background-color:${dt.color}15;border-color:${dt.color};color:${dt.color};`
                : 'border-color:hsl(var(--border));color:hsl(var(--muted-foreground));'}
              on:click={() => dietType = dt.value}
            >
              <svelte:component this={dt.icon} size={14} />
              {dt.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Spice Level — hidden when only Drink is selected -->
      {#if showSpiceLevel}
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-2">Spice Level</label>
        <div class="flex gap-2">
          {#each SPICE_LEVELS as sl}
            {@const active = spiceLevel === sl.value}
            <button type="button"
              class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-semibold transition-all"
              style={active
                ? `background-color:${sl.color}20;border-color:${sl.color};color:${sl.color};`
                : 'border-color:hsl(var(--border));color:hsl(var(--muted-foreground));'}
              on:click={() => spiceLevel = sl.value}
            >
              <svelte:component this={sl.icon} size={14} />
              {sl.label}
            </button>
          {/each}
        </div>
      </div>
      {/if}

      <!-- Health Tag -->
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-2">Health Tag</label>
        <div class="flex gap-2">
          {#each HEALTH_TAGS as ht}
            {@const active = healthTag === ht.value}
            <button type="button"
              class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-semibold transition-all"
              style={active
                ? 'background-color:#FF6B3515;border-color:#FF6B35;color:#FF6B35;'
                : 'border-color:hsl(var(--border));color:hsl(var(--muted-foreground));'}
              on:click={() => healthTag = ht.value}
            >
              <svelte:component this={ht.icon} size={14} />
              {ht.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Price Tier -->
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-1">
          Price Tier <span class="font-normal">(auto-set from price)</span>
        </label>
        <div class="flex gap-2">
          {#each PRICE_TIERS as pt}
            {@const active = priceTier === pt.value}
            <button type="button"
              class="flex-1 flex flex-col items-center py-2 px-1 rounded-xl border text-xs font-semibold transition-all"
              style={active
                ? 'background-color:#FF6B3515;border-color:#FF6B35;color:#FF6B35;'
                : 'border-color:hsl(var(--border));color:hsl(var(--muted-foreground));'}
              on:click={() => priceTier = pt.value}
            >
              <svelte:component this={pt.icon} size={16} class="mb-0.5" />
              <span>{pt.label}</span>
              <span class="font-normal opacity-60">{pt.range}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Popularity Badge -->
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-2">
          Popularity Badge <span class="font-normal">(Trending/Bestseller auto-updated)</span>
        </label>
        <div class="flex flex-wrap gap-2">
          {#each POPULARITY_TAGS as pt}
            {@const active = popularityTag === pt.value}
            <button type="button"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all"
              style={active
                ? 'background-color:#FF6B3515;border-color:#FF6B35;color:#FF6B35;'
                : 'border-color:hsl(var(--border));color:hsl(var(--muted-foreground));'}
              on:click={() => popularityTag = pt.value}
            >
              {#if pt.icon !== null}
                <svelte:component this={pt.icon} size={14} />
              {/if}
              {pt.label}
            </button>
          {/each}
        </div>
        <p class="text-[11px] text-muted-foreground mt-1">
          Only set "Chef Special" manually. Bestseller &amp; Trending update automatically.
        </p>
      </div>

      <hr class="border-border" />

      <!-- Photo -->
      <div>
        <label class="block text-xs font-semibold text-muted-foreground mb-2">Photo</label>
        {#if imagePreview}
          <div class="relative w-20 h-20 mb-2">
            <img src={imagePreview} alt="" class="w-full h-full rounded-xl object-cover" />
            <button
              class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"
              on:click={() => { imageFile = null; imagePreview = null; }}>
              <XIcon size={10} />
            </button>
          </div>
        {/if}
        <label class="cursor-pointer inline-flex items-center gap-1.5 border border-border px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-muted transition-colors">
          <UploadIcon size={13} />
          Choose photo
          <input type="file" accept="image/*" class="hidden" on:change={handleImage} />
        </label>
      </div>

      <!-- Availability -->
      <div class="flex items-center justify-between py-2.5 px-3 bg-muted/50 rounded-xl">
        <div>
          <p class="text-sm font-medium">Available to order</p>
          <p class="text-[11px] text-muted-foreground">Customers can order this item right now</p>
        </div>
        <button on:click={() => isAvailable = !isAvailable}>
          {#if isAvailable}
            <ToggleRightIcon size={30} style="color:#FF6B35;" />
          {:else}
            <ToggleLeftIcon size={30} class="text-muted-foreground" />
          {/if}
        </button>
      </div>

      <hr class="border-border" />

      <!-- Add-ons / Modifiers -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <div>
            <p class="text-sm font-semibold flex items-center gap-1.5">
              <SlidersIcon size={14} />Add-ons &amp; options
            </p>
            <p class="text-[11px] text-muted-foreground">Size, filling, extras…</p>
          </div>
          {#if editingModifierIdx === null}
            <button
              class="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white hover:opacity-90"
              style="background-color:#FF6B35;"
              on:click={startNewModifier}>
              <PlusIcon size={12} />Add group
            </button>
          {/if}
        </div>

        {#if modifiers.length > 0 && editingModifierIdx === null}
          <div class="space-y-2 mb-3">
            {#each modifiers as mod, idx}
              <div class="flex items-center gap-2 p-2.5 rounded-xl border border-border bg-card">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{mod.label}</p>
                  <p class="text-xs text-muted-foreground">
                    {mod.type === 'radio' ? 'Pick one' : 'Pick any'}
                    · {mod.options.length} option{mod.options.length !== 1 ? 's' : ''}
                    {mod.required ? ' · Required' : ''}
                  </p>
                </div>
                <button class="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"
                  on:click={() => startEditModifier(idx)}><PencilSimpleIcon size={14} /></button>
                <button class="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg text-red-500"
                  on:click={() => removeModifier(idx)}><TrashIcon size={14} /></button>
              </div>
            {/each}
          </div>
        {/if}

        {#if editingModifierIdx !== null}
          <div class="border border-[#FF6B35]/30 bg-[#FF6B3504] rounded-xl p-3 space-y-3">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Group label <span class="text-red-500">*</span>
                </label>
                <input class="w-full border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground text-sm"
                  bind:value={draftModifier.label} placeholder="e.g. Choose size" />
              </div>
              <div>
                <label class="block text-[11px] font-semibold text-muted-foreground mb-1">Type</label>
                <select class="w-full border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground text-sm"
                  bind:value={draftModifier.type}>
                  <option value="radio">Pick one only</option>
                  <option value="multi">Pick any (multi)</option>
                </select>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <input type="checkbox" id="modReq" bind:checked={draftModifier.required} class="rounded" />
              <label for="modReq" class="text-sm cursor-pointer">Required</label>
            </div>

            {#if draftModifier.options.length > 0}
              <div class="space-y-1">
                {#each draftModifier.options as opt}
                  <div class="flex items-center gap-2 text-sm px-2 py-1.5 bg-background rounded-lg border border-border">
                    <span class="flex-1 truncate">{opt.name}</span>
                    {#if opt.price !== 0}
                      <span class="text-xs text-muted-foreground">{opt.price > 0 ? '+' : ''}Rs.{opt.price}</span>
                    {/if}
                    <button class="text-red-500 p-0.5 rounded"
                      on:click={() => removeDraftOption(opt.id)}><XIcon size={13} /></button>
                  </div>
                {/each}
              </div>
            {/if}

            <div class="flex gap-2">
              <input class="flex-1 border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground text-sm"
                bind:value={draftOption.name} placeholder="Option name"
                on:keydown={e => e.key === 'Enter' && addDraftOption()} />
              <div class="relative">
                <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rs.</span>
                <input type="number"
                  class="w-24 border border-border rounded-lg pl-8 pr-2 py-1.5 bg-background text-foreground text-sm"
                  bind:value={draftOption.price} placeholder="0" />
              </div>
              <button class="px-2.5 py-1.5 rounded-lg text-white text-xs font-semibold hover:opacity-90"
                style="background-color:#FF6B35;" on:click={addDraftOption}>Add</button>
            </div>
            <p class="text-[11px] text-muted-foreground">
              Negative price (e.g. -20) for cheaper variants. 0 = no extra charge.
            </p>

            <div class="flex gap-2 pt-1">
              <button class="flex-1 border border-border py-1.5 rounded-lg text-sm font-medium hover:bg-muted"
                on:click={() => editingModifierIdx = null}>Cancel</button>
              <button class="flex-1 py-1.5 rounded-lg text-white text-sm font-semibold hover:opacity-90"
                style="background-color:#FF6B35;" on:click={saveDraftModifier}>Save group</button>
            </div>
          </div>
        {/if}
      </div>

    </div>

    <!-- Footer -->
    <div class="px-5 py-4 border-t border-border flex gap-2 flex-shrink-0">
      <button class="flex-1 border border-border py-2.5 rounded-xl text-sm font-medium hover:bg-muted"
        on:click={onClose}>Cancel</button>
      <button
        class="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        style="background-color:#FF6B35;"
        disabled={saving}
        on:click={save}>
        {saving ? 'Saving…' : editingItem ? 'Save changes' : 'Add item'}
      </button>
    </div>

  </div>
</div>