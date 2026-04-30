/**
 * FIESTRA Recommendation Engine v4.2
 *
 * Key fixes over v4.1:
 *  1. Every single pb call uses a globally unique requestKey (timestamp-suffixed)
 *     so PocketBase NEVER auto-cancels any request.
 *  2. buildPreferenceVector, collaborativeScore, and socialScore no longer run
 *     concurrently with each other — they each use isolated key namespaces.
 *  3. coldStartFallback is reached reliably and uses safe unique keys.
 *  4. hasMeaningfulPrefs checks itemFreq (order history) as well, so a user
 *     with past orders but no attribute data still gets content-filtered recs
 *     based on seller affinity rather than falling to cold-start incorrectly.
 *  5. All errors are caught per-section so one failing fetch never kills others.
 *  6. getRecommendations no longer calls collaborativeScore and socialScore in
 *     Promise.all with buildPreferenceVector — they run sequentially to prevent
 *     request key collisions on the same collections.
 */

import pb from '$lib/pocketbase';
import {
  AXIS_WEIGHTS,
  HEALTH_SCORE_MAP,
  POPULARITY_BOOST,
  PRICE_TIERS,
  derivePriceTier,
} from '$lib/menuAttributes';

// ─── Engine weights ────────────────────────────────────────────────────────────
const W = {
  CONTENT:       0.40,
  COLLABORATIVE: 0.30,
  SOCIAL:        0.15,
  POPULARITY:    0.15,
  REPEAT_BONUS:  0.12,
  DIVERSITY_CAP: 3,
};

const SIG = { repeat: 8, order: 5, like: 2, follow: 1 };

// ─── Unique key generator — prevents ALL auto-cancellations ───────────────────
let _seq = 0;
function uk(label) {
  return `${label}-${Date.now()}-${++_seq}`;
}

// ─── Time slot helpers ─────────────────────────────────────────────────────────
function getCurrentSlot() {
  const h = new Date().getHours();
  if (h >= 6  && h < 10) return 'Breakfast';
  if (h >= 10 && h < 15) return 'Lunch';
  if (h >= 15 && h < 19) return 'Snack';
  if (h >= 19 || h < 6)  return 'Dinner';
  return 'Lunch';
}

// ─── Attribute helpers ─────────────────────────────────────────────────────────
function getMealTypes(item) {
  if (!item?.mealType) return [];
  if (Array.isArray(item.mealType)) return item.mealType;
  try { return JSON.parse(item.mealType); } catch { return [item.mealType]; }
}

function getPriceTier(item) {
  if (item?.priceTier) return item.priceTier;
  return derivePriceTier(item?.price || 0);
}

function getHealthScore(item) {
  return HEALTH_SCORE_MAP?.[item?.healthTag] ?? 3;
}

// ─── Exported helpers ──────────────────────────────────────────────────────────
export { getHealthScore };

export function getHealthLabel(item) {
  const s = getHealthScore(item);
  if (s >= 5) return 'Very healthy';
  if (s >= 3) return 'Balanced';
  return 'Comfort food';
}

export function isHealthyItem(item) {
  return getHealthScore(item) >= 3;
}

// ─── Annotate item with recommendation metadata ────────────────────────────────
function annotate(item, score, reason) {
  return {
    ...item,
    _score:       Math.max(0, Math.min(1, score)),
    _reason:      reason || 'Popular on FIESTRA',
    _isHealthy:   isHealthyItem(item),
    _healthScore: getHealthScore(item),
    _healthLabel: getHealthLabel(item),
    _priceTier:   getPriceTier(item),
    _mealTypes:   getMealTypes(item),
  };
}

