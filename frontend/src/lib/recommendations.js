/**
 * FIESTRA Recommendation Engine v2
 * Fixed: healthy threshold lowered to 2.5, trending has multi-window fallback,
 *        cold-start items now carry _reason, all items get _healthLabel.
 * Drop into: src/lib/recommendations.js
 */

import pb from '$lib/pocketbase';

const W = {
  COLLABORATIVE: 0.40,
  CONTENT:       0.30,
  SOCIAL:        0.20,
  CONTEXTUAL:    0.10,
  HEALTHY_BOOST: 0.15,
  // Was 4 → now 2.5. Anything with healthScore ≥ 3 (Thali, Rice, Other) qualifies.
  HEALTH_THRESHOLD: 2.5,
};

const SIG = { order: 5, like: 3, comment: 2, follow: 1 };

const CATEGORY_HEALTH = {
  'Thali':    { healthScore: 5, label: 'Very balanced'  },
  'Rice':     { healthScore: 3, label: 'Light & filling' },
  'Other':    { healthScore: 3, label: 'Wholesome'       },
  'Momo':     { healthScore: 2, label: 'Popular treat'   },
  'Snacks':   { healthScore: 2, label: 'Light bite'      },
  'Drinks':   { healthScore: 2, label: 'Refreshing'      },
  'Chowmein': { healthScore: 2, label: 'Comfort food'    },
  'Desserts': { healthScore: 1, label: 'Indulgent'       },
};

const MEAL_SLOTS = {
  breakfast: ['Thali', 'Snacks', 'Drinks'],
  lunch:     ['Thali', 'Rice', 'Momo', 'Chowmein'],
  snack:     ['Snacks', 'Momo', 'Drinks', 'Chowmein'],
  dinner:    ['Thali', 'Rice', 'Momo', 'Chowmein'],
};

function getMealSlot() {
  const h = new Date().getHours();
  if (h >= 6  && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 15 && h < 18) return 'snack';
  return 'dinner';
}

// ─── Health helpers (exported so RecommendedFeed can use them too) ─────────────
export function getHealthScore(item) {
  if (item.healthScore && item.healthScore >= 1) return item.healthScore;
  return CATEGORY_HEALTH[item.category]?.healthScore ?? 2;
}

export function getHealthLabel(item) {
  const s = getHealthScore(item);
  if (s >= 4) return 'Very healthy';
  if (s >= 3) return 'Balanced';
  if (s >= 2) return 'Moderate';
  return 'Indulgent';
}

export function isHealthyItem(item) {
  return getHealthScore(item) >= W.HEALTH_THRESHOLD;
}

// ─── Annotate an item with recommendation metadata ────────────────────────────
function annotate(item, score, reason) {
  return {
    ...item,
    _score:       Math.max(0, Math.min(1, score)),
    _isHealthy:   isHealthyItem(item),
    _healthScore: getHealthScore(item),
    _healthLabel: getHealthLabel(item),
    _reason:      reason || 'Popular on FIESTRA',
  };
}

