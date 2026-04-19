/**
 * FIESTRA Recommendation Engine v4
 *
 * Scoring is purely axis-based — no food-name hardcoding.
 * Each menuItem carries 6 semantic attributes:
 *   mealType      (multi)  Breakfast | Lunch | Dinner | Snack | Drink
 *   cuisineType   (single) Nepali | Indian | Chinese | Continental | Other
 *   dietType      (single) Veg | Non-Veg | Vegan
 *   priceTier     (single) Budget | Standard | Premium  (auto-derived if missing)
 *   spiceLevel    (single) Mild | Medium | Spicy
 *   healthTag     (single) Healthy | Regular | Fried
 *   popularityTag (single) Bestseller | Trending | Chef Special | ""
 *
 * User preference vector is built from order history on these axes.
 * Scoring = weighted sum of axis preference matches + collaborative + social boosts.
 *
 * Drop into: src/lib/recommendations.js
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
  CONTENT:      0.40,  // user axis preference match (core signal)
  COLLABORATIVE:0.30,  // "users like you also ordered"
  SOCIAL:       0.15,  // followed sellers + network orders
  POPULARITY:   0.15,  // health boost + popularity tag

  REPEAT_BONUS: 0.12,  // item ordered 3+ times by this user
  DIVERSITY_CAP: 3,    // max items from one seller in top-N
};

// Signal strengths for building the preference vector
const SIG = { repeat: 8, order: 5, like: 2, follow: 1 };

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

/** Parse mealType — stored as JSON array string or already an array */
function getMealTypes(item) {
  if (!item.mealType) return [];
  if (Array.isArray(item.mealType)) return item.mealType;
  try { return JSON.parse(item.mealType); } catch { return [item.mealType]; }
}

/** Resolve priceTier — use stored value or derive from price */
function getPriceTier(item) {
  if (item.priceTier) return item.priceTier;
  return derivePriceTier(item.price || 0);
}

/** Health score 1–5 from healthTag */
function getHealthScore(item) {
  return HEALTH_SCORE_MAP[item.healthTag] ?? 3;
}

// ─── Exported helpers (same public API as v2/v3) ───────────────────────────────
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
    _score:        Math.max(0, Math.min(1, score)),
    _reason:       reason || 'Popular on FIESTRA',
    _isHealthy:    isHealthyItem(item),
    _healthScore:  getHealthScore(item),
    _healthLabel:  getHealthLabel(item),
    _priceTier:    getPriceTier(item),
    _mealTypes:    getMealTypes(item),
  };
}