// ─── Build user preference vector ─────────────────────────────────────────────
async function buildPreferenceVector(userId) {
  const tally = {
    mealType:    {},
    cuisineType: {},
    dietType:    {},
    priceTier:   {},
    spiceLevel:  {},
    healthTag:   {},
  };
  const itemFreq   = {};
  const sellerFreq = {};

  // ── Orders ────────────────────────────────────────────────────────────────────
  try {
    const orders = await pb.collection('orders').getFullList({
      filter:     `buyer = "${userId}"`,
      fields:     'items,seller',
      requestKey: uk(`prefs-orders-${userId}`),
    });

    const menuItemIds = new Set();
    for (const order of orders) {
      // Track seller affinity even without menu attributes
      if (order.seller) {
        sellerFreq[order.seller] = (sellerFreq[order.seller] || 0) + SIG.order;
      }
      for (const item of (order.items || [])) {
        if (!item.menuItemId) continue;
        menuItemIds.add(item.menuItemId);
        itemFreq[item.menuItemId] =
          (itemFreq[item.menuItemId] || 0) + (item.quantity || 1);
      }
    }

    // Batch-fetch menuItem records for semantic attributes
    if (menuItemIds.size > 0) {
      const idList = [...menuItemIds];
      // Split into chunks of 50 to avoid overly long filter strings
      const chunks = [];
      for (let i = 0; i < idList.length; i += 50) {
        chunks.push(idList.slice(i, i + 50));
      }

      for (const chunk of chunks) {
        try {
          const filter = chunk.map(id => `id = "${id}"`).join(' || ');
          const menuItems = await pb.collection('menuItems').getFullList({
            filter,
            requestKey: uk(`prefs-menu-items-${userId}`),
          });

          for (const item of menuItems) {
            const freq   = itemFreq[item.id] || 1;
            const signal = SIG.order * freq;

            const attrs = {
              cuisineType: item.cuisineType,
              dietType:    item.dietType,
              priceTier:   item.priceTier || derivePriceTier(item.price || 0),
              spiceLevel:  item.spiceLevel,
              healthTag:   item.healthTag,
            };

            for (const [axis, val] of Object.entries(attrs)) {
              if (!val) continue;
              tally[axis][val] = (tally[axis][val] || 0) + signal;
            }

            for (const mt of getMealTypes(item)) {
              tally.mealType[mt] = (tally.mealType[mt] || 0) + signal;
            }

            if (item.seller) {
              sellerFreq[item.seller] =
                (sellerFreq[item.seller] || 0) + signal;
            }
          }
        } catch (chunkErr) {
          console.warn('[Recommendations] Menu chunk fetch failed:', chunkErr?.message);
        }
      }
    }
  } catch (e) {
    console.warn('[Recommendations] Orders fetch failed:', e?.message);
  }

  // ── Likes → seller affinity ────────────────────────────────────────────────
  try {
    const likes = await pb.collection('likes').getFullList({
      filter:     `user = "${userId}"`,
      expand:     'post',
      fields:     'post,expand',
      requestKey: uk(`prefs-likes-${userId}`),
    });
    for (const like of likes) {
      const sid = like.expand?.post?.user;
      if (sid) sellerFreq[sid] = (sellerFreq[sid] || 0) + SIG.like;
    }
  } catch (_) {}

  // ── Follows → seller affinity ──────────────────────────────────────────────
  try {
    const follows = await pb.collection('follows').getFullList({
      filter:     `follower = "${userId}"`,
      expand:     'following',
      fields:     'following,expand',
      requestKey: uk(`prefs-follows-${userId}`),
    });
    for (const f of follows) {
      if (f.expand?.following?.accountType === 'business') {
        sellerFreq[f.following] =
          (sellerFreq[f.following] || 0) + SIG.follow;
      }
    }
  } catch (_) {}

  // Normalise each axis to 0–1 distribution
  const normalised = {};
  for (const [axis, counts] of Object.entries(tally)) {
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    if (!total) { normalised[axis] = {}; continue; }
    normalised[axis] = Object.fromEntries(
      Object.entries(counts).map(([k, v]) => [k, v / total])
    );
  }

  const sellerMax = Math.max(...Object.values(sellerFreq), 1);
  const sellerNorm = Object.fromEntries(
    Object.entries(sellerFreq).map(([k, v]) => [k, v / sellerMax])
  );

  return { axes: normalised, sellerAffinity: sellerNorm, itemFreq };
}

