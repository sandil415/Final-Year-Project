<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ArrowLeft } from 'lucide-svelte';

  let user = null;
  let menuItems = [];
  let loading = true;
  let showForm = false;
  let editingItem = null;
  let toast = null;

  // Form state
  let form = { name: '', description: '', price: '', category: '', preparationTime: '', isAvailable: true };
  let imageFile = null;
  let imageName = 'No file chosen';

  const categories = ['Momo', 'Thali', 'Chowmein', 'Snacks', 'Drinks', 'Desserts', 'Rice', 'Other'];

  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => toast = null, 3000);
  }

  onMount(async () => {
    requireAuth();
    user = pb.authStore.model;
    if (user.accountType !== 'business') { goto('/profile'); return; }
    await loadMenu();
  });

  async function loadMenu() {
    try {
      loading = true;
      const result = await pb.collection('menuItems').getFullList({
        filter: `seller = "${user.id}"`,
        sort: 'category,name'
      });
      menuItems = result;
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  function openAddForm() {
    editingItem = null;
    form = { name: '', description: '', price: '', category: categories[0], preparationTime: 15, isAvailable: true };
    imageFile = null; imageName = 'No file chosen';
    showForm = true;
  }

  function openEditForm(item) {
    editingItem = item;
    form = {
      name: item.name, description: item.description || '',
      price: item.price, category: item.category || categories[0],
      preparationTime: item.preparationTime || 15, isAvailable: item.isAvailable
    };
    imageFile = null; imageName = 'No file chosen';
    showForm = true;
  }

  function handleImageFile(e) {
    imageFile = e.target.files[0];
    imageName = imageFile ? imageFile.name : 'No file chosen';
  }

  async function saveItem() {
    if (!form.name.trim() || !form.price) {
      showToast('Name and price are required', 'error'); return;
    }
    const data = new FormData();
    data.append('name', form.name.trim());
    data.append('description', form.description);
    data.append('price', parseFloat(form.price));
    data.append('category', form.category);
    data.append('preparationTime', parseInt(form.preparationTime) || 15);
    data.append('isAvailable', form.isAvailable ? 'true' : 'false');
    data.append('seller', user.id);
    if (imageFile) data.append('image', imageFile);

    try {
      if (editingItem) {
        const updated = await pb.collection('menuItems').update(editingItem.id, data);
        menuItems = menuItems.map(i => i.id === editingItem.id ? updated : i);
        showToast('Item updated!');
      } else {
        const created = await pb.collection('menuItems').create(data);
        menuItems = [...menuItems, created];
        showToast('Item added!');
      }
      showForm = false;
    } catch (e) {
      showToast(e.message || 'Failed to save', 'error');
    }
  }

  async function toggleAvailability(item) {
    try {
      const updated = await pb.collection('menuItems').update(item.id, { isAvailable: !item.isAvailable });
      menuItems = menuItems.map(i => i.id === item.id ? updated : i);
    } catch (e) { console.error(e); }
  }

  async function deleteItem(item) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      await pb.collection('menuItems').delete(item.id);
      menuItems = menuItems.filter(i => i.id !== item.id);
      showToast('Item deleted');
    } catch (e) { showToast('Failed to delete', 'error'); }
  }

  // Group by category
  $: grouped = menuItems.reduce((acc, item) => {
    const cat = item.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
</script>

<!-- Toast -->
{#if toast}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white"
    style={toast.type === 'error' ? 'background-color: #EF4444;' : 'background-color: #FF6B35;'}>
    {toast.msg}
  </div>
{/if}

<!-- Item Form Modal -->
{#if showForm}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="bg-background border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
      <h2 class="text-lg font-bold mb-5">{editingItem ? 'Edit item' : 'Add menu item'}</h2>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Name <span class="text-red-500">*</span></label>
          <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={form.name} placeholder="e.g. Chicken Momo" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Description</label>
          <textarea rows="2" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground resize-none" bind:value={form.description} placeholder="Describe your dish..." />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">Price (रु) <span class="text-red-500">*</span></label>
            <input type="number" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={form.price} placeholder="0" min="0" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Prep time (min)</label>
            <input type="number" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={form.preparationTime} placeholder="15" min="1" />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Category</label>
          <select class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={form.category}>
            {#each categories as cat}<option value={cat}>{cat}</option>{/each}
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Photo</label>
          <label class="cursor-pointer border border-border px-4 py-2 rounded-xl hover:bg-muted text-sm font-medium inline-block">
            Choose photo
            <input type="file" accept="image/*" class="hidden" on:change={handleImageFile} />
          </label>
          {#if editingItem?.image && !imageFile}
            <img src={pb.files.getUrl(editingItem, editingItem.image)} alt="" class="mt-2 h-16 w-16 rounded-lg object-cover" />
          {/if}
          {#if imageFile}
            <span class="ml-3 text-sm text-muted-foreground">{imageName}</span>
          {/if}
        </div>

        <div class="flex items-center justify-between p-3 bg-muted rounded-xl">
          <span class="text-sm font-medium">Available to order</span>
          <button on:click={() => form.isAvailable = !form.isAvailable}>
            {#if form.isAvailable}
              <ToggleRight class="w-7 h-7" style="color: #FF6B35;" />
            {:else}
              <ToggleLeft class="w-7 h-7 text-muted-foreground" />
            {/if}
          </button>
        </div>
      </div>

      <div class="flex gap-2 mt-6">
        <button class="flex-1 border border-border py-2.5 rounded-xl text-sm font-medium hover:bg-muted" on:click={() => showForm = false}>Cancel</button>
        <button class="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90" style="background-color: #FF6B35;" on:click={saveItem}>
          {editingItem ? 'Save changes' : 'Add item'}
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />
  <main class="flex-1 overflow-y-auto">
    <div class="max-w-3xl mx-auto p-6">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <button class="p-2 hover:bg-muted rounded-lg" on:click={() => goto('/business/dashboard')}>
            <ArrowLeft class="w-5 h-5" />
          </button>
          <div>
            <h1 class="text-xl font-bold">Menu</h1>
            <p class="text-xs text-muted-foreground">{menuItems.length} items</p>
          </div>
        </div>
        <button
          class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90"
          style="background-color: #FF6B35;"
          on:click={openAddForm}
        >
          <Plus class="w-4 h-4" /> Add item
        </button>
      </div>

      {#if loading}
        <div class="text-center py-20 text-muted-foreground">Loading menu...</div>
      {:else if menuItems.length === 0}
        <div class="text-center py-20 border-2 border-dashed border-border rounded-2xl">
          <p class="text-xl font-semibold mb-2">Your menu is empty</p>
          <p class="text-muted-foreground text-sm mb-6">Add your first dish to start accepting orders</p>
          <button class="px-5 py-2.5 rounded-xl text-white font-semibold hover:opacity-90" style="background-color: #FF6B35;" on:click={openAddForm}>
            Add first item
          </button>
        </div>
      {:else}
        <div class="space-y-8">
          {#each Object.entries(grouped) as [category, items]}
            <div>
              <h3 class="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">{category}</h3>
              <div class="space-y-2">
                {#each items as item}
                  <div class="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl {!item.isAvailable ? 'opacity-60' : ''}">
                    {#if item.image}
                      <img src={pb.files.getUrl(item, item.image)} alt={item.name} class="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                    {:else}
                      <div class="w-14 h-14 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 text-2xl">🍽️</div>
                    {/if}

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <p class="font-semibold text-sm text-foreground truncate">{item.name}</p>
                        {#if !item.isAvailable}
                          <span class="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Unavailable</span>
                        {/if}
                      </div>
                      {#if item.description}
                        <p class="text-xs text-muted-foreground truncate">{item.description}</p>
                      {/if}
                      <div class="flex items-center gap-3 mt-1">
                        <span class="text-sm font-bold text-foreground">रु {item.price}</span>
                        {#if item.preparationTime}
                          <span class="text-xs text-muted-foreground">~{item.preparationTime} min</span>
                        {/if}
                      </div>
                    </div>

                    <div class="flex items-center gap-1 flex-shrink-0">
                      <button class="p-2 hover:bg-muted rounded-lg transition-colors" on:click={() => toggleAvailability(item)} title={item.isAvailable ? 'Mark unavailable' : 'Mark available'}>
                        {#if item.isAvailable}
                          <ToggleRight class="w-5 h-5" style="color: #FF6B35;" />
                        {:else}
                          <ToggleLeft class="w-5 h-5 text-muted-foreground" />
                        {/if}
                      </button>
                      <button class="p-2 hover:bg-muted rounded-lg transition-colors" on:click={() => openEditForm(item)}>
                        <Pencil class="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button class="p-2 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors" on:click={() => deleteItem(item)}>
                        <Trash2 class="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </main>
</div>