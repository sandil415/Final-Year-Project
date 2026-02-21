<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import { Store, ChefHat, Truck, UtensilsCrossed } from 'lucide-svelte';

  let user;
  let username = '';
  let bio = '';
  let avatar;
  let avatarName = 'No file chosen';
  let canChangeUsername = true;
  let nextUsernameChangeDate = null;

  // Password fields
  let oldPassword = '';
  let newPassword = '';
  let confirmPassword = '';

  // Delete account
  let showDeleteModal = false;
  let deletePassword = '';
  let deleteError = '';

  // Business
  let isBusiness = false;
  let businessName = '';
  let businessType = 'home_chef';
  let businessDescription = '';
  let businessPhone = '';
  let businessAddress = '';
  let showBusinessUpgradeModal = false;

  // Toast
  let toast = null;
  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => toast = null, 3000);
  }

  const businessTypes = [
    { value: 'home_chef', label: 'Home Chef', icon: ChefHat },
    { value: 'restaurant', label: 'Restaurant', icon: Store },
    { value: 'food_truck', label: 'Food Truck', icon: Truck },
    { value: 'catering', label: 'Catering', icon: UtensilsCrossed },
  ];

  onMount(() => {
    requireAuth();
    user = pb.authStore.model;
    username = user.username;
    bio = user.bio || '';
    isBusiness = user.accountType === 'business';
    businessName = user.businessName || '';
    businessType = user.businessType || 'home_chef';
    businessDescription = user.businessDescription || '';
    businessPhone = user.businessPhone || '';
    businessAddress = user.businessAddress || '';
    checkUsernameChangeEligibility();
  });

  function checkUsernameChangeEligibility() {
    if (user.usernameLastChanged) {
      const lastChanged = new Date(user.usernameLastChanged);
      const hoursSinceChange = (new Date() - lastChanged) / (1000 * 60 * 60);
      if (hoursSinceChange < 24) {
        canChangeUsername = false;
        nextUsernameChangeDate = new Date(lastChanged.getTime() + 24 * 60 * 60 * 1000);
      }
    }
  }

  function handleFile(e) {
    avatar = e.target.files[0];
    avatarName = avatar ? avatar.name : 'No file chosen';
  }

  async function save() {
    const form = new FormData();
    if (username !== user.username) {
      if (!canChangeUsername) {
        showToast(`Next username change: ${nextUsernameChangeDate.toLocaleString()}`, 'error');
        return;
      }
      form.append('username', username);
      form.append('usernameLastChanged', new Date().toISOString());
    }
    form.append('bio', bio);
    if (avatar) form.append('avatar', avatar);

    try {
      const updated = await pb.collection('users').update(user.id, form);
      pb.authStore.save(pb.authStore.token, updated);
      showToast('Profile updated!');
      goto('/profile');
    } catch (err) {
      showToast(err.message || 'Failed to update profile', 'error');
    }
  }

  async function changePassword() {
    if (!oldPassword || !newPassword || !confirmPassword) {
      showToast('Fill in all password fields', 'error'); return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error'); return;
    }
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error'); return;
    }
    try {
      await pb.collection('users').update(user.id, {
        oldPassword, password: newPassword, passwordConfirm: confirmPassword
      });
      showToast('Password changed!');
      oldPassword = ''; newPassword = ''; confirmPassword = '';
    } catch (err) {
      showToast(err?.response?.message || 'Wrong current password', 'error');
    }
  }

  async function deleteAccount() {
    deleteError = '';
    if (!deletePassword) {
      deleteError = 'Please enter your password'; return;
    }
    try {
      await pb.collection('users').authWithPassword(pb.authStore.model.email, deletePassword);
      await pb.collection('users').delete(pb.authStore.model.id);
      pb.authStore.clear();
      goto('/auth/login');
    } catch (err) {
      deleteError = err?.response?.message || err?.message || 'Incorrect password';
      deletePassword = '';
    }
  }

  async function upgradeToBusinessAccount() {
    if (!businessName.trim()) {
      showToast('Business name is required', 'error'); return;
    }
    try {
      const updated = await pb.collection('users').update(user.id, {
        accountType: 'business',
        businessName: businessName.trim(),
        businessType,
        businessDescription,
        businessPhone,
        businessAddress,
      });
      pb.authStore.save(pb.authStore.token, updated);
      isBusiness = true;
      showBusinessUpgradeModal = false;
      showToast('Business account activated! 🎉');
    } catch (err) {
      showToast(err.message || 'Failed to upgrade account', 'error');
    }
  }

  async function saveBusinessDetails() {
    try {
      const updated = await pb.collection('users').update(user.id, {
        businessName, businessType, businessDescription, businessPhone, businessAddress
      });
      pb.authStore.save(pb.authStore.token, updated);
      showToast('Business details saved!');
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
    }
  }