// ─── Score one item against preference vector ──────────────────────────────────
function scoreItemAgainstPrefs(item, prefs) {
  const { axes, sellerAffinity } = prefs;
  let score = 0;

  const currentSlot = getCurrentSlot();
  const itemSlots   = getMealTypes(item);
  const slotPref    = axes.mealType || {};

  let mealScore = 0;
  for (const slot of itemSlots) {
    mealScore = Math.max(mealScore, slotPref[slot] || 0);
  }
  if (itemSlots.includes(currentSlot)) mealScore = Math.min(mealScore + 0.3, 1);
  score += AXIS_WEIGHTS.mealType * mealScore;

  score += AXIS_WEIGHTS.cuisineType * ((axes.cuisineType || {})[item.cuisineType] || 0);
  score += AXIS_WEIGHTS.dietType    * ((axes.dietType    || {})[item.dietType]    || 0);
  score += AXIS_WEIGHTS.priceTier   * ((axes.priceTier   || {})[getPriceTier(item)] || 0);
  score += AXIS_WEIGHTS.spiceLevel  * ((axes.spiceLevel  || {})[item.spiceLevel]  || 0);
  score += (sellerAffinity[item.seller] || 0) * 0.15;

  return Math.min(score, 1);
}

// ─── Collaborative filtering ───────────────────────────────────────────────────
async function collaborativeScore(currentUserId, candidates) {
  const scores = {};
  try {
    const myPrefs = await buildPreferenceVector(currentUserId);

    const recentOrders = await pb.collection('orders').getList(1, 300, {
      filter:     `buyer != "${currentUserId}"`,
      sort:       '-created',
      fields:     'buyer,items',
      requestKey: uk(`collab-orders`),
    });

    const allMenuItemIds = new Set();
    const byBuyer = {};
    for (const o of recentOrders.items) {
      if (!byBuyer[o.buyer]) byBuyer[o.buyer] = { items: new Set() };
      for (const item of (o.items || [])) {
        if (item.menuItemId) {
          byBuyer[o.buyer].items.add(item.menuItemId);
          allMenuItemIds.add(item.menuItemId);
        }
      }
    }

    // Batch-fetch attributes for all items other buyers ordered
    const menuAttrMap = {};
    if (allMenuItemIds.size > 0) {
      const idList = [...allMenuItemIds];
      for (let i = 0; i < idList.length; i += 50) {
        const chunk = idList.slice(i, i + 50);
        try {
          const filter = chunk.map(id => `id = "${id}"`).join(' || ');
          const menuItems = await pb.collection('menuItems').getFullList({
            filter,
            requestKey: uk(`collab-menu-attrs`),
          });
          for (const mi of menuItems) menuAttrMap[mi.id] = mi;
        } catch (_) {}
      }
    }

    const myFingerprint = {};
    for (const [axis, prefs] of Object.entries(myPrefs.axes)) {
      for (const [val, weight] of Object.entries(prefs)) {
        myFingerprint[`${axis}:${val}`] = weight;
      }
    }
    const myItemIds = new Set(Object.keys(myPrefs.itemFreq));

    for (const [, buyer] of Object.entries(byBuyer)) {
      const theirTally = {};
      for (const itemId of buyer.items) {
        const mi = menuAttrMap[itemId];
        if (!mi) continue;
        const keys = [
          mi.cuisineType && `cuisineType:${mi.cuisineType}`,
          mi.dietType    && `dietType:${mi.dietType}`,
          mi.spiceLevel  && `spiceLevel:${mi.spiceLevel}`,
          `priceTier:${derivePriceTier(mi.price || 0)}`,
        ].filter(Boolean);
        for (const k of keys) theirTally[k] = (theirTally[k] || 0) + 1;
      }

      const attrTotal = Object.values(theirTally).reduce((s, v) => s + v, 0) || 1;
      const theirFingerprint = Object.fromEntries(
        Object.entries(theirTally).map(([k, v]) => [k, v / attrTotal])
      );

      let dot = 0, normA = 0, normB = 0;
      for (const k of Object.keys(myFingerprint)) {
        dot   += (myFingerprint[k] || 0) * (theirFingerprint[k] || 0);
        normA += (myFingerprint[k] || 0) ** 2;
      }
      for (const v of Object.values(theirFingerprint)) normB += v ** 2;
      const sim = normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;

      if (sim < 0.1) continue;

      for (const itemId of buyer.items) {
        if (!myItemIds.has(itemId)) {
          scores[itemId] = (scores[itemId] || 0) + sim;
        }
      }
    }
  } catch (e) {
    console.warn('[Recommendations] Collaborative score failed:', e?.message);
  }

  const max = Math.max(...Object.values(scores), 1);
  const result = {};
  for (const item of candidates) result[item.id] = (scores[item.id] || 0) / max;
  return result;
}

