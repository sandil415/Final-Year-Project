<!-- src/routes/checkout/esewa-failure/+page.svelte -->
<!--
  eSewa redirects here when the user cancels payment or payment fails.
  The order was already created in PocketBase with status 'pending'.
  We mark it cancelled here.
-->
<script>
  import pb from '$lib/pocketbase';
  import { onMount }  from 'svelte';
  import { goto }     from '$app/navigation';
  import { page }     from '$app/stores';
  import { WarningCircleIcon } from 'phosphor-svelte';
  import Header from '$lib/components/Header.svelte';

  onMount(async () => {
    // eSewa may send a `data` param on failure too — try to extract orderId
    try {
      const raw = $page.url.searchParams.get('data');
      if (raw) {
        const decoded = JSON.parse(atob(raw));
        const txUUID  = decoded.transaction_uuid;
        if (txUUID) {
          await pb.collection('orders').update(txUUID, { status: 'cancelled' }).catch(() => {});
          try { localStorage.removeItem(`esewa_pending_${txUUID}`); } catch (_) {}
        }
      }
    } catch (_) {}
  });
</script>

<div class="min-h-screen bg-background text-foreground">
  <Header/>
  <main class="max-w-md mx-auto px-4 py-20 flex flex-col items-center text-center">
    <div class="w-16 h-16 rounded-full flex items-center justify-center mb-6" style="background:#FEE2E2;">
      <WarningCircleIcon size={40} weight="fill" style="color:#EF4444;"/>
    </div>
    <h1 class="text-2xl font-bold mb-2">Payment Cancelled</h1>
    <p class="text-sm text-muted-foreground mb-8">
      Your payment was not completed and the order has been cancelled.<br/>
      No charges were made to your eSewa wallet.
    </p>
    <div class="flex gap-3">
      <button class="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted" on:click={() => goto('/search')}>
        Browse food
      </button>
      <button class="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90" style="background-color:#FF6B35;" on:click={() => goto('/home')}>
        Go home
      </button>
    </div>
  </main>
</div>