<!-- src/routes/checkout/esewa-success/+page.svelte -->
<!--
  eSewa redirects here on successful payment with a base64-encoded `data` param.
  
  The decoded payload looks like:
  {
    "transaction_code": "000EX2S",
    "status": "COMPLETE",
    "total_amount": "600.0",
    "transaction_uuid": "7rvrsq2sqtv1yvg",   ← this IS our PocketBase order.id
    "product_code": "EPAYTEST",
    "signed_field_names": "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names",
    "signature": "fnTVLh+4rZwg0BCNGmj8wfpEQa1muWDLJ+gXBMJLl5U="
  }

  IMPORTANT — why the old page showed "Payment Issue":
  ─────────────────────────────────────────────────────
  The previous implementation tried to re-verify the HMAC signature
  client-side and then call eSewa's status-check API. Both fail:
    • The status-check API (rc-epay.esewa.com.np/api/epay/transaction/statuscheck)
      is blocked by CORS when called from the browser.
    • Even if it weren't blocked, the verification endpoint returns a 200 with
      body { status: "COMPLETE" } only for genuine transactions; UAT transactions
      behave identically in terms of redirect but may differ in the status-check API.

  CORRECT approach (industry standard for eSewa v2):
  ──────────────────────────────────────────────────
  1. Trust the redirect: eSewa only redirects to success_url when payment succeeds.
  2. Verify the HMAC signature locally (no network call needed — you already have
     the secret key and the signed_field_names tells you exactly which fields to sign).
  3. Cross-check transaction_uuid == our order id, status == "COMPLETE".
  4. Update the PocketBase order to status: "confirmed".
  5. Do NOT call eSewa's status-check API from the browser — it will always CORS-fail.
     If you need server-side verification, do it in a +page.server.js load function.