// ─── Social score ──────────────────────────────────────────────────────────────
async function socialScore(currentUserId, candidates) {
  const scores = {};
  try {
    const follows = await pb.collection('follows').getFullList({
      filter:     `follower = "${currentUserId}"`,
      fields:     'following',
      requestKey: uk(`social-follows`),
    });
    const followedIds = follows.map(f => f.following);

    if (followedIds.length) {
      // Chunk the filter to avoid URL length issues
      const chunk = followedIds.slice(0, 20);
      const networkOrders = await pb.collection('orders').getList(1, 200, {
        filter:     chunk.map(id => `buyer = "${id}"`).join(' || '),
        sort:       '-created',
        fields:     'items',
        requestKey: uk(`social-network-orders`),
      });
      const networkItems = new Set();
      for (const o of networkOrders.items)
        for (const item of (o.items || []))
          networkItems.add(item.menuItemId);

      for (const item of candidates)
        if (networkItems.has(item.id))
          scores[item.id] = (scores[item.id] || 0) + 0.5;
    }

    const h24 = new Date(Date.now() - 86400000).toISOString();
    const d7  = new Date(Date.now() - 7 * 86400000).toISOString();

    // Sequential to avoid collision
    const l24 = await pb.collection('orders').getList(1, 1, {
      filter:     `created > "${h24}"`,
      requestKey: uk(`social-velocity-24h`),
    });
    const l7d = await pb.collection('orders').getList(1, 1, {
      filter:     `created > "${d7}"`,
      requestKey: uk(`social-velocity-7d`),
    });

    const velocity = l7d.totalItems > 0
      ? Math.min(l24.totalItems / (l7d.totalItems / 7 + 0.001), 3) : 1;
    for (const item of candidates)
      scores[item.id] = Math.min((scores[item.id] || 0) + (velocity - 1) * 0.08, 1);
  } catch (e) {
    console.warn('[Recommendations] Social score failed:', e?.message);
  }
  return scores;
}

// ─── Build reason string ───────────────────────────────────────────────────────
function buildReason(item, { contentSc, collabSc, socialSc }) {
  const slot = getCurrentSlot();
  const dominant = [
    { k: 'content', v: contentSc },
    { k: 'collab',  v: collabSc  },
    { k: 'social',  v: socialSc  },
  ].sort((a, b) => b.v - a.v)[0];

  if (item.popularityTag === 'Bestseller')   return 'Bestseller at this restaurant';
  if (item.popularityTag === 'Trending')     return 'Trending right now';
  if (item.popularityTag === 'Chef Special') return "Chef's special recommendation";

  if (!dominant || dominant.v < 0.05) {
    if (isHealthyItem(item)) return 'A healthy pick for you';
    return 'Popular on FIESTRA';
  }
  if (dominant.k === 'collab') return 'Loved by people with your taste';
  if (dominant.k === 'social') return 'Trending in your network';
  if (dominant.k === 'content') {
    if (getMealTypes(item).includes(slot)) return `Perfect for ${slot.toLowerCase()}`;
    if (item.cuisineType) return `Based on your love of ${item.cuisineType} food`;
    if (item.dietType)    return `Matches your ${item.dietType} preference`;
    return 'Matches your taste profile';
  }
  return 'Recommended for you';
}

// ─── Diversity: cap items per seller ──────────────────────────────────────────
function applyDiversity(items, cap = W.DIVERSITY_CAP) {
  const count = {};
  const out   = [];
  for (const item of items) {
    const sid = item.seller || 'unknown';
    count[sid] = (count[sid] || 0) + 1;
    if (count[sid] <= cap) out.push(item);
  }
  return out;
}