// ─── Build user preference vector from order history ──────────────────────────
// Returns per-axis frequency distributions, e.g.:
// { cuisineType: { Nepali: 0.7, Chinese: 0.3 }, dietType: { NonVeg: 1.0 }, … }
async function buildPreferenceVector(userId) {
  // Raw tallies per axis value
  const tally = {
    mealType:    {},
    cuisineType: {},
    dietType:    {},
    priceTier:   {},
    spiceLevel:  {},
    healthTag:   {},
  };
  const itemFreq    = {}; // itemId → order count (for repeat detection)
  const sellerFreq  = {}; // sellerId → affinity score

  // ── Orders (strongest signal) ──────────────────────────────────────────────
  try {
    const orders = await pb.collection('orders').getFullList({
      filter: `buyer = "${userId}"`,
      fields: 'items',
    });

    for (const order of orders) {
      for (const item of (order.items || [])) {
        const qty = item.quantity || 1;

        // Track repeat orders
        itemFreq[item.menuItemId] = (itemFreq[item.menuItemId] || 0) + qty;

        // Per-axis tallies (items in order carry their attributes)
        const attrs = {
          cuisineType: item.cuisineType,
          dietType:    item.dietType,
          priceTier:   item.priceTier || derivePriceTier(item.basePrice || 0),
          spiceLevel:  item.spiceLevel,
          healthTag:   item.healthTag,
        };
        const mealTypes = (() => {
          try {
            return Array.isArray(item.mealType)
              ? item.mealType
              : JSON.parse(item.mealType || '[]');
          } catch { return item.mealType ? [item.mealType] : []; }
        })();

        for (const [axis, val] of Object.entries(attrs)) {
          if (!val) continue;
          tally[axis][val] = (tally[axis][val] || 0) + SIG.order * qty;
        }
        for (const mt of mealTypes) {
          tally.mealType[mt] = (tally.mealType[mt] || 0) + SIG.order * qty;
        }

        if (item.sellerId)
          sellerFreq[item.sellerId] = (sellerFreq[item.sellerId] || 0) + SIG.order * qty;
      }
    }
  } catch (_) {}

  // ── Likes → seller affinity ────────────────────────────────────────────────
  try {
    const likes = await pb.collection('likes').getFullList({
      filter: `user = "${userId}"`, expand: 'post', fields: 'post,expand',
    });
    for (const like of likes) {
      const sid = like.expand?.post?.user;
      if (sid) sellerFreq[sid] = (sellerFreq[sid] || 0) + SIG.like;
    }
  } catch (_) {}

  // ── Follows → seller affinity ──────────────────────────────────────────────
  try {
    const follows = await pb.collection('follows').getFullList({
      filter: `follower = "${userId}"`, expand: 'following', fields: 'following,expand',
    });
    for (const f of follows) {
      if (f.expand?.following?.accountType === 'business') {
        sellerFreq[f.following] = (sellerFreq[f.following] || 0) + SIG.follow;
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

  // Normalise seller freq
  const sellerMax = Math.max(...Object.values(sellerFreq), 1);
  const sellerNorm = Object.fromEntries(
    Object.entries(sellerFreq).map(([k, v]) => [k, v / sellerMax])
  );

  return { axes: normalised, sellerAffinity: sellerNorm, itemFreq };
}

// ─── Score one item against a user preference vector ──────────────────────────
function scoreItemAgainstPrefs(item, prefs) {
  const { axes, sellerAffinity } = prefs;
  let score = 0;

  // Meal type — time-slot aware: current slot gets extra bonus
  const currentSlot = getCurrentSlot();
  const itemSlots   = getMealTypes(item);
  const slotPref    = axes.mealType || {};

  let mealScore = 0;
  for (const slot of itemSlots) {
    mealScore = Math.max(mealScore, slotPref[slot] || 0);
  }
  // Bonus if this item suits the current time of day
  if (itemSlots.includes(currentSlot)) mealScore = Math.min(mealScore + 0.3, 1);
  score += AXIS_WEIGHTS.mealType * mealScore;

  // Cuisine type
  const cuisinePref = (axes.cuisineType || {})[item.cuisineType] || 0;
  score += AXIS_WEIGHTS.cuisineType * cuisinePref;

  // Diet type
  const dietPref = (axes.dietType || {})[item.dietType] || 0;
  score += AXIS_WEIGHTS.dietType * dietPref;

  // Price tier
  const tier     = getPriceTier(item);
  const tierPref = (axes.priceTier || {})[tier] || 0;
  score += AXIS_WEIGHTS.priceTier * tierPref;

  // Spice level
  const spicePref = (axes.spiceLevel || {})[item.spiceLevel] || 0;
  score += AXIS_WEIGHTS.spiceLevel * spicePref;

  // Seller affinity (cross-axis bonus)
  const sellerBonus = (sellerAffinity[item.seller] || 0) * 0.10;
  score += sellerBonus;

  return Math.min(score, 1);
}

// ─── Collaborative filtering ───────────────────────────────────────────────────
// Instead of item-level cosine similarity, we compare *attribute vectors*
// between users — much more robust with sparse data.
async function collaborativeScore(currentUserId, candidates) {
  const scores = {};
  try {
    const myPrefs = await buildPreferenceVector(currentUserId);

    // Get other buyers' recent orders
    const recentOrders = await pb.collection('orders').getList(1, 300, {
      filter: `buyer != "${currentUserId}"`,
      sort: '-created',
      fields: 'buyer,items',
    });

    // Group by buyer and build their attribute tallies
    const byBuyer = {};
    for (const o of recentOrders.items) {
      if (!byBuyer[o.buyer]) byBuyer[o.buyer] = { items: new Set(), attrs: {} };
      for (const item of (o.items || [])) {
        if (item.menuItemId) byBuyer[o.buyer].items.add(item.menuItemId);

        // Tally attributes for similarity comparison
        const attrKey = [
          item.cuisineType, item.dietType,
          derivePriceTier(item.basePrice || 0),
          item.spiceLevel,
        ].filter(Boolean).join('|');
        byBuyer[o.buyer].attrs[attrKey] =
          (byBuyer[o.buyer].attrs[attrKey] || 0) + 1;
      }
    }

    // Build my attribute fingerprint for similarity
    const myFingerprint = {};
    for (const [axis, prefs] of Object.entries(myPrefs.axes)) {
      for (const [val, weight] of Object.entries(prefs)) {
        myFingerprint[`${axis}:${val}`] = weight;
      }
    }

    const myItemIds = new Set(Object.keys(myPrefs.itemFreq));

    for (const [, buyer] of Object.entries(byBuyer)) {
      // Convert their attrs to fingerprint format
      const theirFingerprint = {};
      const attrTotal = Object.values(buyer.attrs).reduce((s, v) => s + v, 0) || 1;
      for (const [k, v] of Object.entries(buyer.attrs)) {
        theirFingerprint[k] = v / attrTotal;
      }

      // Cosine similarity of attribute fingerprints
      const myKeys = Object.keys(myFingerprint);
      let dot = 0, normA = 0, normB = 0;
      for (const k of myKeys) {
        dot   += (myFingerprint[k]   || 0) * (theirFingerprint[k] || 0);
        normA += (myFingerprint[k]   || 0) ** 2;
      }
      for (const v of Object.values(theirFingerprint)) normB += v ** 2;
      const sim = normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;

      if (sim < 0.1) continue;

      // Give score to items this similar user ordered that I haven't
      for (const itemId of buyer.items) {
        if (!myItemIds.has(itemId)) {
          scores[itemId] = (scores[itemId] || 0) + sim;
        }
      }
    }
  } catch (_) {}

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
      filter: `follower = "${currentUserId}"`, fields: 'following',
    });
    const followedIds = follows.map(f => f.following);

    if (followedIds.length) {
      const networkOrders = await pb.collection('orders').getList(1, 200, {
        filter: followedIds.map(id => `buyer = "${id}"`).join(' || '),
        sort: '-created', fields: 'items',
      });
      const networkItems = new Set();
      for (const o of networkOrders.items)
        for (const item of (o.items || []))
          networkItems.add(item.menuItemId);

      for (const item of candidates)
        if (networkItems.has(item.id))
          scores[item.id] = (scores[item.id] || 0) + 0.5;
    }

    // Platform-wide order velocity (24h vs 7d)
    const h24 = new Date(Date.now() - 86400000).toISOString();
    const d7  = new Date(Date.now() - 7 * 86400000).toISOString();
    const [l24, l7d] = await Promise.all([
      pb.collection('orders').getList(1, 1, { filter: `created > "${h24}"` }),
      pb.collection('orders').getList(1, 1, { filter: `created > "${d7}"` }),
    ]);
    const velocity = l7d.totalItems > 0
      ? Math.min(l24.totalItems / (l7d.totalItems / 7 + 0.001), 3) : 1;
    for (const item of candidates)
      scores[item.id] = Math.min((scores[item.id] || 0) + (velocity - 1) * 0.08, 1);
  } catch (_) {}
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
  if (dominant.k === 'collab')  return 'Loved by people with your taste';
  if (dominant.k === 'social')  return 'Trending in your network';
  // content — be specific about which axis drove it
  if (dominant.k === 'content') {
    if (getMealTypes(item).includes(slot))  return `Perfect for ${slot.toLowerCase()}`;
    if (item.cuisineType)                   return `Based on your love of ${item.cuisineType} food`;
    if (item.dietType)                      return `Matches your ${item.dietType} preference`;
    return 'Matches your taste profile';
  }
  return 'Recommended for you';
}

