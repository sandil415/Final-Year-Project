<script>
  import { onMount, onDestroy } from 'svelte';
  import pb from '$lib/pocketbase';
  import {
    HeartIcon, HeartStraightIcon, ChatCircleIcon, XIcon,
    DotsThreeVerticalIcon, TrashIcon, PaperPlaneTiltIcon,
    ArrowLeftIcon, ArrowRightIcon, UserCircleIcon,
    WarningCircleIcon, CheckCircleIcon, SpinnerIcon,
  } from 'phosphor-svelte';
  import { notifyLike, notifyComment } from '$lib/Notifications.js';

  // ── Props ─────────────────────────────────────────────────────────────────────
  export let postId;
  export let onClose;
  export let onDelete = null;

  // Optional: pass an array of posts + an index so the modal can navigate
  export let posts = [];      // array of post records (for prev/next nav)
  export let initialIndex = null; // index in posts[] of the current post

  // ── Internal state ────────────────────────────────────────────────────────────
  let post = null;
  let comments = [];
  let loading = true;
  let commentText = '';
  let isLiked = false;
  let likesCount = 0;
  let likeRecordId = null;
  let currentUser = pb.authStore.model ?? pb.authStore.record;
  let submittingComment = false;
  let showMenu = false;
  let deleting = false;
  let commentInputEl;

  // Navigation state
  let navIndex = initialIndex;  // null means no navigation
  let navigating = false;

  // Toast
  let toastMsg = null;
  let toastType = 'success';
  function showToast(msg, type = 'success') {
    toastMsg = msg; toastType = type;
    setTimeout(() => toastMsg = null, 2800);
  }

  $: isOwnPost = post && currentUser && post.user === currentUser.id;
  $: hasPrev = navIndex !== null && navIndex > 0;
  $: hasNext = navIndex !== null && navIndex < posts.length - 1;

  // ── Mount / destroy ───────────────────────────────────────────────────────────
  onMount(async () => {
    await loadPost(postId);

    const onKey = (e) => {
      if (e.key === 'Escape') { if (showMenu) showMenu = false; else onClose(); }
      if (e.key === 'ArrowLeft'  && hasPrev) navigate(-1);
      if (e.key === 'ArrowRight' && hasNext)  navigate(1);
    };
    const onClickOut = (e) => {
      if (showMenu && !e.target.closest('.post-menu-wrap')) showMenu = false;
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClickOut);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClickOut);
    };
  });

  // ── Data loading ──────────────────────────────────────────────────────────────
  async function loadPost(id) {
    loading = true;
    post = null; comments = []; isLiked = false; likesCount = 0; likeRecordId = null;
    try {
      const [p, commentsRes] = await Promise.all([
        pb.collection('posts').getOne(id, { expand: 'user' }),
        pb.collection('comments').getList(1, 100, {
          filter: `post = "${id}"`,
          sort: 'created',
          expand: 'user'
        }),
      ]);
      post = p;
      comments = commentsRes.items;
      await loadLikeStatus(id);
    } catch (err) {
      console.error('Failed to load post:', err);
    } finally {
      loading = false;
    }
  }

  async function loadLikeStatus(id) {
    try {
      const [countRes, likedRes] = await Promise.all([
        pb.collection('likes').getList(1, 1, { filter: `post = "${id}"` }),
        pb.collection('likes').getList(1, 1, { filter: `post = "${id}" && user = "${currentUser.id}"` }),
      ]);
      likesCount = countRes.totalItems;
      if (likedRes.items.length > 0) {
        isLiked = true;
        likeRecordId = likedRes.items[0].id;
      } else {
        isLiked = false;
        likeRecordId = null;
      }
    } catch (_) {}
  }

  // ── Navigation ────────────────────────────────────────────────────────────────
  async function navigate(dir) {
    if (navigating || navIndex === null) return;
    const newIdx = navIndex + dir;
    if (newIdx < 0 || newIdx >= posts.length) return;
    navigating = true;
    navIndex = newIdx;
    const newPost = posts[newIdx];
    await loadPost(newPost.id);
    navigating = false;
  }

  // ── Like ──────────────────────────────────────────────────────────────────────
  async function toggleLike() {
    if (!post) return;
    if (isLiked) {
      try {
        await pb.collection('likes').delete(likeRecordId);
        isLiked = false; likeRecordId = null;
        likesCount = Math.max(0, likesCount - 1);
      } catch (_) {}
    } else {
      try {
        const like = await pb.collection('likes').create({ post: post.id, user: currentUser.id });
        isLiked = true; likeRecordId = like.id; likesCount++;
        if (post.user !== currentUser.id) {
          notifyLike(post.user, currentUser.id, currentUser.username, post.id).catch(() => {});
        }
      } catch (_) {}
    }
  }

  // ── Comment ───────────────────────────────────────────────────────────────────
  async function submitComment() {
    if (!commentText.trim() || submittingComment || !post) return;
    submittingComment = true;
    try {
      const created = await pb.collection('comments').create({
        post: post.id, user: currentUser.id, text: commentText.trim()
      });
      const expanded = await pb.collection('comments').getOne(created.id, { expand: 'user' });
      comments = [...comments, expanded];
      commentText = '';
      if (post.user !== currentUser.id) {
        notifyComment(post.user, currentUser.id, currentUser.username, post.id).catch(() => {});
      }
      showToast('Comment posted');
    } catch (_) {
      showToast('Failed to post comment', 'error');
    } finally {
      submittingComment = false;
    }
  }

  async function deleteComment(commentId) {
    if (!confirm('Delete this comment?')) return;
    try {
      await pb.collection('comments').delete(commentId);
      comments = comments.filter(c => c.id !== commentId);
      showToast('Comment deleted');
    } catch (_) {
      showToast('Failed to delete', 'error');
    }
  }

  // ── Delete post ───────────────────────────────────────────────────────────────
  async function deletePost() {
    if (!isOwnPost || deleting) return;
    showMenu = false;
    if (!confirm('Delete this post? This cannot be undone.')) return;
    deleting = true;
    try {
      await pb.collection('posts').delete(post.id);
      if (onDelete) onDelete(post.id);
      showToast('Post deleted');
      setTimeout(() => onClose(), 400);
    } catch (_) {
      showToast('Failed to delete', 'error');
      deleting = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function timeAgo(ds) {
    const s = Math.floor((Date.now() - new Date(ds)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 604800) return `${Math.floor(s / 86400)}d`;
    return new Date(ds).toLocaleDateString();
  }

  function avatarUrl(u) {
    return u?.avatar ? pb.files.getUrl(u, u.avatar) : '/images/profilePlaceholder.jpg';
  }
</script>

<!-- ════════ TOAST ════════════════════════════════════════════════════════════ -->
{#if toastMsg}
  <div class="fixed top-5 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2.5 px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold text-white pointer-events-none"
    style={toastType === 'error' ? 'background-color:#EF4444;' : 'background-color:#16a34a;'}>
    {#if toastType === 'error'}
      <WarningCircleIcon size={16} weight="fill"/>
    {:else}
      <CheckCircleIcon size={16} weight="fill"/>
    {/if}
    {toastMsg}
  </div>
{/if}

<!-- ════════ BACKDROP + MODAL ════════════════════════════════════════════════ -->
<div
  class="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4"
  on:click|self={onClose}
  role="dialog"
  aria-modal="true"
>

  <!-- Nav: Previous -->
  {#if hasPrev}
    <button
      class="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-all hover:scale-110"
      on:click|stopPropagation={() => navigate(-1)}
      disabled={navigating}
    >
      <ArrowLeftIcon size={20} weight="bold"/>
    </button>
  {/if}

  <!-- Nav: Next -->
  {#if hasNext}
    <button
      class="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-all hover:scale-110"
      on:click|stopPropagation={() => navigate(1)}
      disabled={navigating}
    >
      <ArrowRightIcon size={20} weight="bold"/>
    </button>
  {/if}

  <!-- Close button (always visible) -->
  <button
    class="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-all"
    on:click={onClose}
  >
    <XIcon size={18}/>
  </button>

  <!-- Modal card -->
  <div
    class="relative bg-background rounded-2xl shadow-2xl flex flex-col sm:flex-row w-full overflow-hidden"
    style="max-width:900px; max-height:92vh;"
    on:click|stopPropagation
  >

    {#if loading}
      <!-- Loading state -->
      <div class="flex-1 flex items-center justify-center py-24">
        <SpinnerIcon size={32} class="animate-spin text-muted-foreground"/>
      </div>

    {:else if post}

      <!-- ── IMAGE PANEL ── -->
      <div class="flex-1 bg-black flex items-center justify-center min-h-[260px] sm:min-h-0 relative overflow-hidden">
        {#if navigating}
          <div class="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <SpinnerIcon size={28} class="animate-spin text-white"/>
          </div>
        {/if}
        <img
          src={pb.files.getUrl(post, post.image)}
          alt={post.caption || ''}
          class="max-w-full max-h-full object-contain transition-opacity duration-200 {navigating ? 'opacity-30' : 'opacity-100'}"
          style="max-height: 92vh;"
        />
        <!-- Position indicator -->
        {#if navIndex !== null && posts.length > 1}
          <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {#each posts as _, i}
              <div class="rounded-full transition-all {i === navIndex ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}"></div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- ── SIDEBAR PANEL ── -->
      <div class="w-full sm:w-[360px] flex-shrink-0 flex flex-col border-t sm:border-t-0 sm:border-l border-border min-h-0">

        <!-- Header: author + menu -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <a
            href="/profile/{post.expand?.user?.username}"
            class="flex items-center gap-2.5 flex-1 min-w-0 hover:opacity-80 transition-opacity"
            on:click={onClose}
          >
            <img
              src={avatarUrl(post.expand?.user)}
              alt=""
              class="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-2 ring-border"
            />
            <div class="min-w-0">
              <p class="font-semibold text-sm text-foreground truncate">{post.expand?.user?.username}</p>
              <p class="text-[11px] text-muted-foreground">{timeAgo(post.created)}</p>
            </div>
          </a>

          <!-- 3-dot menu (own post) -->
          {#if isOwnPost}
            <div class="relative post-menu-wrap flex-shrink-0">
              <button
                class="p-2 rounded-full hover:bg-muted transition-colors"
                on:click|stopPropagation={() => showMenu = !showMenu}
              >
                <DotsThreeVerticalIcon size={20} weight="bold" class="text-foreground"/>
              </button>
              {#if showMenu}
                <div class="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-30 min-w-[160px]">
                  <button
                    class="w-full px-4 py-3 text-left flex items-center gap-2.5 text-red-500 font-semibold text-sm hover:bg-muted disabled:opacity-50 transition-colors"
                    disabled={deleting}
                    on:click={deletePost}
                  >
                    <TrashIcon size={15} weight="fill"/>
                    {deleting ? 'Deleting…' : 'Delete post'}
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Caption + comments scroll area -->
        <div class="flex-1 overflow-y-auto min-h-0">
          <!-- Caption -->
          {#if post.caption}
            <div class="flex gap-3 px-4 py-3 border-b border-border">
              <img src={avatarUrl(post.expand?.user)} alt="" class="w-8 h-8 rounded-full object-cover flex-shrink-0"/>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-foreground leading-relaxed">
                  <a href="/profile/{post.expand?.user?.username}" class="font-semibold hover:opacity-70 mr-1" on:click={onClose}>{post.expand?.user?.username}</a>{post.caption}
                </p>
              </div>
            </div>
          {/if}

          <!-- Comments -->
          {#if comments.length === 0}
            <div class="flex flex-col items-center py-10 px-4 text-center">
              <ChatCircleIcon size={28} class="text-muted-foreground mb-2" weight="duotone"/>
              <p class="text-sm text-muted-foreground">No comments yet.</p>
              <p class="text-xs text-muted-foreground">Be the first to comment!</p>
            </div>
          {:else}
            <div class="divide-y divide-border">
              {#each comments as comment (comment.id)}
                <div class="flex gap-3 px-4 py-3 group">
                  <img
                    src={avatarUrl(comment.expand?.user)}
                    alt=""
                    class="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5"
                  />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-foreground leading-relaxed">
                      <a href="/profile/{comment.expand?.user?.username}" class="font-semibold hover:opacity-70 mr-1" on:click={onClose}>{comment.expand?.user?.username}</a>{comment.text}
                    </p>
                    <div class="flex items-center gap-3 mt-1">
                      <span class="text-[11px] text-muted-foreground">{timeAgo(comment.created)}</span>
                      {#if comment.user === currentUser.id}
                        <button
                          class="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-red-500 hover:text-red-600 font-medium flex items-center gap-0.5"
                          on:click={() => deleteComment(comment.id)}
                        >
                          <TrashIcon size={10} weight="fill"/>Delete
                        </button>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Actions bar -->
        <div class="border-t border-border flex-shrink-0">
          <!-- Like + count -->
          <div class="px-4 pt-3 pb-2 flex items-center gap-3">
            <button
              class="group flex items-center gap-1.5 transition-all active:scale-110"
              on:click={toggleLike}
              aria-label={isLiked ? 'Unlike' : 'Like'}
            >
              {#if isLiked}
                <HeartStraightIcon
                  size={26}
                  weight="fill"
                  class="text-red-500 drop-shadow-sm transition-transform group-active:scale-125"
                />
              {:else}
                <HeartIcon
                  size={26}
                  weight="regular"
                  class="text-foreground transition-all group-hover:text-red-400"
                />
              {/if}
            </button>

            <button
              class="flex items-center gap-1 hover:opacity-70 transition-opacity"
              on:click={() => commentInputEl?.focus()}
            >
              <ChatCircleIcon size={24} weight="regular" class="text-foreground"/>
            </button>
          </div>

          <!-- Like count -->
          <div class="px-4 pb-3">
            {#if likesCount > 0}
              <p class="text-sm font-semibold text-foreground">{likesCount.toLocaleString()} {likesCount === 1 ? 'like' : 'likes'}</p>
            {:else}
              <p class="text-sm text-muted-foreground">Be the first to like this</p>
            {/if}
          </div>

          <!-- Comment input -->
          <div class="flex items-center gap-2.5 px-4 py-3 border-t border-border">
            <img src={avatarUrl(currentUser)} alt="" class="w-7 h-7 rounded-full object-cover flex-shrink-0"/>
            <input
              bind:this={commentInputEl}
              type="text"
              bind:value={commentText}
              placeholder="Add a comment…"
              class="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground min-w-0"
              on:keydown={(e) => e.key === 'Enter' && !e.shiftKey && submitComment()}
              disabled={submittingComment}
            />
            <button
              class="flex-shrink-0 p-1.5 rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={commentText.trim() ? 'color:#FF6B35;' : ''}
              disabled={!commentText.trim() || submittingComment}
              on:click={submitComment}
            >
              {#if submittingComment}
                <SpinnerIcon size={18} class="animate-spin"/>
              {:else}
                <PaperPlaneTiltIcon size={18} weight={commentText.trim() ? 'fill' : 'regular'}/>
              {/if}
            </button>
          </div>
        </div>

      </div><!-- end sidebar -->
    {:else}
      <div class="flex-1 flex items-center justify-center py-20">
        <p class="text-muted-foreground">Post not found.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 0.8s linear infinite; }
</style>