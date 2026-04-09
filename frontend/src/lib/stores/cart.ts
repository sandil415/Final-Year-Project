import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'fiestra-cart';

export type CartItemRecord = any; // PocketBase menuItems record shape

// ── Modifier types ─────────────────────────────────────────────────────────────
export type ModifierOption = {
  id: string;
  name: string;
  price: number; // delta, can be negative
};

export type Modifier = {
  id: string;
  label: string;
  type: 'radio' | 'multi'; // radio = pick one, multi = pick any
  required: boolean;
  options: ModifierOption[];
};

// Resolved selection per modifier group: radio → single optionId | multi → optionId[]
export type ModifierSelection = Record<string, string | string[]>;

export type CartEntry = {
  item: CartItemRecord;
  quantity: number;
  // Modifier selections for this line item (keyed by modifier.id)
  selections?: ModifierSelection;
  // Effective per-unit price after applying modifier deltas
  effectivePrice?: number;
  // Human-readable summary of selected modifiers for display
  selectionLabel?: string;
};

// Keyed by a unique cart line key (itemId + selection fingerprint) → CartEntry
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

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Build a stable cart-line key from itemId + selections so two different
 *  modifier combos for the same item occupy separate lines. */
export function buildLineKey(itemId: string, selections: ModifierSelection = {}): string {
  const fingerprint = Object.entries(selections)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${Array.isArray(v) ? v.slice().sort().join('+') : v}`)
    .join('|');
  return fingerprint ? `${itemId}__${fingerprint}` : itemId;
}

/** Compute the effective per-unit price given base price + modifier selections. */
export function computeEffectivePrice(
  basePrice: number,
  modifiers: Modifier[] = [],
  selections: ModifierSelection = {}
): number {
  let total = basePrice;
  for (const mod of modifiers) {
    const sel = selections[mod.id];
    if (mod.type === 'radio' && typeof sel === 'string') {
      const opt = mod.options.find((o) => o.id === sel);
      if (opt) total += opt.price;
    } else if (mod.type === 'multi' && Array.isArray(sel)) {
      for (const sid of sel) {
        const opt = mod.options.find((o) => o.id === sid);
        if (opt) total += opt.price;
      }
    }
  }
  return Math.max(0, total);
}

/** Build a readable summary string like "Pork · Extra achar, Cheese" */
export function buildSelectionLabel(
  modifiers: Modifier[] = [],
  selections: ModifierSelection = {}
): string {
  const parts: string[] = [];
  for (const mod of modifiers) {
    const sel = selections[mod.id];
    if (!sel) continue;
    if (mod.type === 'radio' && typeof sel === 'string') {
      const opt = mod.options.find((o) => o.id === sel);
      if (opt) parts.push(opt.name);
    } else if (mod.type === 'multi' && Array.isArray(sel) && sel.length > 0) {
      const names = sel
        .map((sid) => mod.options.find((o) => o.id === sid)?.name)
        .filter(Boolean) as string[];
      if (names.length) parts.push(names.join(', '));
    }
  }
  return parts.join(' · ');
}

// ── Main Cart Store ────────────────────────────────────────────────────────────
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

// ── Per-seller checkout state ──────────────────────────────────────────────────
export const checkoutState = writable<Record<string, SellerCheckout>>({});

// ── Seller info cache ──────────────────────────────────────────────────────────
export const sellerCache = writable<Record<string, any>>({});

export function cacheSellerRecord(record: any) {
  sellerCache.update((s) => ({ ...s, [record.id]: record }));
}

// ── Derived stores ─────────────────────────────────────────────────────────────
export const cartItems = derived(cart, ($cart) => Object.values($cart));

export const cartCount = derived(cartItems, ($items) =>
  $items.reduce((sum, e) => sum + e.quantity, 0)
);

export const cartTotal = derived(cartItems, ($items) =>
  $items.reduce((sum, e) => sum + (e.effectivePrice ?? e.item?.price ?? 0) * e.quantity, 0)
);

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
      groups[sid].subtotal +=
        (entry.effectivePrice ?? entry.item?.price ?? 0) * entry.quantity;
    }

    return Object.values(groups);
  }
);

// ── Cart mutation helpers ──────────────────────────────────────────────────────

/**
 * Add an item with optional modifier selections.
 * Items with different modifier combos get separate cart lines.
 */
export function addItem(
  item: CartItemRecord,
  quantity = 1,
  selections: ModifierSelection = {},
  modifiers: Modifier[] = []
) {
  const lineKey = buildLineKey(item.id, selections);
  const effectivePrice = computeEffectivePrice(item.price ?? 0, modifiers, selections);
  const selectionLabel = buildSelectionLabel(modifiers, selections);

  cart.update((current) => {
    const existing = current[lineKey];
    const nextQty = (existing?.quantity || 0) + quantity;
    return {
      ...current,
      [lineKey]: {
        item,
        quantity: nextQty,
        selections,
        effectivePrice,
        selectionLabel: selectionLabel || undefined,
      },
    };
  });
}

export function removeItem(lineKey: string, quantity = 1) {
  if (!lineKey) return;
  cart.update((current) => {
    const existing = current[lineKey];
    if (!existing) return current;
    const nextQty = existing.quantity - quantity;
    if (nextQty <= 0) {
      const { [lineKey]: _removed, ...rest } = current;
      return rest;
    }
    return { ...current, [lineKey]: { ...existing, quantity: nextQty } };
  });
}

export function removeSellerItems(sellerId: string) {
  cart.update((current) => {
    const next: CartState = {};
    for (const [key, entry] of Object.entries(current)) {
      if (entry.item?.seller !== sellerId) next[key] = entry;
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

// ── Checkout state helpers ─────────────────────────────────────────────────────
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