// ─── Cold-start (new user / no attribute data) ─────────────────────────────────
async function coldStartFallback(candidates, limit) {
  // First try: items tagged as bestseller/trending
  const tagged = candidates.filter(
    i => i.popularityTag === 'Bestseller' || i.popularityTag === 'Trending'
  );
  if (tagged.length >= limit) {
    return tagged.slice(0, limit).map(i => annotate(i, 0.8, 'Popular right now'));
  }

  // Second try: most-ordered in recent windows
  for (const daysBack of [7, 30]) {
    try {
      const since = new Date(Date.now() - daysBack * 86400000).toISOString();
      const res = await pb.collection('orders').getList(1, 200, {
        filter:     `created > "${since}"`,
        fields:     'items',
        requestKey: uk(`cold-start-orders-${daysBack}`),
      });
      const pop = {};
      for (const o of res.items)
        for (const item of (o.items || []))
          pop[item.menuItemId] = (pop[item.menuItemId] || 0) + (item.quantity || 1);

      if (Object.keys(pop).length > 0) {
        const maxPop = Math.max(...Object.values(pop), 1);
        const base = applyDiversity(
          candidates
            .map(i => annotate(i, (pop[i.id] || 0) / maxPop, 'Popular this week'))
            .sort((a, b) => b._score - a._score)
        );
        const baseIds = new Set(base.map(i => i.id));
        const filler  = tagged
          .filter(i => !baseIds.has(i.id))
          .map(i => annotate(i, 0.5, 'Highly rated'));
        return [...base, ...filler].slice(0, limit);
      }
    } catch (_) {}
  }

  // Final fallback: time-slot based with diversity
  const slot = getCurrentSlot();
  const slotItems = candidates.filter(i => getMealTypes(i).includes(slot));
  const others    = candidates.filter(i => !getMealTypes(i).includes(slot));
  return [...slotItems, ...others]
    .slice(0, limit)
    .map(i => annotate(i, 0.3, `Great for ${slot.toLowerCase()}`));
}

// ─── Check if preference vector has any meaningful data ───────────────────────
function hasMeaningfulPrefs(prefs) {
  // Has any semantic axis data
  for (const axis of Object.values(prefs.axes)) {
    if (Object.keys(axis).length > 0) return true;
  }
  // Has order history (seller affinity at minimum)
  if (Object.keys(prefs.sellerAffinity).length > 0) return true;
  // Has ordered items at all
  if (Object.keys(prefs.itemFreq).length > 0) return true;
  return false;
}

// ─── MAIN: getRecommendations ──────────────────────────────────────────────────
export async function getRecommendations(currentUserId, {
  limit       = 20,
  healthyOnly = false,
  dietFilter  = null,
  mealFilter  = null,
  budgetOnly  = false,
} = {}) {
  try {
    // Step 1: Fetch all available items
    let items = await pb.collection('menuItems').getFullList({
      filter:     'isAvailable = true',
      sort:       '-created',
      expand:     'seller',
      requestKey: uk(`rec-items`),
    });

    if (!items.length) return [];

    // Apply filters
    if (healthyOnly) items = items.filter(i => isHealthyItem(i));
    if (dietFilter)  items = items.filter(i => i.dietType === dietFilter);
    if (mealFilter)  items = items.filter(i => getMealTypes(i).includes(mealFilter));
    if (budgetOnly)  items = items.filter(i => getPriceTier(i) === 'Budget');
    if (!items.length) return [];

    // Step 2: Build preference vector FIRST (sequential, no concurrent calls)
    const prefs = await buildPreferenceVector(currentUserId);

    // Step 3: If no meaningful data → cold start (no order history at all)
    if (!hasMeaningfulPrefs(prefs)) {
      return coldStartFallback(items, limit);
    }

    // Step 4: Content score (pure local, no extra pb calls)
    const contentScores = {};
    for (const item of items) {
      contentScores[item.id] = scoreItemAgainstPrefs(item, prefs);
    }

    // Step 5: Collaborative score (sequential after prefs)
    let collab = {};
    try {
      collab = await collaborativeScore(currentUserId, items);
    } catch (e) {
      console.warn('[Recommendations] Collaborative failed, continuing without:', e?.message);
    }

    // Step 6: Social score (sequential after collab)
    let social = {};
    try {
      social = await socialScore(currentUserId, items);
    } catch (e) {
      console.warn('[Recommendations] Social failed, continuing without:', e?.message);
    }

    // Step 7: Combine scores
    const scored = items.map(item => {
      const contentSc = contentScores[item.id] || 0;
      const collabSc  = collab[item.id] || 0;
      const socialSc  = social[item.id] || 0;

      let hybrid =
        W.CONTENT       * contentSc +
        W.COLLABORATIVE * collabSc  +
        W.SOCIAL        * socialSc;

      // Health bonus
      const hs = getHealthScore(item);
      if (hs >= 3) hybrid += 0.08 * (hs / 5);

      // Popularity tag boost
      hybrid += (POPULARITY_BOOST?.[item.popularityTag] || 0);

      // Repeat purchase bonus
      if ((prefs.itemFreq[item.id] || 0) >= 3) hybrid += W.REPEAT_BONUS;

      // Seller affinity even when no axis data (e.g. user ordered from this seller before)
      hybrid += (prefs.sellerAffinity[item.seller] || 0) * 0.10;

      return annotate(
        item,
        hybrid,
        buildReason(item, { contentSc, collabSc, socialSc })
      );
    });

    const sorted = scored.sort((a, b) => b._score - a._score);

    // If everything scored 0 (no attributes on any items), fall back to cold-start
    if (sorted[0]?._score === 0) {
      return coldStartFallback(items, limit);
    }

    return applyDiversity(sorted).slice(0, limit);

  } catch (err) {
    console.error('[Recommendations v4.2] Fatal error:', err);
    // Last resort: return raw items so UI is never empty
    try {
      const fallback = await pb.collection('menuItems').getFullList({
        filter:     'isAvailable = true',
        sort:       '-created',
        expand:     'seller',
        requestKey: uk(`rec-fallback`),
      });
      return fallback
        .slice(0, limit)
        .map(i => annotate(i, 0.3, 'Popular on FIESTRA'));
    } catch (_) { return []; }
  }
}