// ─── Diversity: cap per seller ─────────────────────────────────────────────────
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

// ─── Cold-start (< 2 orders): popularity-based ────────────────────────────────
async function coldStartFallback(candidates, limit) {
  // Try bestsellers/trending first
  const tagged = candidates.filter(
    i => i.popularityTag === 'Bestseller' || i.popularityTag === 'Trending'
  );
  if (tagged.length >= limit) {
    return tagged.slice(0, limit).map(i => annotate(i, 0.8, 'Popular right now'));
  }

  // Fall back to order frequency
  try {
    for (const daysBack of [7, 30]) {
      const since = new Date(Date.now() - daysBack * 86400000).toISOString();
      const res = await pb.collection('orders').getList(1, 200, {
        filter: `created > "${since}"`, fields: 'items',
      });
      const pop = {};
      for (const o of res.items)
        for (const item of (o.items || []))
          pop[item.menuItemId] = (pop[item.menuItemId] || 0) + (item.quantity || 1);

      if (Object.keys(pop).length > 0) {
        const base = applyDiversity(
          candidates
            .map(i => annotate(i, (pop[i.id] || 0) / 10, 'Popular this week'))
            .sort((a, b) => b._score - a._score)
        );
        // Fill to limit with tagged items not already in list
        const baseIds = new Set(base.map(i => i.id));
        const filler  = tagged.filter(i => !baseIds.has(i.id))
                               .map(i => annotate(i, 0.5, 'Highly rated'));
        return [...base, ...filler].slice(0, limit);
      }
    }
  } catch (_) {}

  // Platform is brand new
  const slot = getCurrentSlot();
  return candidates
    .filter(i => getMealTypes(i).includes(slot))
    .concat(candidates.filter(i => !getMealTypes(i).includes(slot)))
    .slice(0, limit)
    .map(i => annotate(i, 0, 'New on FIESTRA'));
}

