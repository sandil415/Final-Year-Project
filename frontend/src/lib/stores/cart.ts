import { writable, derived } from 'svelte/store';

type CartItemRecord = any; // use PocketBase record shape for menu items

type CartEntry = {
  item: CartItemRecord;
  quantity: number;
};

const cart = writable<Record<string, CartEntry>>({});

const cartItems = derived(cart, ($cart) => Object.values($cart));

const cartCount = derived(cartItems, ($items) =>
  $items.reduce((sum, entry) => sum + entry.quantity, 0)
);

const cartTotal = derived(cartItems, ($items) =>
  $items.reduce((sum, entry) => sum + (entry.item?.price || 0) * entry.quantity, 0)
);

function addItem(item: CartItemRecord, quantity = 1) {
  if (!item?.id) return;
  cart.update((current) => {
    const existing = current[item.id];
    const nextQty = (existing?.quantity || 0) + quantity;
    return {
      ...current,
      [item.id]: {
        item,
        quantity: nextQty,
      },
    };
  });
}

function removeItem(itemId: string, quantity = 1) {
  if (!itemId) return;
  cart.update((current) => {
    const existing = current[itemId];
    if (!existing) return current;
    const nextQty = existing.quantity - quantity;
    if (nextQty <= 0) {
      const { [itemId]: _removed, ...rest } = current;
      return rest;
    }
    return {
      ...current,
      [itemId]: {
        ...existing,
        quantity: nextQty,
      },
    };
  });
}

function clearCart() {
  cart.set({});
}

export { cart, cartItems, cartCount, cartTotal, addItem, removeItem, clearCart };