// ─── Cosine similarity on sparse vectors ─────────────────────────────────────
function cosineSim(a, b) {
  const keysA = Object.keys(a);
  if (!keysA.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (const k of keysA) {
    dot   += (a[k] || 0) * (b[k] || 0);
    normA += (a[k] || 0) ** 2;
  }
  for (const v of Object.values(b)) normB += v ** 2;
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Build taste vector for a user ───────────────────────────────────────────
async function buildTasteVector(userId) {
  const vector = {};

  try {
    const orders = await pb.collection('orders').getFullList({
      filter: `buyer = "${userId}"`, fields: 'items',
    });
    for (const order of orders) {
      for (const item of (order.items || [])) {
        if (item.menuItemId)
          vector[item.menuItemId] = (vector[item.menuItemId] || 0) + SIG.order * (item.quantity || 1);
        if (item.category)
          vector[`cat:${item.category}`] = (vector[`cat:${item.category}`] || 0) + SIG.order;
      }
    }
  } catch (_) {}

  try {
    const likes = await pb.collection('likes').getFullList({
      filter: `user = "${userId}"`, expand: 'post', fields: 'post,expand',
    });
    for (const like of likes) {
      const sid = like.expand?.post?.user;
      if (sid) vector[`seller:${sid}`] = (vector[`seller:${sid}`] || 0) + SIG.like;
    }
  } catch (_) {}

  try {
    const follows = await pb.collection('follows').getFullList({
      filter: `follower = "${userId}"`, expand: 'following', fields: 'following,expand',
    });
    for (const f of follows) {
      if (f.expand?.following?.accountType === 'business')
        vector[`seller:${f.following}`] = (vector[`seller:${f.following}`] || 0) + SIG.follow;
    }
  } catch (_) {}

  return vector;
}

// ─── Engine 1: Collaborative Filtering ───────────────────────────────────────
async function collaborativeScore(currentUserId, candidates) {
  const scores = {};
  try {
    const myVector  = await buildTasteVector(currentUserId);
    const myItemIds = new Set(Object.keys(myVector).filter(k => !k.includes(':')));

    const recentOrders = await pb.collection('orders').getList(1, 200, {
      filter: `buyer != "${currentUserId}"`, sort: '-created', fields: 'buyer,items',
    });

    const byBuyer = {};
    for (const o of recentOrders.items) {
      if (!byBuyer[o.buyer]) byBuyer[o.buyer] = {};
      for (const item of (o.items || [])) {
        if (item.menuItemId)
          byBuyer[o.buyer][item.menuItemId] = (byBuyer[o.buyer][item.menuItemId] || 0) + SIG.order;
      }
    }

    for (const [, theirVector] of Object.entries(byBuyer)) {
      const sim = cosineSim(myVector, theirVector);
      if (sim < 0.05) continue;
      for (const [itemId, s] of Object.entries(theirVector)) {
        if (!myItemIds.has(itemId))
          scores[itemId] = (scores[itemId] || 0) + sim * s;
      }
    }
  } catch (_) {}

  const max = Math.max(...Object.values(scores), 1);
  const result = {};
  for (const item of candidates) result[item.id] = (scores[item.id] || 0) / max;
  return result;
}

// ─── Engine 2: Content-Based Filtering ───────────────────────────────────────
async function contentScore(currentUserId, candidates) {
  const scores = {};
  try {
    const vector   = await buildTasteVector(currentUserId);
    const catPrefs = {};
    for (const [k, v] of Object.entries(vector))
      if (k.startsWith('cat:')) catPrefs[k.slice(4)] = v;

    const catMax    = Math.max(...Object.values(catPrefs), 1);
    const slot      = getMealSlot();
    const slotCats  = new Set(MEAL_SLOTS[slot] || []);
    const sellerEntries = Object.entries(vector).filter(([k]) => k.startsWith('seller:'));
    const sellerMax = Math.max(...sellerEntries.map(([, v]) => v), 1);

    for (const item of candidates) {
      const cat = item.category || 'Other';
      let score = ((catPrefs[cat] || 0) / catMax) * 0.6;
      if (slotCats.has(cat)) score += 0.2;
      score += ((vector[`seller:${item.seller}`] || 0) / sellerMax) * 0.2;
      scores[item.id] = Math.min(score, 1);
    }
  } catch (_) {
    for (const item of candidates) scores[item.id] = 0;
  }
  return scores;
}

// ─── Engine 3: Social + Trend ─────────────────────────────────────────────────
async function socialScore(currentUserId, candidates) {
  const scores = {};
  try {
    const follows = await pb.collection('follows').getFullList({
      filter: `follower = "${currentUserId}"`, fields: 'following',
    });
    const followedIds = follows.map(f => f.following);

    if (followedIds.length) {
      const networkOrders = await pb.collection('orders').getList(1, 100, {
        filter: `buyer ?= "${followedIds.join('" || buyer ?= "')}"`,
        sort: '-created', fields: 'items',
      });
      const networkItems = new Set();
      for (const o of networkOrders.items)
        for (const item of (o.items || [])) networkItems.add(item.menuItemId);
      for (const item of candidates)
        if (networkItems.has(item.id)) scores[item.id] = (scores[item.id] || 0) + 0.5;
    }

    const now = new Date();
    const h24 = new Date(now - 86400000).toISOString();
    const d7  = new Date(now - 7 * 86400000).toISOString();
    const [l24, l7d] = await Promise.all([
      pb.collection('likes').getList(1, 1, { filter: `created > "${h24}"` }),
      pb.collection('likes').getList(1, 1, { filter: `created > "${d7}"` }),
    ]);
    const trendFactor = l7d.totalItems > 0
      ? Math.min(l24.totalItems / (l7d.totalItems / 7), 3) : 1;
    for (const item of candidates)
      scores[item.id] = Math.min((scores[item.id] || 0) + (trendFactor - 1) * 0.1, 1);
  } catch (_) {}
  return scores;
}

// ─── Reason string ────────────────────────────────────────────────────────────
function buildReason(item, collab, content, social) {
  const top = [
    { label: 'collaborative', v: collab?.[item.id]  || 0 },
    { label: 'content',       v: content?.[item.id] || 0 },
    { label: 'social',        v: social?.[item.id]  || 0 },
  ].sort((a, b) => b.v - a.v)[0];

  if (!top || top.v < 0.05) return 'Popular on FIESTRA';
  if (top.label === 'collaborative') return 'Ordered by people with similar taste';
  if (top.label === 'content')       return `Based on your love of ${item.category || 'Nepali food'}`;
  if (top.label === 'social')        return 'Trending in your network';
  return 'Recommended for you';
}

// ─── Cold-start fallback ──────────────────────────────────────────────────────
async function coldStartFallback(candidates, limit) {
  try {
    const d7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const recentOrders = await pb.collection('orders').getList(1, 200, {
      filter: `created > "${d7}"`, fields: 'items',
    });
    const pop = {};
    for (const o of recentOrders.items)
      for (const item of (o.items || []))
        pop[item.menuItemId] = (pop[item.menuItemId] || 0) + 1;

    return candidates
      .map(i => annotate(i, (pop[i.id] || 0) / 10, 'Popular this week'))
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);
  } catch (_) {
    return candidates.slice(0, limit).map(i => annotate(i, 0, 'Featured on FIESTRA'));
  }
}

// ─── MAIN: getRecommendations ─────────────────────────────────────────────────
export async function getRecommendations(currentUserId, {
  limit = 20, healthyOnly = false,
} = {}) {
  try {
    const allItems = await pb.collection('menuItems').getFullList({
      filter: 'isAvailable = true', sort: '-created', expand: 'seller',
    });
    if (!allItems.length) return [];

    const candidates = healthyOnly ? allItems.filter(isHealthyItem) : allItems;
    if (!candidates.length) {
      // healthyOnly but nothing qualifies — return annotated full list as fallback
      return allItems.slice(0, limit).map(i => annotate(i, 0, 'Good choice'));
    }

    const orderCount = await pb.collection('orders')
      .getList(1, 1, { filter: `buyer = "${currentUserId}"` })
      .catch(() => ({ totalItems: 0 }));

    if (orderCount.totalItems < 2) return coldStartFallback(candidates, limit);

    const [collab, content, social] = await Promise.all([
      collaborativeScore(currentUserId, candidates),
      contentScore(currentUserId, candidates),
      socialScore(currentUserId, candidates),
    ]);

    return candidates
      .map(item => {
        const hybrid =
          W.COLLABORATIVE * (collab[item.id]  || 0) +
          W.CONTENT       * (content[item.id] || 0) +
          W.SOCIAL        * (social[item.id]  || 0);
        const healthBoost = isHealthyItem(item) ? W.HEALTHY_BOOST * (getHealthScore(item) / 5) : 0;
        return annotate(item, hybrid + healthBoost, buildReason(item, collab, content, social));
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);
  } catch (err) {
    console.error('[Recommendations]', err);
    return [];
  }
}

// ─── Healthy Picks ────────────────────────────────────────────────────────────
export async function getHealthyPicks(currentUserId, limit = 8) {
  return getRecommendations(currentUserId, { limit, healthyOnly: true });
}

// ─── Trending Now — tries 24h → 7d → 30d → newest items ─────────────────────
export async function getTrending(limit = 10) {
  try {
    const windows = [
      new Date(Date.now() - 86400000).toISOString(),
      new Date(Date.now() - 7 * 86400000).toISOString(),
      new Date(Date.now() - 30 * 86400000).toISOString(),
    ];

    let tally = {};
    for (const since of windows) {
      const res = await pb.collection('orders').getList(1, 200, {
        filter: `created > "${since}"`, fields: 'items',
      });
      tally = {};
      for (const o of res.items)
        for (const item of (o.items || []))
          tally[item.menuItemId] = (tally[item.menuItemId] || 0) + (item.quantity || 1);
      if (Object.keys(tally).length >= 1) break;
    }

    // No order data at all → return newest available items
    if (!Object.keys(tally).length) {
      const fallback = await pb.collection('menuItems').getFullList({
        filter: 'isAvailable = true', sort: '-created', expand: 'seller',
      });
      return fallback.slice(0, limit).map((i, idx) =>
        annotate(i, 1 - idx / limit, 'New on FIESTRA')
      );
    }

    const topIds = Object.entries(tally)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit * 2)   // fetch more in case some are deleted/unavailable
      .map(([id]) => id);

    const fetched = await Promise.all(
      topIds.map(id =>
        pb.collection('menuItems').getOne(id, { expand: 'seller' }).catch(() => null)
      )
    );
    const valid = fetched.filter(i => i && i.isAvailable).slice(0, limit);

    // Pad with newest items if we got fewer than limit
    if (valid.length < limit) {
      const existingIds = new Set(valid.map(i => i.id));
      const pad = await pb.collection('menuItems').getFullList({
        filter: 'isAvailable = true', sort: '-created', expand: 'seller',
      });
      const extras = pad.filter(i => !existingIds.has(i.id)).slice(0, limit - valid.length);
      return [
        ...valid.map((i, idx) => annotate(i, 1 - idx / limit, 'Trending')),
        ...extras.map(i => annotate(i, 0, 'New on FIESTRA')),
      ];
    }

    return valid.map((i, idx) => annotate(i, 1 - idx / limit, 'Trending'));
  } catch (_) {
    return [];
  }
}

// ─── Similar items ────────────────────────────────────────────────────────────
export async function getSimilarItems(item, limit = 6) {
  try {
    const others = await pb.collection('menuItems').getFullList({
      filter: `isAvailable = true && id != "${item.id}"`, expand: 'seller',
    });
    const slot = getMealSlot();
    return others
      .map(o => {
        let score = 0;
        if (o.category === item.category) score += 0.5;
        if (o.seller === item.seller)     score += 0.3;
        if ((MEAL_SLOTS[slot] || []).includes(o.category)) score += 0.2;
        return annotate(o, score, 'Similar item');
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);
  } catch (_) { return []; }
}

// ─── User taste profile ───────────────────────────────────────────────────────
export async function getUserTasteProfile(userId) {
  const vector = await buildTasteVector(userId);
  const catScores = {};
  for (const [k, v] of Object.entries(vector))
    if (k.startsWith('cat:')) catScores[k.slice(4)] = v;

  const total = Object.values(catScores).reduce((s, v) => s + v, 0) || 1;
  const topCategories = Object.entries(catScores)
    .map(([cat, score]) => ({ cat, pct: Math.round(score / total * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const prefersHealthy = topCategories
    .filter(c => (CATEGORY_HEALTH[c.cat]?.healthScore || 0) >= W.HEALTH_THRESHOLD)
    .reduce((s, c) => s + c.pct, 0) > 40;

  return { topCategories, prefersHealthy, slot: getMealSlot() };
}