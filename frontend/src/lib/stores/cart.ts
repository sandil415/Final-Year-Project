import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'fiestra-cart';

export type CartItemRecord = any; // PocketBase menuItems record shape

export type CartEntry = {
  item: CartItemRecord;
  quantity: number;
};

// Keyed by itemId → CartEntry
export type CartState = Record<string, CartEntry>;

// Per-seller checkout state
export type SellerCheckout = {
  address: string;
  lat: number | null;
  lng: number | null;
  notes: string;
  placing: boolean;
  success: boolean;
};

// Grouped view: one entry per seller
export type SellerGroup = {
  sellerId: string;
  sellerName: string;
  sellerRecord: any;
  entries: CartEntry[];
  subtotal: number;
};

// Main Cart Store
const initialCart: CartState = browser
  ? (() => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      } catch {
        return {};
      }
    })()
  : {};

export const cart = writable<CartState>(initialCart);

cart.subscribe((value) => {
  if (browser) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }
});

// ─── Per-seller checkout state (address, notes, placing, success) ──────────────
// Keyed by sellerId
export const checkoutState = writable<Record<string, SellerCheckout>>({});

// ─── Seller info cache ─────────────────────────────────────────────────────────
// Populated externally when a menu is loaded. Keyed by sellerId → user record.
export const sellerCache = writable<Record<string, any>>({});

export function cacheSellerRecord(record: any) {
  sellerCache.update((s) => ({ ...s, [record.id]: record }));
}

// Derived stores 
export const cartItems = derived(cart, ($cart) => Object.values($cart));

export const cartCount = derived(cartItems, ($items) =>
  $items.reduce((sum, e) => sum + e.quantity, 0)
);

export const cartTotal = derived(cartItems, ($items) =>
  $items.reduce((sum, e) => sum + (e.item?.price || 0) * e.quantity, 0)
);

// Grouped by seller — merges sellerCache for display info
export const cartBySeller = derived(
  [cart, sellerCache],
  ([$cart, $sellerCache]): SellerGroup[] => {
    const groups: Record<string, SellerGroup> = {};

    for (const entry of Object.values($cart)) {
      const sid = entry.item?.seller;
      if (!sid) continue;

      if (!groups[sid]) {
        const rec = $sellerCache[sid];
        groups[sid] = {
          sellerId: sid,
          sellerName: rec?.businessName || rec?.username || sid,
          sellerRecord: rec || null,
          entries: [],
          subtotal: 0,
        };
      }

      groups[sid].entries.push(entry);
      groups[sid].subtotal += (entry.item?.price || 0) * entry.quantity;
    }

    return Object.values(groups);
  }
);

// Cart mutation helpers 
export function addItem(item: CartItemRecord, quantity = 1) {
  cart.update((current) => {
    const existing = current[item.id];
    const nextQty = (existing?.quantity || 0) + quantity;
    return { ...current, [item.id]: { item, quantity: nextQty } };
  });
}

export function removeItem(itemId: string, quantity = 1) {
  if (!itemId) return;
  cart.update((current) => {
    const existing = current[itemId];
    if (!existing) return current;
    const nextQty = existing.quantity - quantity;
    if (nextQty <= 0) {
      const { [itemId]: _removed, ...rest } = current;
      return rest;
    }
    return { ...current, [itemId]: { ...existing, quantity: nextQty } };
  });
}

export function removeSellerItems(sellerId: string) {
  cart.update((current) => {
    const next: CartState = {};
    for (const [id, entry] of Object.entries(current)) {
      if (entry.item?.seller !== sellerId) next[id] = entry;
    }
    return next;
  });
  checkoutState.update((s) => {
    const { [sellerId]: _removed, ...rest } = s;
    return rest;
  });
}

export function clearCart() {
  cart.set({});
  checkoutState.set({});
}

// Checkout state helpers 
const defaultCheckout = (): SellerCheckout => ({
  address: '',
  lat: null,
  lng: null,
  notes: '',
  placing: false,
  success: false,
});

export function initCheckout(sellerId: string) {
  checkoutState.update((s) => {
    if (s[sellerId]) return s;
    return { ...s, [sellerId]: defaultCheckout() };
  });
}

export function setCheckoutField<K extends keyof SellerCheckout>(
  sellerId: string,
  field: K,
  value: SellerCheckout[K]
) {
  checkoutState.update((s) => ({
    ...s,
    [sellerId]: { ...(s[sellerId] || defaultCheckout()), [field]: value },
  }));
}