</script>

<!-- Toast -->
{#if toast}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white transition-all
    {toast.type === 'error' ? 'bg-red-500' : ''}"
    style={toast.type !== 'error' ? 'background-color: #FF6B35;' : ''}
  >
    {toast.msg}
  </div>
{/if}

<!-- Business Upgrade Modal -->
{#if showBusinessUpgradeModal}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="bg-background border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background-color: #FF6B35;">
          <Store class="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 class="text-lg font-bold text-foreground">Upgrade to Business</h2>
          <p class="text-xs text-muted-foreground">Reach more customers on FIESTRA</p>
        </div>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Business name <span class="text-red-500">*</span></label>
          <input
            class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground focus:outline-none focus:ring-2"
            style="--tw-ring-color: #FF6B35;"
            bind:value={businessName}
            placeholder="e.g. Momo Palace, Chef Anita's Kitchen"
          />
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Business type</label>
          <div class="grid grid-cols-2 gap-2">
            {#each businessTypes as bt}
              {@const Icon = bt.icon}
              <button
                class="flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium text-left
                  {businessType === bt.value ? 'border-orange-400 text-foreground' : 'border-border text-muted-foreground hover:border-border/60'}"
                style={businessType === bt.value ? 'background-color: #FF6B3515; border-color: #FF6B35;' : ''}
                on:click={() => businessType = bt.value}
              >
                <Icon class="w-4 h-4 flex-shrink-0" style={businessType === bt.value ? 'color: #FF6B35;' : ''} />
                {bt.label}
              </button>
            {/each}
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Description</label>
          <textarea
            rows="2"
            class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground resize-none"
            bind:value={businessDescription}
            placeholder="What makes your food special?"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">Phone</label>
            <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={businessPhone} placeholder="+977 98..." />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Address</label>
            <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={businessAddress} placeholder="Thamel, Kathmandu" />
          </div>
        </div>
      </div>

      <div class="flex gap-2 mt-6">
        <button
          class="flex-1 border border-border py-2.5 rounded-xl hover:bg-muted transition-colors text-sm font-medium"
          on:click={() => showBusinessUpgradeModal = false}
        >
          Cancel
        </button>
        <button
          class="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style="background-color: #FF6B35;"
          on:click={upgradeToBusinessAccount}
        >
          Activate Business Account
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Modal — ONLY ONE, PROPERLY GUARDED -->
{#if showDeleteModal}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="bg-background border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
      <h2 class="text-lg font-bold mb-1 text-red-500">Delete account</h2>
      <p class="text-sm text-muted-foreground mb-4">
        This is permanent and cannot be undone. Enter your password to confirm.
      </p>
      <input
        type="password"
        class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground mb-2"
        bind:value={deletePassword}
        placeholder="Your password"
        on:keydown={(e) => e.key === 'Enter' && deleteAccount()}
      />
      {#if deleteError}
        <p class="text-xs text-red-500 mb-3">{deleteError}</p>
      {/if}
      <div class="flex gap-2 mt-4">
        <button
          class="flex-1 border border-border py-2.5 rounded-xl hover:bg-muted text-sm font-medium"
          on:click={() => { showDeleteModal = false; deletePassword = ''; deleteError = ''; }}
        >
          Cancel
        </button>
        <button
          class="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold"
          on:click={deleteAccount}
        >
          Delete permanently
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />
  <main class="flex-1 overflow-y-auto">
    <div class="max-w-xl mx-auto p-8 pb-20">
      <h1 class="text-xl font-bold mb-8">Edit profile</h1>

      <!-- PROFILE SECTION -->
      <div class="space-y-5">
        <div>
          <label class="block text-sm font-medium mb-1">Username</label>
          <input
            class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            bind:value={username}
            disabled={!canChangeUsername}
          />
          {#if !canChangeUsername}
            <p class="text-xs text-red-500 mt-1">
              Available again: {nextUsernameChangeDate?.toLocaleString()}
            </p>
          {/if}
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Bio</label>
          <textarea rows="3" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground resize-none" bind:value={bio} />
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Profile picture</label>
          <div class="flex items-center gap-4">
            <label class="cursor-pointer border border-border px-4 py-2 rounded-xl hover:bg-muted text-sm font-medium transition-colors">
              Choose file
              <input type="file" accept="image/*" class="hidden" on:change={handleFile} />
            </label>
            <span class="text-sm text-muted-foreground truncate">{avatarName}</span>
          </div>
        </div>

        <button
          class="w-full text-white py-2.5 rounded-xl font-semibold hover:opacity-90 transition-opacity"
          style="background-color: #FF6B35;"
          on:click={save}
        >
          Save changes
        </button>
      </div>

      <!-- BUSINESS SECTION -->
      <div class="border-t border-border pt-8 mt-10">
        {#if !isBusiness}
          <!-- Upgrade CTA -->
          <div class="rounded-2xl p-5 border-2 border-dashed border-border hover:border-orange-300 transition-colors">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style="background-color: #FF6B3520;">
                <Store class="w-6 h-6" style="color: #FF6B35;" />
              </div>
              <div class="flex-1">
                <h3 class="font-bold text-foreground mb-1">Go Business on FIESTRA</h3>
                <p class="text-sm text-muted-foreground mb-3">
                  Are you a home chef or restaurant? Accept orders, manage your menu, and grow your food business.
                </p>
                <ul class="text-sm text-muted-foreground space-y-1 mb-4">
                  <li class="flex items-center gap-2"><span style="color: #FF6B35;">✓</span> Receive and manage orders</li>
                  <li class="flex items-center gap-2"><span style="color: #FF6B35;">✓</span> Create and update your menu</li>
                  <li class="flex items-center gap-2"><span style="color: #FF6B35;">✓</span> Business profile badge</li>
                  <li class="flex items-center gap-2"><span style="color: #FF6B35;">✓</span> Dedicated business dashboard</li>
                </ul>
                <button
                  class="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  style="background-color: #FF6B35;"
                  on:click={() => showBusinessUpgradeModal = true}
                >
                  Upgrade to Business →
                </button>
              </div>
            </div>
          </div>
        {:else}
          <!-- Edit Business Details -->
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold">Business details</h2>
            <button
              class="text-sm font-semibold px-4 py-1.5 rounded-xl text-white"
              style="background-color: #FF6B35;"
              on:click={() => goto('/business/dashboard')}
            >
              Go to Dashboard →
            </button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1">Business name</label>
              <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={businessName} />
            </div>

            <div>
              <label class="block text-sm font-medium mb-2">Business type</label>
              <div class="grid grid-cols-2 gap-2">
                {#each businessTypes as bt}
                  {@const Icon = bt.icon}
                  <button
                    class="flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium text-left
                      {businessType === bt.value ? '' : 'border-border text-muted-foreground'}"
                    style={businessType === bt.value ? 'background-color: #FF6B3515; border-color: #FF6B35; color: #FF6B35;' : ''}
                    on:click={() => businessType = bt.value}
                  >
                    <Icon class="w-4 h-4 flex-shrink-0" />
                    {bt.label}
                  </button>
                {/each}
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Description</label>
              <textarea rows="2" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground resize-none" bind:value={businessDescription} />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium mb-1">Phone</label>
                <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={businessPhone} />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Address</label>
                <input class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={businessAddress} />
              </div>
            </div>

            <button
              class="w-full border border-border py-2.5 rounded-xl text-sm font-medium hover:bg-muted transition-colors"
              on:click={saveBusinessDetails}
            >
              Save business details
            </button>
          </div>
        {/if}
      </div>

      <!-- PASSWORD SECTION -->
      <div class="border-t border-border pt-8 mt-10">
        <h2 class="text-lg font-bold mb-5">Change password</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Current password</label>
            <input type="password" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={oldPassword} placeholder="Current password" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">New password</label>
            <input type="password" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={newPassword} placeholder="Min 8 characters" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Confirm new password</label>
            <input type="password" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground" bind:value={confirmPassword} placeholder="Repeat new password" />
          </div>
          <button
            class="w-full border border-border py-2.5 rounded-xl text-sm font-semibold hover:bg-muted transition-colors"
            on:click={changePassword}
          >
            Change password
          </button>
        </div>
      </div>

      <!-- DANGER ZONE -->
      <div class="border-t border-red-200 pt-8 mt-10">
        <h2 class="text-lg font-bold text-red-500 mb-2">Danger zone</h2>
        <p class="text-sm text-muted-foreground mb-4">Once deleted, your account cannot be recovered.</p>
        <button
          class="border border-red-300 text-red-500 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
          on:click={() => showDeleteModal = true}
        >
          Delete account
        </button>
      </div>
    </div>
  </main>
</div>