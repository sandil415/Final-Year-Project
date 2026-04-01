<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';
  import Header from '$lib/components/Header.svelte';
  import { theme } from '$lib/theme';
  import { Store, ChefHat, Truck, UtensilsCrossed, Upload, Clock, CheckCircle, XCircle, Sun, Moon, Monitor, LogOut } from 'lucide-svelte';

  let user;
  let username = '';
  let bio = '';
  let avatar;
  let avatarName = 'No file chosen';
  let canChangeUsername = true;
  let nextUsernameChangeDate = null;

  let oldPassword = '';
  let newPassword = '';
  let confirmPassword = '';

  let showDeleteModal = false;
  let deletePassword = '';
  let deleteError = '';

  // Business upgrade
  let isBusiness = false;
  let businessName = '';
  let businessType = 'home_chef';
  let businessDescription = '';
  let businessPhone = '';
  let businessAddress = '';
  let showBusinessUpgradeModal = false;

  // Application state — what we check on load
  // null = never applied, object = existing application record
  let existingApplication = null;

  // The 4 documents — each is a File object from <input type="file">
  let docReg = null;       // Company Registration Certificate
  let docPan = null;       // PAN/VAT Certificate
  let docWard = null;      // Ward/Municipality License
  let docDftqc = null;     // DFTQC Food License

  let submittingApplication = false;

  let toast = null;
  function showToast(msg, type = 'success') {
    toast = { msg, type };
    setTimeout(() => toast = null, 3500);
  }

  const businessTypes = [
    { value: 'home_chef',   label: 'Home Chef',   icon: ChefHat        },
    { value: 'restaurant',  label: 'Restaurant',  icon: Store           },
    { value: 'food_truck',  label: 'Food Truck',  icon: Truck           },
    { value: 'catering',    label: 'Catering',    icon: UtensilsCrossed },
  ];

  onMount(async () => {
    requireAuth();
    user = pb.authStore.record ?? pb.authStore.model;
    username = user.username;
    bio = user.bio || '';
    isBusiness = user.accountType === 'business';
    businessName = user.businessName || '';
    businessType = user.businessType || 'home_chef';
    businessDescription = user.businessDescription || '';
    businessPhone = user.businessPhone || '';
    businessAddress = user.businessAddress || '';
    checkUsernameChangeEligibility();

    // Check if user already has a pending/approved/rejected application
    if (!isBusiness) {
      await checkExistingApplication();
    }
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

  async function checkExistingApplication() {
    try {
      // Get the most recent application by this user
      const res = await pb.collection('business_applications').getList(1, 1, {
        filter: `user.id = "${user.id}"`,
        sort: '-created'
      });

      if (res.items.length > 0) {
        existingApplication = res.items[0];

        // If admin approved it → automatically upgrade the account now
        if (existingApplication.status === 'approved' && !isBusiness) {
          await activateBusinessAccount();
        }
      }
    } catch (err) {
      // No application found — that's fine, user hasn't applied yet
      existingApplication = null;
    }
  }

  // Called automatically when we detect an approved application
  async function activateBusinessAccount() {
    try {
      const updated = await pb.collection('users').update(user.id, {
        accountType:         'business',
        businessName:        existingApplication.businessName,
        businessType:        existingApplication.businessType,
        businessDescription: existingApplication.businessDescription,
        businessPhone:       existingApplication.businessPhone,
        businessAddress:     existingApplication.businessAddress,
      });
      pb.authStore.save(pb.authStore.token, updated);
      isBusiness = true;
      // Reload the user object so all fields are fresh
      user = updated;
      businessName = updated.businessName || '';
      businessType = updated.businessType || 'home_chef';
      businessDescription = updated.businessDescription || '';
      businessPhone = updated.businessPhone || '';
      businessAddress = updated.businessAddress || '';
      showToast('Your business account has been approved! 🎉');
    } catch (err) {
      console.error('Failed to activate business account:', err);
    }
  }

  function handleFile(e) {
    avatar = e.target.files[0];
    avatarName = avatar ? avatar.name : 'No file chosen';
  }

  // Helper for document inputs — returns filename or "No file chosen"
  function getDocName(file) {
    return file ? file.name : 'No file chosen';
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
      showToast(err?.response?.message || JSON.stringify(err?.response?.data) || 'Failed to update', 'error');
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
    if (!deletePassword) { deleteError = 'Please enter your password'; return; }
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

  // Submit the business application with all 4 documents
  async function submitBusinessApplication() {
    // Validate all required fields
    if (!businessName.trim()) {
      showToast('Business name is required', 'error'); return;
    }
    if (!docReg || !docPan || !docWard || !docDftqc) {
      showToast('All 4 documents are required', 'error'); return;
    }

    submittingApplication = true;
    try {
      const form = new FormData();
      form.append('user',                user.id);
      form.append('businessName',        businessName.trim());
      form.append('businessType',        businessType);
      form.append('businessDescription', businessDescription);
      form.append('businessPhone',       businessPhone);
      form.append('businessAddress',     businessAddress);
      form.append('status',              'pending');

      // Append all 4 documents
      form.append('regCertificate', docReg);
      form.append('panCertificate', docPan);
      form.append('wardLicense',    docWard);
      form.append('dftqcLicense',   docDftqc);

      existingApplication = await pb.collection('business_applications').create(form);
      showBusinessUpgradeModal = false;
      showToast('Application submitted! We will review it shortly.');
    } catch (err) {
      console.error(err);
      showToast(err?.response?.message || 'Submission failed', 'error');
    } finally {
      submittingApplication = false;
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

  function logout() {
  pb.authStore.clear();
  goto('/auth/login');
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

<!-- Business Application Modal -->
{#if showBusinessUpgradeModal}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 pt-85 overflow-y-auto">
    <div class="bg-background border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl my-8">

      <!-- Header -->
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background-color: #FF6B35;">
          <Store class="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 class="text-lg font-bold">Apply for Business Account</h2>
          <p class="text-xs text-muted-foreground">Documents will be reviewed within 1–2 business days</p>
        </div>
      </div>

      <div class="space-y-4">

        <!-- Business name -->
        <div>
          <label class="block text-sm font-medium mb-1">
            Business name <span class="text-red-500">*</span>
          </label>
          <input
            class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground focus:outline-none"
            bind:value={businessName}
            placeholder="e.g. Momo Palace, Chef Anita's Kitchen"
          />
        </div>

        <!-- Business type -->
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

        <!-- Description, phone, address -->
        <div>
          <label class="block text-sm font-medium mb-1">Description</label>
          <textarea rows="2" class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground resize-none" bind:value={businessDescription} placeholder="What makes your food special?" />
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

        <!-- DOCUMENTS SECTION -->
        <div class="border-t border-border pt-4">
          <p class="text-sm font-bold mb-1">Required Documents <span class="text-red-500">*</span></p>
          <p class="text-xs text-muted-foreground mb-4">
            Upload clear scans or photos. PDF or image formats accepted.
          </p>

          <div class="space-y-3">

            <!-- Doc 1 -->
            <div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-border">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">Company Registration Certificate</p>
                <p class="text-xs text-muted-foreground truncate">{getDocName(docReg)}</p>
              </div>
              <label class="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
                style="background-color: #FF6B35;">
                <Upload class="w-3 h-3" />
                Upload
                <input type="file" accept="image/*,.pdf" class="hidden"
                  on:change={(e) => docReg = e.target.files[0]} />
              </label>
            </div>

            <!-- Doc 2 -->
            <div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-border">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">PAN / VAT Certificate</p>
                <p class="text-xs text-muted-foreground truncate">{getDocName(docPan)}</p>
              </div>
              <label class="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
                style="background-color: #FF6B35;">
                <Upload class="w-3 h-3" />
                Upload
                <input type="file" accept="image/*,.pdf" class="hidden"
                  on:change={(e) => docPan = e.target.files[0]} />
              </label>
            </div>

            <!-- Doc 3 -->
            <div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-border">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">Local Ward / Municipality License</p>
                <p class="text-xs text-muted-foreground truncate">{getDocName(docWard)}</p>
              </div>
              <label class="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
                style="background-color: #FF6B35;">
                <Upload class="w-3 h-3" />
                Upload
                <input type="file" accept="image/*,.pdf" class="hidden"
                  on:change={(e) => docWard = e.target.files[0]} />
              </label>
            </div>

            <!-- Doc 4 -->
            <div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-border">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">DFTQC Food License</p>
                <p class="text-xs text-muted-foreground truncate">{getDocName(docDftqc)}</p>
              </div>
              <label class="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0"
                style="background-color: #FF6B35;">
                <Upload class="w-3 h-3" />
                Upload
                <input type="file" accept="image/*,.pdf" class="hidden"
                  on:change={(e) => docDftqc = e.target.files[0]} />
              </label>
            </div>

          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 mt-6">
        <button
          class="flex-1 border border-border py-2.5 rounded-xl hover:bg-muted transition-colors text-sm font-medium"
          on:click={() => showBusinessUpgradeModal = false}
          disabled={submittingApplication}
        >
          Cancel
        </button>
        <button
          class="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          style="background-color: #FF6B35;"
          on:click={submitBusinessApplication}
          disabled={submittingApplication}
        >
          {submittingApplication ? 'Submitting...' : 'Submit Application →'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Modal -->
{#if showDeleteModal}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="bg-background border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl">
      <h2 class="text-lg font-bold mb-1 text-red-500">Delete account</h2>
      <p class="text-sm text-muted-foreground mb-4">This is permanent and cannot be undone.</p>
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
        >Cancel</button>
        <button
          class="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold"
          on:click={deleteAccount}
        >Delete permanently</button>
      </div>
    </div>
  </div>
{/if}

<div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
  <Header />
  <main class="flex-1 overflow-y-auto">
    <div class="max-w-xl mx-auto p-8 pb-20">
      <h1 class="text-xl font-bold mb-8">Edit profile</h1>

      <!-- PROFILE SECTION — unchanged -->
      <div class="space-y-5">
        <div>
          <label class="block text-sm font-medium mb-1">Username</label>
          <input
            class="w-full border border-border rounded-xl px-4 py-2.5 bg-background text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            bind:value={username}
            disabled={!canChangeUsername}
          />
          {#if !canChangeUsername}
            <p class="text-xs text-red-500 mt-1">Available again: {nextUsernameChangeDate?.toLocaleString()}</p>
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
        <button class="w-full text-white py-2.5 rounded-xl font-semibold hover:opacity-90" style="background-color: #FF6B35;" on:click={save}>
          Save changes
        </button>
      </div>

      <!-- BUSINESS SECTION -->
      <div class="border-t border-border pt-8 mt-10">
        {#if isBusiness}
          <!-- Already a business — show edit form -->
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold">Business details</h2>
            <button class="text-sm font-semibold px-4 py-1.5 rounded-xl text-white" style="background-color: #FF6B35;" on:click={() => goto('/business/dashboard')}>
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
                    class="flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium text-left {businessType === bt.value ? '' : 'border-border text-muted-foreground'}"
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
            <button class="w-full border border-border py-2.5 rounded-xl text-sm font-medium hover:bg-muted" on:click={saveBusinessDetails}>
              Save business details
            </button>
          </div>

        {:else if existingApplication?.status === 'pending'}
          <!-- Application submitted, waiting for review -->
          <div class="rounded-2xl p-5 border-2 border-dashed border-yellow-400/50 bg-yellow-50/5">
            <div class="flex items-start gap-4">
              <Clock class="w-8 h-8 mt-0.5 flex-shrink-0" style="color: #F59E0B;" />
              <div>
                <h3 class="font-bold text-foreground mb-1">Application Under Review</h3>
                <p class="text-sm text-muted-foreground mb-2">
                  Your business application was submitted on
                  <strong>{new Date(existingApplication.created).toLocaleDateString()}</strong>.
                  We'll review your documents within 1–2 business days.
                </p>
                <p class="text-xs text-muted-foreground">
                  Once approved, your account will automatically upgrade to a business account next time you visit this page.
                </p>
              </div>
            </div>
          </div>

        {:else if existingApplication?.status === 'rejected'}
          <!-- Application was rejected — let them reapply -->
          <div class="rounded-2xl p-5 border-2 border-dashed border-red-400/50 bg-red-50/5 mb-4">
            <div class="flex items-start gap-4">
              <XCircle class="w-8 h-8 mt-0.5 flex-shrink-0 text-red-500" />
              <div>
                <h3 class="font-bold text-red-500 mb-1">Application Rejected</h3>
                {#if existingApplication.rejectionReason}
                  <p class="text-sm text-muted-foreground mb-2">
                    Reason: <span class="text-foreground">{existingApplication.rejectionReason}</span>
                  </p>
                {/if}
                <p class="text-xs text-muted-foreground">You can fix the issues and reapply below.</p>
              </div>
            </div>
          </div>
          <button
            class="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90"
            style="background-color: #FF6B35;"
            on:click={() => { existingApplication = null; showBusinessUpgradeModal = true; }}
          >
            Apply Again →
          </button>

        {:else}
          <!-- Never applied — show upgrade CTA -->
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
                  class="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90"
                  style="background-color: #FF6B35;"
                  on:click={() => showBusinessUpgradeModal = true}
                >
                  Apply for Business Account →
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- PASSWORD SECTION — unchanged -->
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
          <button class="w-full border border-border py-2.5 rounded-xl text-sm font-semibold hover:bg-muted" on:click={changePassword}>
            Change password
          </button>
        </div>
      </div>

      <div class="border-t border-red-200 pt-8 mt-10">
        <h2 class="text-lg font-bold text-red-500 mb-2">Account Deletion</h2>
        <p class="text-sm text-muted-foreground mb-4">Once deleted, your account cannot be recovered.</p>
        <button class="border border-red-300 text-red-500 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-950/20" on:click={() => showDeleteModal = true}>
          Delete account
        </button>
      </div>

      <div class="border-t border-border pt-8 mt-10">
        <h2 class="text-lg font-bold mb-2">Appearance</h2>
        <p class="text-sm text-muted-foreground mb-5">Choose how FIESTRA looks to you.</p>

        <div class="grid grid-cols-3 gap-3">

          <button
            class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all" style={$theme === 'light' ? 'border-color: #FF6B35; background-color: #FF6B3510;' : 'border-color: hsl(var(--border));'} on:click={() => theme.set('light')}>
            <div class="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
              <Sun class="w-5 h-5" style="color: #F59E0B;" />
            </div>
            <span class="text-xs font-semibold" style={$theme === 'light' ? 'color: #FF6B35;' : ''}>
              Light
            </span>
          </button>

          <button
            class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all"
            style={$theme === 'dark'
              ? 'border-color: #FF6B35; background-color: #FF6B3510;'
              : 'border-color: hsl(var(--border));'}
            on:click={() => theme.set('dark')}
          >
            <div class="w-10 h-10 rounded-full bg-gray-900 border border-gray-700 flex items-center justify-center shadow-sm">
              <Moon class="w-5 h-5 text-blue-400" />
            </div>
            <span class="text-xs font-semibold" style={$theme === 'dark' ? 'color: #FF6B35;' : ''}>
              Dark
            </span>
          </button>

          <button
            class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all"
            style={$theme === 'system'
              ? 'border-color: #FF6B35; background-color: #FF6B3510;'
              : 'border-color: hsl(var(--border));'}
            on:click={() => theme.set('system')}
          >
            <div class="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center shadow-sm overflow-hidden"
              style="background: linear-gradient(135deg, white 50%, #111 50%);">
              <Monitor class="w-5 h-5 text-gray-500" />
            </div>
            <span class="text-xs font-semibold" style={$theme === 'system' ? 'color: #FF6B35;' : ''}>
              System
            </span>
          </button>

        </div>
      </div>

      <!-- LOGOUT -->
      <div class="border-t border-border pt-8 mt-10 mb-4">
        <h2 class="text-lg font-bold mb-2">Account</h2>
        <p class="text-sm text-muted-foreground mb-4">
          Signed in as <span class="font-semibold text-foreground">{username}</span>
        </p>
        <button
          class="flex items-center gap-2 border border-border px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-muted transition-colors"
          on:click={logout}
        >
          <LogOut class="w-4 h-4" />
          Log out
        </button>
      </div>
    </div>
  </main>
</div>