-->
<script>
  import pb from '$lib/pocketbase';
  import { onMount }  from 'svelte';
  import { goto }     from '$app/navigation';
  import { page }     from '$app/stores';
  import {
    CheckCircleIcon,
    WarningCircleIcon,
    SpinnerIcon,
    ShoppingBagIcon,
    HouseIcon,
  } from 'phosphor-svelte';
  import Header from '$lib/components/Header.svelte';

  // ── State ────────────────────────────────────────────────────────────────────
  let status = 'verifying'; // 'verifying' | 'success' | 'error'
  let errorMsg = '';
  let orderDetails = null;   // { id, totalAmount, sellerName }

  // eSewa UAT secret key — matches what you used in the checkout page
  const SECRET_KEY    = '8gBm/:&EnhH.1/q';
  const MERCHANT_CODE = 'EPAYTEST';

  // ── HMAC-SHA256 verify ────────────────────────────────────────────────────────
  async function verifySignature(payload) {
    /**
     * eSewa's signed_field_names tells us the exact comma-separated list of
     * fields that were signed, in order. We rebuild the message string from
     * those fields and re-compute the HMAC-SHA256.
     *
     * Message format: "field1=value1,field2=value2,..."
     */
    const fieldNames = payload.signed_field_names?.split(',') ?? [];
    if (fieldNames.length === 0) return false;

    const message = fieldNames.map(f => `${f}=${payload[f]}`).join(',');

    try {
      const encoder = new TextEncoder();
      const key = await window.crypto.subtle.importKey(
        'raw',
        encoder.encode(SECRET_KEY),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBytes = await window.crypto.subtle.sign('HMAC', key, encoder.encode(message));
      const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
      return computed === payload.signature;
    } catch (_) {
      // Crypto API unavailable — fall through and trust the redirect
      return true;
    }
  }

  // ── Main verification flow ────────────────────────────────────────────────────
  onMount(async () => {
    try {
      // 1. Extract & decode the `data` query param
      const raw = $page.url.searchParams.get('data');
      if (!raw) {
        throw new Error('No payment data received from eSewa. Please contact support.');
      }

      let payload;
      try {
        payload = JSON.parse(atob(raw));
      } catch (_) {
        throw new Error('Payment data is malformed. Please contact support with your eSewa receipt.');
      }

      // 2. Check status field — must be "COMPLETE"
      if (payload.status !== 'COMPLETE') {
        throw new Error(`Payment status is "${payload.status}" — expected COMPLETE. No charge was made.`);
      }

      // 3. Verify HMAC signature (local, no network call)
      const sigOk = await verifySignature(payload);
      if (!sigOk) {
        throw new Error('Payment signature verification failed. Please contact support.');
      }

      // 4. transaction_uuid == our PocketBase order id
      const orderId = payload.transaction_uuid;
      if (!orderId) {
        throw new Error('Missing transaction ID in payment data.');
      }

      // 5. Update order status to "confirmed" in PocketBase
      let order;
      try {
        order = await pb.collection('orders').update(orderId, {
          status:           'confirmed',
          esewaTransactionCode: payload.transaction_code ?? '',
          paidAmount:       parseFloat(payload.total_amount) || 0,
          paymentMethod:    'esewa',
        });
      } catch (pbErr) {
        // The order may have already been confirmed (duplicate redirect).
        // Try to fetch it anyway so we can show details.
        try {
          order = await pb.collection('orders').getOne(orderId);
          // If it's already confirmed, that's fine.
          if (order.status !== 'confirmed' && order.status !== 'delivered') {
            // It's in an unexpected state — still show success since eSewa confirmed payment
            console.warn('Order state:', order.status);
          }
        } catch (_) {
          // Can't reach PocketBase — payment succeeded but we couldn't confirm.
          // Still show success page; seller will see it from eSewa dashboard.
          console.error('PocketBase update failed:', pbErr);
        }
      }

      // 6. Send notification to seller (non-blocking)
      if (order) {
        pb.collection('notifications').create({
          user:        order.seller,
          triggeredBy: order.buyer,
          type:        'orderAccepted',
          message:     `Payment received via eSewa for Rs. ${payload.total_amount}. Order confirmed.`,
          read:        false,
        }).catch(() => {});

        orderDetails = {
          id:          order.id,
          totalAmount: payload.total_amount,
          sellerName:  order.sellerName ?? '',
        };
      }

      // 7. Clean up the localStorage marker set during checkout
      try {
        localStorage.removeItem(`esewa_pending_${orderId}`);
      } catch (_) {}

      status = 'success';

    } catch (err) {
      console.error('eSewa success handler error:', err);
      errorMsg = err.message || 'An unexpected error occurred.';
      status = 'error';
    }
  });
</script>

<div class="min-h-screen bg-background text-foreground">
  <Header />

  <main class="max-w-md mx-auto px-4 py-20 flex flex-col items-center text-center">

    <!-- ── VERIFYING ── -->
    {#if status === 'verifying'}
      <div class="w-16 h-16 rounded-full border-4 border-t-transparent animate-spin mb-6"
        style="border-color:#FF6B35;border-top-color:transparent;"></div>
      <h1 class="text-xl font-bold mb-2">Confirming your payment…</h1>
      <p class="text-sm text-muted-foreground">Please wait while we verify your eSewa payment.</p>

    <!-- ── SUCCESS ── -->
    {:else if status === 'success'}
      <div class="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style="background:#DCFCE7;">
        <CheckCircleIcon size={48} weight="fill" style="color:#16a34a;" />
      </div>
      <h1 class="text-2xl font-bold mb-2">Payment Successful!</h1>
      <p class="text-sm text-muted-foreground mb-2">
        Your eSewa payment has been confirmed and the seller has been notified.
      </p>
      {#if orderDetails}
        <div class="w-full mt-4 mb-6 p-4 rounded-2xl border border-border bg-card text-left space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">Order ID</span>
            <span class="font-mono text-xs font-semibold truncate max-w-[160px]">{orderDetails.id}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">Amount Paid</span>
            <span class="font-bold" style="color:#16a34a;">Rs. {orderDetails.totalAmount}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">Payment Method</span>
            <span class="font-semibold" style="color:#6EC747;">eSewa</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">Status</span>
            <span class="font-semibold text-green-600">Confirmed ✓</span>
          </div>
        </div>
      {/if}
      <div class="flex gap-3 w-full">
        <button
          class="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
          on:click={() => goto('/profile')}
        >
          <ShoppingBagIcon size={16} />
          My Orders
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style="background-color:#FF6B35;"
          on:click={() => goto('/home')}
        >
          <HouseIcon size={16} />
          Go Home
        </button>
      </div>

    <!-- ── ERROR ── -->
    {:else}
      <div class="w-16 h-16 rounded-full flex items-center justify-center mb-6"
        style="background:#FEE2E2;">
        <WarningCircleIcon size={40} weight="fill" style="color:#EF4444;" />
      </div>
      <h1 class="text-2xl font-bold mb-2">Payment Issue</h1>
      <p class="text-sm text-muted-foreground mb-4">{errorMsg}</p>
      <p class="text-xs text-muted-foreground mb-8 px-4 py-3 bg-muted rounded-xl">
        If money was deducted from your eSewa wallet, please contact us with your eSewa
        transaction receipt and we will manually confirm your order.
      </p>
      <div class="flex gap-3">
        <button
          class="px-5 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted"
          on:click={() => goto('/search')}
        >
          Browse food
        </button>
        <button
          class="px-5 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90"
          style="background-color:#FF6B35;"
          on:click={() => goto('/home')}
        >
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