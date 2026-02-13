<script>
  import Sidebar from '$lib/components/Sidebar.svelte';
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { requireAuth } from '$lib/auth';

  let user;
  let username = '';
  let bio = '';
  let avatar;
  let avatarName = 'No file chosen';
  let canChangeUsername = true;
  let nextUsernameChangeDate = null;

  // Password change fields
  let oldPassword = '';
  let newPassword = '';
  let confirmPassword = '';

  // Delete account modal
  let showDeleteModal = false;
  let deletePassword = '';

  onMount(() => {
    requireAuth();
    user = pb.authStore.model;
    username = user.username;
    bio = user.bio || '';
    
    checkUsernameChangeEligibility();
  });

  function checkUsernameChangeEligibility() {
    if (user.usernameLastChanged) {
      const lastChanged = new Date(user.usernameLastChanged);
      const now = new Date();
      const hoursSinceChange = (now - lastChanged) / (1000 * 60 * 60);
      
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
    
    // Only update username if it changed and user is eligible
    if (username !== user.username) {
      if (!canChangeUsername) {
        alert(`You can only change your username once every 24 hours. Next change available: ${nextUsernameChangeDate.toLocaleString()}`);
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
      alert('Profile updated successfully!');
      goto('/profile');
    } catch (err) {
      console.error('Failed to update profile:', err);
      alert(err.message || 'Failed to update profile');
    }
  }

  async function changePassword() {
    if (!oldPassword || !newPassword || !confirmPassword) {
      alert('Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      alert('New password must be at least 8 characters long');
      return;
    }

    try {
      await pb.collection('users').update(user.id, {
        oldPassword: oldPassword,
        password: newPassword,
        passwordConfirm: confirmPassword
      });

      alert('Password changed successfully!');
      oldPassword = '';
      newPassword = '';
      confirmPassword = '';
    } catch (err) {
      console.error('Failed to change password:', err);
      alert(err.message || 'Failed to change password. Make sure your old password is correct.');
    }
  }

  async function deleteAccount() {
    if (!deletePassword) {
      alert('Please enter your password to confirm account deletion');
      return;
    }

    try {
      // Authenticate user with their password
      await pb.collection('users').authWithPassword(user.email, deletePassword);
      
      // If authentication succeeds, delete the account
      await pb.collection('users').delete(user.id);
      
      // Clear auth and redirect
      pb.authStore.clear();
      alert('Your account has been deleted');
      goto('/auth/login');
    } catch (err) {
      console.error('Failed to delete account:', err);
      alert('Incorrect password or failed to delete account');
      deletePassword = '';
    }
  }
</script>

<div class="h-screen flex bg-background text-foreground overflow-hidden">
  <Sidebar />

  <main class="flex-1 overflow-y-auto">
    <div class="max-w-xl mx-auto p-10">
      <h1 class="text-xl font-semibold mb-8">Edit profile</h1>

      <div class="space-y-6">
        <!-- USERNAME -->
        <div>
          <label class="block text-sm mb-1">Username</label>
          <input
            class="w-full border rounded-lg px-4 py-2 bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            bind:value={username}
            disabled={!canChangeUsername}
          />
          {#if !canChangeUsername}
            <p class="text-xs text-red-500 mt-1">
              You can change your username again on {nextUsernameChangeDate?.toLocaleString()}
            </p>
          {/if}
        </div>

        <!-- BIO -->
        <div>
          <label class="block text-sm mb-1">Bio</label>
          <textarea
            rows="3"
            class="w-full border rounded-lg px-4 py-2 bg-background text-foreground"
            bind:value={bio}
          />
        </div>

        <!-- AVATAR UPLOAD -->
        <div>
          <label class="block text-sm mb-2">Profile picture</label>

          <div class="flex items-center gap-4">
            <label class="cursor-pointer border px-4 py-2 rounded-lg hover:bg-muted">
              Choose file
              <input
                type="file"
                accept="image/*"
                class="hidden"
                on:change={handleFile}
              />
            </label>

            <span class="text-sm text-muted-foreground">
              {avatarName}
            </span>
          </div>
        </div>

        <!-- SAVE -->
        <button
          class="w-full bg-primary text-primary-foreground py-2 rounded-lg hover:opacity-90"
          on:click={save}
        >
          Save changes
        </button>
      </div>

      <!-- PASSWORD CHANGE SECTION -->
      <div class="border-t pt-6 mt-10">
        <h2 class="text-lg font-semibold mb-4">Change password</h2>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1">Current password</label>
            <input
              type="password"
              class="w-full border rounded-lg px-4 py-2 bg-background text-foreground"
              bind:value={oldPassword}
              placeholder="Enter current password"
            />
          </div>

          <div>
            <label class="block text-sm mb-1">New password</label>
            <input
              type="password"
              class="w-full border rounded-lg px-4 py-2 bg-background text-foreground"
              bind:value={newPassword}
              placeholder="Enter new password (min 8 characters)"
            />
          </div>

          <div>
            <label class="block text-sm mb-1">Confirm new password</label>
            <input
              type="password"
              class="w-full border rounded-lg px-4 py-2 bg-background text-foreground"
              bind:value={confirmPassword}
              placeholder="Re-enter new password"
            />
          </div>

          <button
            class="w-full border border-primary text-primary py-2 rounded-lg hover:bg-primary hover:text-primary-foreground"
            on:click={changePassword}
          >
            Change password
          </button>
        </div>
      </div>

      <!-- Delete account -->
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
  <div class="bg-background border rounded-lg p-6 max-w-md w-full mx-4">
    <h2 class="text-lg font-semibold mb-4 text-red-600">Delete account</h2>
    <p class="text-sm mb-4">
      This action cannot be undone. Please enter your password to confirm account deletion.
    </p>
    <div class="mb-4">
      <label class="block text-sm mb-1">Password</label>
      <input
        type="password"
        class="w-full border rounded-lg px-4 py-2 bg-background text-foreground"
        bind:value={deletePassword}
        placeholder="Enter your password"
        autofocus
        on:keydown={(e) => e.key === 'Enter' && deleteAccount()}
      />
    </div>
    <div class="flex gap-2">
      <button
        class="flex-1 border py-2 rounded-lg hover:bg-muted"
        on:click={() => {
          showDeleteModal = false;
          deletePassword = '';
        }}
      >
        Cancel
      </button>
      <button
        class="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700"
        on:click={deleteAccount}
      >
        Delete permanently
      </button>
    </div>
  </div>
</div>
    </div>
  </main>
</div>

<!-- DELETE ACCOUNT MODAL -->
{#if showDeleteModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-background border rounded-lg p-6 max-w-md w-full mx-4">
      <h2 class="text-lg font-semibold mb-4 text-red-600">Delete account</h2>
      
      <p class="text-sm mb-4">
        This action cannot be undone. Please enter your password to confirm account deletion.
      </p>

      <div class="mb-4">
        <label class="block text-sm mb-1">Password</label>
        <input
          type="password"
          class="w-full border rounded-lg px-4 py-2 bg-background text-foreground"
          bind:value={deletePassword}
          placeholder="Enter your password"
          autofocus
        />
      </div>

      <div class="flex gap-2">
        <button
          class="flex-1 border py-2 rounded-lg hover:bg-muted"
          on:click={() => {
            showDeleteModal = false;
            deletePassword = '';
          }}
        >
          Cancel
        </button>
        <button
          class="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700"
          on:click={deleteAccount}
        >
          Delete permanently
        </button>
      </div>
    </div>
  </div>
{/if}