// ─── MAIN: getRecommendations ──────────────────────────────────────────────────
export async function getRecommendations(currentUserId, {
  limit       = 20,
  healthyOnly = false,
  dietFilter  = null,   // 'Veg' | 'Non-Veg' | 'Vegan'
  mealFilter  = null,   // 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Drink'
  budgetOnly  = false,
} = {}) {
  try {
    let items = await pb.collection('menuItems').getFullList({
      filter: 'isAvailable = true',
      sort: '-created',
      expand: 'seller',
    });
    if (!items.length) return [];

    // Hard filters
    if (healthyOnly)  items = items.filter(i => isHealthyItem(i));
    if (dietFilter)   items = items.filter(i => i.dietType === dietFilter);
    if (mealFilter)   items = items.filter(i => getMealTypes(i).includes(mealFilter));
    if (budgetOnly)   items = items.filter(i => getPriceTier(i) === 'Budget');
    if (!items.length) return [];

    const orderCount = await pb.collection('orders')
      .getList(1, 1, { filter: `buyer = "${currentUserId}"` })
      .catch(() => ({ totalItems: 0 }));

    if (orderCount.totalItems < 2) return coldStartFallback(items, limit);

    const prefs = await buildPreferenceVector(currentUserId);

    const [collab, social] = await Promise.all([
      collaborativeScore(currentUserId, items),
      socialScore(currentUserId, items),
    ]);

    const scored = items.map(item => {
      const contentSc = scoreItemAgainstPrefs(item, prefs);
      const collabSc  = collab[item.id] || 0;
      const socialSc  = social[item.id] || 0;

      let hybrid =
        W.CONTENT       * contentSc +
        W.COLLABORATIVE * collabSc  +
        W.SOCIAL        * socialSc;

      // Health boost
      const hs = getHealthScore(item);
      if (hs >= 3) hybrid += 0.08 * (hs / 5);

      // Popularity tag boost
      hybrid += (POPULARITY_BOOST[item.popularityTag] || 0);

      // Repeat order bonus
      if ((prefs.itemFreq[item.id] || 0) >= 3) hybrid += W.REPEAT_BONUS;

      return annotate(item, hybrid, buildReason(item, { contentSc, collabSc, socialSc }));
    });

    return applyDiversity(
      scored.sort((a, b) => b._score - a._score)
    ).slice(0, limit);

  } catch (err) {
    console.error('[Recommendations v4]', err);
    return [];
  }
}

// ─── Convenience exports (unchanged public API) ────────────────────────────────

export async function getHealthyPicks(userId, limit = 8) {
  return getRecommendations(userId, { limit, healthyOnly: true });
}

