<!-- src/routes/checkout/esewa-success/+page.svelte -->
<!-- 
  eSewa redirects here with query params:
  ?data=<base64 encoded JSON>
  
  The JSON contains: transaction_code, status, total_amount,
  transaction_uuid (= our orderId), product_code, signed_field_names, signature
  
  We decode, verify status === 'COMPLETE', then update the order in PocketBase.
  The cart was already cleared before the eSewa redirect, so nothing to clear here.
-->
<script>
  import pb from '$lib/pocketbase';
  import { onMount }  from 'svelte';
  import { goto }     from '$app/navigation';
  import { page }     from '$app/stores';
  import { CheckCircleIcon, WarningCircleIcon, SpinnerIcon } from 'phosphor-svelte';
  import Header from '$lib/components/Header.svelte';

  let status  = 'processing'; // 'processing' | 'success' | 'failed'
  let message = '';
  let orderId = '';

  onMount(async () => {
    try {
      // eSewa sends a base64-encoded JSON string as the `data` query param
      const raw = $page.url.searchParams.get('data');
      if (!raw) {
        status  = 'failed';
        message = 'No payment data received from eSewa.';
        return;
      }

      // Decode base64 → JSON
      const decoded     = JSON.parse(atob(raw));
      const txStatus    = decoded.status;           // 'COMPLETE' | 'PENDING' | 'FULL_REFUND' etc.
      const txUUID      = decoded.transaction_uuid; // This is our orderId
      const txCode      = decoded.transaction_code; // eSewa's own transaction reference

      orderId = txUUID;

      if (txStatus !== 'COMPLETE') {
        status  = 'failed';
        message = `Payment not completed (status: ${txStatus}). Your order has been cancelled.`;
        // Mark the order as cancelled in PocketBase
        await pb.collection('orders').update(txUUID, { status: 'cancelled' }).catch(() => {});
        return;
      }

      // Update the order to confirmed and store eSewa's transaction code
      await pb.collection('orders').update(txUUID, {
        status:          'confirmed',
        esewaTransactionCode: txCode,
        paymentMethod:   'esewa',
      });

      // Clean up the localStorage marker
      try { localStorage.removeItem(`esewa_pending_${txUUID}`); } catch (_) {}

      status  = 'success';
      message = 'Payment confirmed! Your order is now being prepared.';

      // Redirect after a moment
      setTimeout(() => goto('/home'), 3000);

    } catch (err) {
      console.error('eSewa success handler error:', err);
      status  = 'failed';
      message = 'There was a problem confirming your payment. Please contact support with your eSewa receipt.';
    }
  });
</script>

<div class="min-h-screen bg-background text-foreground">
  <Header/>
  <main class="max-w-md mx-auto px-4 py-20 flex flex-col items-center text-center">

    {#if status === 'processing'}
      <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6 animate-spin" style="border:3px solid #FF6B35;border-top-color:transparent;"></div>
      <p class="text-lg font-semibold mb-2">Confirming payment…</p>
      <p class="text-sm text-muted-foreground">Please wait while we verify your eSewa payment.</p>

    {:else if status === 'success'}
      <div class="w-16 h-16 rounded-full flex items-center justify-center mb-6" style="background:#6EC74720;">
        <CheckCircleIcon size={40} weight="fill" style="color:#6EC747;"/>
      </div>
      <h1 class="text-2xl font-bold mb-2">Payment Successful!</h1>
      <p class="text-sm text-muted-foreground mb-6">{message}</p>
      {#if orderId}
        <p class="text-xs text-muted-foreground mb-8">Order ID: <code class="bg-muted px-1 rounded">{orderId}</code></p>
      {/if}
      <p class="text-xs text-muted-foreground">Redirecting you home in a moment…</p>

    {:else}
      <div class="w-16 h-16 rounded-full flex items-center justify-center mb-6" style="background:#FEE2E2;">
        <WarningCircleIcon size={40} weight="fill" style="color:#EF4444;"/>
      </div>
      <h1 class="text-2xl font-bold mb-2">Payment Issue</h1>
      <p class="text-sm text-muted-foreground mb-8">{message}</p>
      <div class="flex gap-3">
        <button class="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted" on:click={() => goto('/checkout')}>
          Try again
        </button>
        <button class="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90" style="background-color:#FF6B35;" on:click={() => goto('/home')}>
          Go home
        </button>
      </div>
    {/if}

  </main>
</div>

<style>
  @keyframes spin { to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }
</style>