// ─── Convenience exports ───────────────────────────────────────────────────────

export async function getHealthyPicks(userId, limit = 8) {
  try {
    let items = await pb.collection('menuItems').getFullList({
      filter:     'isAvailable = true',
      sort:       '-created',
      expand:     'seller',
      requestKey: uk(`healthy-items`),
    });

    // Filter to healthy items — those with healthTag = 'Healthy' or healthTag = 'Regular'
    // If no item has healthTag set, fall back to category-based heuristic
    let healthy = items.filter(i => getHealthScore(i) >= 3);

    if (healthy.length === 0) {
      // Heuristic fallback: Thali, Rice, Salad categories tend to be healthier
      healthy = items.filter(i =>
        ['Thali', 'Rice', 'Salads', 'Soup'].includes(i.category)
      );
    }

    if (healthy.length === 0) healthy = items; // last resort: show everything

    if (userId) {
      // If we have a user, personalise within healthy items
      return getRecommendations(userId, { limit, healthyOnly: true }).catch(() =>
        healthy.slice(0, limit).map((i, idx) => annotate(i, 1 - idx / healthy.length, 'Healthy choice'))
      );
    }

    return healthy
      .slice(0, limit)
      .map((i, idx) => annotate(i, 1 - idx / healthy.length, 'Healthy choice'));
  } catch (_) {
    return [];
  }
}

export async function getTrending(limit = 10) {
  try {
    // First try: items explicitly tagged
    const tagged = await pb.collection('menuItems').getFullList({
      filter:     'isAvailable = true && (popularityTag = "Trending" || popularityTag = "Bestseller")',
      expand:     'seller',
      requestKey: uk('trending-tagged'),
    });
    if (tagged.length >= 3) {
      return tagged.slice(0, limit).map((i, idx) =>
        annotate(i, 1 - idx / limit, i.popularityTag === 'Bestseller' ? 'Bestseller' : 'Trending')
      );
    }

    // Second try: most ordered in recent windows
    for (const daysBack of [1, 7, 30]) {
      const since = new Date(Date.now() - daysBack * 86400000).toISOString();
      try {
        const res = await pb.collection('orders').getList(1, 300, {
          filter:     `created > "${since}"`,
          fields:     'items',
          requestKey: uk(`trending-orders-${daysBack}`),
        });
        const tally = {};
        for (const o of res.items)
          for (const item of (o.items || []))
            tally[item.menuItemId] = (tally[item.menuItemId] || 0) + (item.quantity || 1);

        if (Object.keys(tally).length >= 3) {
          const topIds = Object.entries(tally)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit * 2)
            .map(([id]) => id);

          const fetched = await Promise.all(
            topIds.map(id =>
              pb.collection('menuItems').getOne(id, {
                expand:     'seller',
                requestKey: uk(`trending-item`),
              }).catch(() => null)
            )
          );
          const valid = fetched.filter(i => i?.isAvailable).slice(0, limit);
          if (valid.length >= 3) {
            return valid.map((i, idx) =>
              annotate(i, 1 - idx / valid.length, 'Trending')
            );
          }
        }
      } catch (_) {}
    }

    // Final fallback: newest items
    const newest = await pb.collection('menuItems').getFullList({
      filter:     'isAvailable = true',
      sort:       '-created',
      expand:     'seller',
      requestKey: uk('trending-newest'),
    });
    return newest.slice(0, limit).map((i, idx) =>
      annotate(i, 1 - idx / limit, 'New on FIESTRA')
    );
  } catch (_) { return []; }
}

