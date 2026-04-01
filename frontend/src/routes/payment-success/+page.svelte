<script>
  import pb from '$lib/pocketbase';
  import { onMount } from 'svelte';

  onMount(async () => {
    const pending = JSON.parse(localStorage.getItem('pendingOrder'));

    if (!pending) return;

    try {
      await pb.collection('orders').create({
        buyer: pending.buyer,
        seller: pending.seller,
        items: pending.items,
        totalAmount: pending.totalAmount,
        status: 'paid',
        deliveryAddress: pending.address,
        notes: pending.notes,
        transactionId: pending.transactionId
      });

      localStorage.removeItem('pendingOrder');
      alert("Payment successful & order placed!");
    } catch (err) {
      console.error(err);
    }
  });
</script>

<h1>Payment Successful</h1>