export async function getTrending(limit = 10) {
  try {
    // Try popularity-tagged items first (seller-marked Trending/Bestseller)
    const tagged = await pb.collection('menuItems').getFullList({
      filter: 'isAvailable = true && (popularityTag = "Trending" || popularityTag = "Bestseller")',
      expand: 'seller',
    });
    if (tagged.length >= 3) {
      return tagged.slice(0, limit).map((i, idx) =>
        annotate(i, 1 - idx / limit, i.popularityTag === 'Bestseller' ? 'Bestseller' : 'Trending')
      );
    }

    // Fall back to order frequency windows
    for (const daysBack of [1, 7, 30]) {
      const since = new Date(Date.now() - daysBack * 86400000).toISOString();
      const res = await pb.collection('orders').getList(1, 300, {
        filter: `created > "${since}"`, fields: 'items',
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
            pb.collection('menuItems').getOne(id, { expand: 'seller' }).catch(() => null)
          )
        );
        const valid = fetched.filter(i => i?.isAvailable).slice(0, limit);
        if (valid.length >= 3) {
          return valid.map((i, idx) =>
            annotate(i, 1 - idx / valid.length, 'Trending')
          );
        }
      }
    }

    // Brand-new platform
    const newest = await pb.collection('menuItems').getFullList({
      filter: 'isAvailable = true', sort: '-created', expand: 'seller',
    });
    return newest.slice(0, limit).map((i, idx) =>
      annotate(i, 1 - idx / limit, 'New on FIESTRA')
    );
  } catch (_) { return []; }
}

export async function getSimilarItems(item, limit = 6) {
  try {
    const others = await pb.collection('menuItems').getFullList({
      filter: `isAvailable = true && id != "${item.id}"`,
      expand: 'seller',
    });
    const itemSlots = getMealTypes(item);
    const slot      = getCurrentSlot();

    return others
      .map(o => {
        let score = 0;
        // Same attributes = high similarity
        if (o.cuisineType === item.cuisineType) score += 0.30;
        if (o.dietType    === item.dietType)    score += 0.20;
        if (o.spiceLevel  === item.spiceLevel)  score += 0.10;
        if (getPriceTier(o) === getPriceTier(item)) score += 0.15;
        if (getMealTypes(o).some(mt => itemSlots.includes(mt))) score += 0.15;
        if (o.seller      === item.seller)      score += 0.10;
        // Time-of-day bonus
        if (getMealTypes(o).includes(slot))     score += 0.05;

        return annotate(o, score, 'Similar item');
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);
  } catch (_) { return []; }
}

/**
 * User taste profile — for profile page / analytics card.
 * Returns what cuisine, diet, price, and spice level the user prefers.
 */
export async function getUserTasteProfile(userId) {
  const prefs = await buildPreferenceVector(userId);
  const { axes } = prefs;

  const topFor = (axis) =>
    Object.entries(axes[axis] || {})
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([val, pct]) => ({ val, pct: Math.round(pct * 100) }));

  return {
    cuisines:      topFor('cuisineType'),
    dietPreference: topFor('dietType')[0]?.val || 'Mixed',
    priceTier:     topFor('priceTier')[0]?.val  || 'Standard',
    spiceLevel:    topFor('spiceLevel')[0]?.val || 'Medium',
    mealTypes:     topFor('mealType'),
    prefersHealthy: (axes.healthTag?.Healthy || 0) > 0.4,
    slot:          getCurrentSlot(),
  };
}

/**
 * Auto-update popularityTag on bestselling items.
 * Call this from a cron job or on dashboard load (business only).
 * Updates items with ≥ threshold orders to 'Bestseller',
 * and items with high recent velocity to 'Trending'.
 */
export async function syncPopularityTags(sellerId, {
  bestsellerThreshold = 20,  // total orders ever
  trendingVelocity    = 5,   // orders in last 7 days
} = {}) {
  try {
    const items = await pb.collection('menuItems').getFullList({
      filter: `seller = "${sellerId}"`,
    });

    const now  = new Date();
    const week = new Date(now - 7 * 86400000).toISOString();

    await Promise.all(items.map(async (item) => {
      const [allTime, recent] = await Promise.all([
        pb.collection('orders').getList(1, 1, {
          filter: `items.menuItemId ?= "${item.id}"`,
        }),
        pb.collection('orders').getList(1, 1, {
          filter: `items.menuItemId ?= "${item.id}" && created > "${week}"`,
        }),
      ]);

      let tag = item.popularityTag || '';
      // Don't overwrite a Chef Special tag — that's seller-curated
      if (tag === 'Chef Special') return;

      if (allTime.totalItems >= bestsellerThreshold)  tag = 'Bestseller';
      else if (recent.totalItems >= trendingVelocity) tag = 'Trending';
      else if (tag === 'Bestseller' || tag === 'Trending') tag = '';

      if (tag !== (item.popularityTag || '')) {
        await pb.collection('menuItems').update(item.id, { popularityTag: tag });
      }
    }));
  } catch (err) {
    console.error('[syncPopularityTags]', err);
  }
}