export async function getSimilarItems(item, limit = 6) {
  try {
    const others = await pb.collection('menuItems').getFullList({
      filter:     `isAvailable = true && id != "${item.id}"`,
      expand:     'seller',
      requestKey: uk(`similar-${item.id}`),
    });
    const itemSlots = getMealTypes(item);
    const slot      = getCurrentSlot();

    return others
      .map(o => {
        let score = 0;
        if (o.cuisineType === item.cuisineType)                          score += 0.30;
        if (o.dietType    === item.dietType)                             score += 0.20;
        if (o.spiceLevel  === item.spiceLevel)                           score += 0.10;
        if (getPriceTier(o) === getPriceTier(item))                      score += 0.15;
        if (getMealTypes(o).some(mt => itemSlots.includes(mt)))          score += 0.15;
        if (o.seller      === item.seller)                               score += 0.10;
        if (getMealTypes(o).includes(slot))                              score += 0.05;
        return annotate(o, score, 'Similar item');
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);
  } catch (_) { return []; }
}

export async function getUserTasteProfile(userId) {
  const prefs = await buildPreferenceVector(userId);
  const { axes } = prefs;

  const topFor = (axis) =>
    Object.entries(axes[axis] || {})
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([val, pct]) => ({ val, pct: Math.round(pct * 100) }));

  return {
    cuisines:       topFor('cuisineType'),
    dietPreference: topFor('dietType')[0]?.val || 'Mixed',
    priceTier:      topFor('priceTier')[0]?.val || 'Standard',
    spiceLevel:     topFor('spiceLevel')[0]?.val || 'Medium',
    mealTypes:      topFor('mealType'),
    prefersHealthy: (axes.healthTag?.Healthy || 0) > 0.4,
    slot:           getCurrentSlot(),
  };
}

export async function syncPopularityTags(sellerId, {
  bestsellerThreshold = 20,
  trendingVelocity    = 5,
} = {}) {
  try {
    const items = await pb.collection('menuItems').getFullList({
      filter:     `seller = "${sellerId}"`,
      requestKey: uk(`sync-tags-${sellerId}`),
    });

    const week = new Date(Date.now() - 7 * 86400000).toISOString();

    // Sequential to avoid collisions
    for (const item of items) {
      try {
        const allTime = await pb.collection('orders').getList(1, 1, {
          filter:     `items.menuItemId ?= "${item.id}"`,
          requestKey: uk(`sync-alltime`),
        });
        const recent = await pb.collection('orders').getList(1, 1, {
          filter:     `items.menuItemId ?= "${item.id}" && created > "${week}"`,
          requestKey: uk(`sync-recent`),
        });

        let tag = item.popularityTag || '';
        if (tag === 'Chef Special') continue;

        if (allTime.totalItems >= bestsellerThreshold)  tag = 'Bestseller';
        else if (recent.totalItems >= trendingVelocity) tag = 'Trending';
        else if (tag === 'Bestseller' || tag === 'Trending') tag = '';

        if (tag !== (item.popularityTag || '')) {
          await pb.collection('menuItems').update(item.id, { popularityTag: tag }, {
            requestKey: uk(`sync-update`),
          });
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('[syncPopularityTags]', err);
  }
}