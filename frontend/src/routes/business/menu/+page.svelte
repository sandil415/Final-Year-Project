<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import MenuItemForm from '$lib/components/MenuItemForm.svelte';
  import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ArrowLeft } from 'lucide-svelte';

  let user = null;
  let menuItems = [];
  let loading = true;
  let showForm = false;
  let editingItem = null;
  let toast = null;

  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => (toast = null), 3000);
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
        sort: 'category,name',
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
    showForm = true;
  }

  function openEditForm(item) {
    editingItem = item;
    showForm = true;
  }

  // Called by MenuItemForm after a successful save
  async function handleSaved(savedItem) {
    if (editingItem) {
      menuItems = menuItems.map(i => i.id === savedItem.id ? savedItem : i);
      showToast('Item updated!');
    } else {
      menuItems = [...menuItems, savedItem];
      showToast('Item added!');
    }
    showForm = false;
    editingItem = null;
  }

  function handleFormClose() {
    showForm = false;
    editingItem = null;
  }

  async function toggleAvailability(item) {
    try {
      const updated = await pb.collection('menuItems').update(item.id, {
        isAvailable: !item.isAvailable,
      });
      menuItems = menuItems.map(i => i.id === item.id ? updated : i);
    } catch (e) {
      console.error(e);
    }
  }

  async function deleteItem(item) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      await pb.collection('menuItems').delete(item.id);
      menuItems = menuItems.filter(i => i.id !== item.id);
      showToast('Item deleted');
    } catch (e) {
      showToast('Failed to delete', 'error');
    }
  }

  // Group items by category
  $: grouped = menuItems.reduce((acc, item) => {
    const cat = item.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
</script>

<!-- Toast -->
{#if toast}
  <div
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white"
    style={toast.type === 'error' ? 'background-color: #EF4444;' : 'background-color: #FF6B35;'}
  >
    {toast.msg}
  </div>
{/if}

<!-- Menu item form modal (shared component) -->
{#if showForm && user}
  <MenuItemForm
    editingItem={editingItem}
    userId={user.id}
    onSave={handleSaved}
    onClose={handleFormClose}
  />
{/if}

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />
  <main class="flex-1 overflow-y-auto">
    <div class="max-w-3xl mx-auto p-6">

      <!-- Page header -->
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

      <!-- Content -->
      {#if loading}
        <div class="text-center py-20 text-muted-foreground">Loading menu...</div>

      {:else if menuItems.length === 0}
        <div class="text-center py-20 border-2 border-dashed border-border rounded-2xl">
          <p class="text-xl font-semibold mb-2">Your menu is empty</p>
          <p class="text-muted-foreground text-sm mb-6">Add your first dish to start accepting orders</p>
          <button
            class="px-5 py-2.5 rounded-xl text-white font-semibold hover:opacity-90"
            style="background-color: #FF6B35;"
            on:click={openAddForm}
          >
            Add first item
          </button>
        </div>

      {:else}
        <div class="space-y-8">
          {#each Object.entries(grouped) as [category, items]}
            <div>
              <h3 class="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">
                {category}
              </h3>
              <div class="space-y-2">
                {#each items as item}
                  <div
                    class="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl
                      {!item.isAvailable ? 'opacity-60' : ''}"
                  >
                    {#if item.image}
                      <img
                        src={pb.files.getUrl(item, item.image)}
                        alt={item.name}
                        class="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                      />
                    {:else}
                      <div class="w-14 h-14 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 text-2xl">
                        🍽️
                      </div>
                    {/if}

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <p class="font-semibold text-sm text-foreground truncate">{item.name}</p>
                        {#if !item.isAvailable}
                          <span class="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                            Unavailable
                          </span>
                        {/if}
                        <!-- Show modifier badge if item has add-ons -->
                        {#if item.modifiers && (typeof item.modifiers === 'string' ? item.modifiers !== '[]' && item.modifiers !== '' : item.modifiers.length > 0)}
                          {@const modCount = (() => {
                            try {
                              const m = typeof item.modifiers === 'string' ? JSON.parse(item.modifiers) : item.modifiers;
                              return Array.isArray(m) ? m.length : 0;
                            } catch { return 0; }
                          })()}
                          {#if modCount > 0}
                            <span class="text-xs px-2 py-0.5 rounded-full font-medium text-white" style="background-color:#FF6B3580;">
                              {modCount} option group{modCount !== 1 ? 's' : ''}
                            </span>
                          {/if}
                        {/if}
                      </div>
                      {#if item.description}
                        <p class="text-xs text-muted-foreground truncate">{item.description}</p>
                      {/if}
                      <div class="flex items-center gap-3 mt-1">
                        <span class="text-sm font-bold text-foreground">Rs. {item.price}</span>
                        {#if item.preparationTime}
                          <span class="text-xs text-muted-foreground">~{item.preparationTime} min</span>
                        {/if}
                      </div>
                    </div>

                    <div class="flex items-center gap-1 flex-shrink-0">
                      <button
                        class="p-2 hover:bg-muted rounded-lg transition-colors"
                        on:click={() => toggleAvailability(item)}
                        title={item.isAvailable ? 'Mark unavailable' : 'Mark available'}
                      >
                        {#if item.isAvailable}
                          <ToggleRight class="w-5 h-5" style="color:#FF6B35;" />
                        {:else}
                          <ToggleLeft class="w-5 h-5 text-muted-foreground" />
                        {/if}
                      </button>
                      <button
                        class="p-2 hover:bg-muted rounded-lg transition-colors"
                        on:click={() => openEditForm(item)}
                      >
                        <Pencil class="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        class="p-2 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                        on:click={() => deleteItem(item)}
                      >
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