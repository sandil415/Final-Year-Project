# Feature Flows

This file explains how the major product features tie together across routes, components, stores, and PocketBase collections.

## 1. Social Posting Flow

Main files:

- `frontend/src/routes/create/+page.svelte`
- `frontend/src/routes/profile/+page.svelte`
- `frontend/src/routes/profile/[username]/+page.svelte`
- `frontend/src/lib/components/PostModal.svelte`

Collections:

- `posts`
- `likes`
- `comments`
- `notifications`

Flow:

1. User creates a post from `/create`
2. Post is stored in `posts` with media and owner relation
3. Profile pages load that user's posts
4. Clicking a post opens `PostModal.svelte`
5. Modal loads post details, comments, and like status
6. Likes create/delete `likes` records
7. Comments create/delete `comments` records
8. Like/comment actions may create notification records for the post owner

Why it matters:

- the modal contains real business logic, not just presentation
- if social behavior changes, you usually need to inspect both the page and `PostModal.svelte`

## 2. Follow And Social Graph Flow

Main files:

- `frontend/src/routes/profile/+page.svelte`
- `frontend/src/routes/profile/[username]/+page.svelte`

Collections:

- `follows`
- `notifications`

Flow:

1. User visits another user's profile
2. Page checks whether a `follows` record already exists
3. Follow action creates a `follows` record
4. Unfollow action deletes the existing record
5. Following may create a notification for the target user
6. Follow data also influences search/explore ranking and recommendations

## 3. Messaging Flow

Main files:

- `frontend/src/routes/messages/+page.svelte`
- `frontend/src/routes/messages/[conversationId]/+page.svelte`
- `frontend/src/lib/Notifications.js`

Collections:

- `conversations`
- `messages`
- `users`
- `notifications`

Flow:

1. User starts a chat from a profile page
2. App finds or creates a `conversations` record with both participants
3. Inbox page lists all conversations for current user
4. Conversation page loads the thread from `messages`
5. Conversation page sets `users.activeConversation`
6. New messages create `messages` records
7. Conversation metadata is updated on `conversations`
8. App triggers message notifications when recipient is not actively inside that chat
9. Realtime subscription keeps the thread live

Important design detail:

- message notification logic currently lives mostly in frontend helper code
- the PocketBase hook file contains commented-out server-side logic, but it is not the main active path

## 4. Notifications Flow

Main files:

- `frontend/src/lib/Notifications.js`
- `frontend/src/lib/components/Header.svelte`
- `frontend/src/lib/components/NotificationsPanel.svelte`

Collections:

- `notifications`

Flow:

1. A user action triggers `createNotification()` or a specialized wrapper
2. Notification record is inserted into PocketBase
3. `Header.svelte` subscribes to notification changes
4. Header refreshes unread count
5. Notifications panel loads recent notification records on demand
6. Clicking a notification marks it as read and routes user to the relevant feature

Common notification sources:

- likes
- comments
- follows
- messages
- order status changes
- order cancellations/refunds

## 5. Menu Management Flow

Main files:

- `frontend/src/routes/business/menu/+page.svelte`
- `frontend/src/lib/components/MenuItemForm.svelte`
- `frontend/src/routes/profile/+page.svelte`
- `frontend/src/routes/profile/[username]/+page.svelte`

Collections:

- `menuItems`
- `favorites`

Flow:

1. Business user opens menu management
2. `MenuItemForm.svelte` creates or updates a `menuItems` record
3. Item includes commerce metadata such as category, availability, prep time
4. It can also include recommendation metadata:
   - meal type
   - cuisine type
   - diet type
   - price tier
   - spice level
   - health tag
   - popularity tag
   - modifiers
5. Menu items are displayed on business profile/storefront pages
6. Customers can favorite items through `favorites`

Modifier system:

- modifiers are stored with menu items
- cart entries use modifier selections to create distinct line keys
- effective price is derived from modifier deltas

## 6. Cart And Checkout Flow

Main files:

- `frontend/src/lib/stores/cart.ts`
- `frontend/src/routes/checkout/+page.svelte`
- `frontend/src/routes/checkout/esewa-success/+page.svelte`
- `frontend/src/routes/checkout/esewa-failure/+page.svelte`

Collections:

- `orders`
- `notifications`

Flow:

1. User adds menu items from a seller profile/storefront
2. `cart.ts` groups entries by seller
3. Each cart line is keyed by item ID plus modifier fingerprint
4. Checkout page initializes per-seller checkout state
5. User chooses address, notes, schedule, and payment method
6. Checkout creates an `orders` record
7. For eSewa, the order ID is reused as the payment transaction UUID
8. Success/failure pages reconcile the payment result back into PocketBase
9. Seller dashboard reacts to new order records

Cart architecture highlights:

- cart is persisted in `localStorage`
- checkout state is maintained separately by seller
- one checkout page can handle multiple sellers at once

## 7. Seller Order Operations Flow

Main files:

- `frontend/src/routes/business/dashboard/+page.svelte`
- `frontend/src/routes/dashboard/+page.svelte`

Collections:

- `orders`
- `notifications`
- `menuItems`

Flow:

1. Buyer places order
2. Seller dashboard loads all seller-owned orders
3. Seller dashboard subscribes to realtime `orders`
4. Seller advances status through:
   - pending
   - confirmed
   - preparing
   - ready
   - delivered
5. Seller can cancel orders
6. Prepaid cancellations trigger a manual refund workflow
7. Notifications are sent back to the buyer

Important design detail:

- seller workflow and buyer workflow are separate route surfaces over the same `orders` data

## 8. Analytics Flow

Main files:

- `frontend/src/routes/business/analytics/+page.svelte`
- `frontend/src/routes/business/analytics/+page.js`

Collections:

- `orders`
- `posts`
- `menuItems`
- `likes`
- `comments`

Flow:

1. Business user opens analytics page
2. Page fetches orders, posts, and menu items
3. Page computes KPIs in the browser
4. Additional like/comment stats are fetched for recent posts
5. Charts and breakdowns are drawn client-side

This is not server-precomputed analytics. It is browser-side aggregation over PocketBase records.

## 9. Recommendation Engine Flow

Main file:

- `frontend/src/lib/recommendations.js`

Supporting files:

- `frontend/src/lib/Menuattributes.js`
- `frontend/src/lib/components/RecommendedFeed.svelte`

Collections:

- `orders`
- `menuItems`
- `likes`
- `follows`

Flow:

1. Engine builds a user preference vector from past orders, likes, and follows
2. Menu items are scored across content, collaborative, social, and popularity signals
3. Results are annotated with reason/health metadata
4. Recommended feed UI renders the ranked items

Important implementation detail:

- the file is carefully written to avoid PocketBase auto-cancelling requests by generating unique `requestKey` values

## 10. Recipes And Profile Content Flow

Main files:

- `frontend/src/routes/profile/+page.svelte`
- `frontend/src/routes/profile/[username]/+page.svelte`
- `frontend/src/lib/components/RecipeEditor.svelte`
- `frontend/src/lib/components/RecipeView.svelte`

Collections:

- `recipes`

Flow:

1. User creates or edits a recipe from profile UI
2. Recipe record is stored in PocketBase
3. Profile page reloads recipe list
4. Search route can surface recipes alongside users and menu items

## 11. Business Application Flow

Main file:

- `frontend/src/routes/profile/edit/+page.svelte`

Collections:

- `business_applications`
- `users`

Flow:

1. Personal user applies for business mode
2. Form creates a `business_applications` record
3. User record may be updated with business-facing fields
4. Downstream UI branches on `accountType`

## Feature Overlap To Remember

The app is not divided into perfectly isolated modules.

A single change can affect multiple surfaces:

- profile pages touch social, messaging, recipes, menu, favorites, orders
- notifications touch messaging, social, and commerce
- menu items affect storefronts, cart, checkout, recommendations, analytics, search
- users collection drives auth, profile, seller identity, and chat presence
