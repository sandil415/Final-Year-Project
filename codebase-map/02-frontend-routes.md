# Frontend Routes

This file maps the SvelteKit route tree to the collections and features each page owns.

## Route Philosophy

Most routes are "feature pages" rather than thin wrappers.

A route usually does all of the following itself:

- validate auth
- load PocketBase data
- hold page-local state
- call create/update/delete operations
- render the main feature UI

That means onboarding is easier if you think of each page as a mini feature module.

## Root And Entry Routes

## `/`

Files:

- `frontend/src/routes/+page.ts`
- `frontend/src/routes/+page.svelte`

Purpose:

- Redirects users to `/auth/login`

Notes:

- `+page.ts` throws a redirect on load
- `+page.svelte` also calls `goto('/auth/login')`

## `/home`

Files:

- `frontend/src/routes/home/+page.js`
- `frontend/src/routes/home/+page.svelte`

Purpose:

- Main post-login landing page
- Marketing-style discovery surface
- Shows recent post images and recommendation content

Collections touched:

- `posts`
- auth store from `users`

Shared dependencies:

- `Header.svelte`
- `RecommendedFeed.svelte`
- `FloatingImage.svelte`

Notes:

- Explicitly disables SSR with `+page.js`
- Uses Leaflet on the client
- Mixes mock map spots with real PocketBase post content

## Auth Routes

## `/auth/signup`

File:

- `frontend/src/routes/auth/signup/+page.svelte`

Purpose:

- Creates a user account
- Requests email verification

Collections touched:

- `users`

Important behavior:

- Deletes stale unverified accounts for the same email before recreating
- Stores pending email in `localStorage` as `fiestra_pending_email`
- Sends user to `/auth/verify-pending`

## `/auth/verify-pending`

File:

- `frontend/src/routes/auth/verify-pending/+page.svelte`

Purpose:

- Informs the user to check email
- Allows resending verification

Collections touched:

- `users`

## `/auth/verify/[token]`

File:

- `frontend/src/routes/auth/verify/[token]/+page.svelte`

Purpose:

- Confirms PocketBase email verification token

Collections touched:

- `users`

## `/auth/login`

File:

- `frontend/src/routes/auth/login/+page.svelte`

Purpose:

- Password login
- Password reset request

Collections touched:

- `users`

## `/auth/setupProfile`

File:

- `frontend/src/routes/auth/setupProfile/+page.svelte`

Purpose:

- Post-verification onboarding
- Lets user add avatar, bio, and location

Collections touched:

- `users`

Important behavior:

- Handles the case where verification succeeded but PocketBase did not log the user in
- Shows inline login instead of forcing a redirect
- Uses Leaflet/OpenStreetMap/Nominatim for location selection

## Social And Content Routes

## `/create`

File:

- `frontend/src/routes/create/+page.svelte`

Purpose:

- Create new posts

Collections touched:

- `posts`
- auth store from `users`

Important behavior:

- Requires auth
- Builds `FormData` for image/video upload
- Writes the current user ID into the post record

## `/search`

File:

- `frontend/src/routes/search/+page.svelte`

Purpose:

- Global search across users, menu items, and recipes
- Explore/discovery feed for posts

Collections touched:

- `users`
- `menuItems`
- `recipes`
- `posts`
- `follows`
- `likes`
- `comments`
- `favorites`

Important behavior:

- Debounced search
- Client-side fuzzy matching on top of PocketBase query results
- Also powers favorite/unfavorite for menu items

## `/messages`

File:

- `frontend/src/routes/messages/+page.svelte`

Purpose:

- Inbox view of conversations

Collections touched:

- `conversations`
- `notifications`

Important behavior:

- Pulls all conversations involving current user
- Derives unread message counts from notification records
- Allows deleting a conversation record

## `/messages/[conversationId]`

File:

- `frontend/src/routes/messages/[conversationId]/+page.svelte`

Purpose:

- Conversation detail page

Collections touched:

- `users`
- `conversations`
- `messages`
- `notifications` indirectly through helper

Important behavior:

- Sets `users.activeConversation` while page is open
- Subscribes to realtime `messages`
- Updates `conversations.lastMessage` and `lastMessageTime`
- Calls `notifyMessage()` after send

## `/profile`

File:

- `frontend/src/routes/profile/+page.svelte`

Purpose:

- Current user profile
- Social profile + business storefront + customer ordering in one page

Collections touched:

- `users`
- `follows`
- `posts`
- `likes`
- `comments`
- `menuItems`
- `favorites`
- `recipes`
- `orders`
- `conversations`
- `notifications`

Shared dependencies:

- `Header.svelte`
- `PostModal.svelte`
- `HighlightsSection.svelte`
- `RecipeEditor.svelte`
- `RecipeView.svelte`
- `MenuItemForm.svelte`
- cart store

Important behavior:

- Acts as both a profile page and a storefront page
- Own profile and other-user profile behavior are mixed into the same route
- Handles follow/unfollow, messaging, ordering, menu management, and recipe CRUD

## `/profile/[username]`

File:

- `frontend/src/routes/profile/[username]/+page.svelte`

Purpose:

- Public or other-user profile

Collections touched:

- Same general set as `/profile`

Notes:

- Very similar responsibility to `/profile`
- Worth checking both pages when making profile-related changes because logic is duplicated

## `/profile/edit`

File:

- `frontend/src/routes/profile/edit/+page.svelte`

Purpose:

- Update profile fields
- Change password
- Delete account
- Submit business application
- Inspect user orders and favorites

Collections touched:

- `users`
- `business_applications`
- `orders`
- `favorites`

## Commerce Routes

## `/checkout`

File:

- `frontend/src/routes/checkout/+page.svelte`

Purpose:

- Checkout grouped by seller
- Address capture
- scheduling
- payment method selection
- order creation

Collections touched:

- `orders`
- `notifications`

Shared dependencies:

- cart store
- `Header.svelte`

Important behavior:

- Supports per-seller checkout groups from the cart
- Uses Leaflet + Nominatim for delivery address selection
- Integrates eSewa form-signing flow in the browser

## `/checkout/esewa-success`

File:

- `frontend/src/routes/checkout/esewa-success/+page.svelte`

Purpose:

- Payment success callback handler

Collections touched:

- `orders`
- `notifications`

Important behavior:

- Treats `transaction_uuid` as the PocketBase `orders.id`
- Updates order status after verified payment response

## `/checkout/esewa-failure`

File:

- `frontend/src/routes/checkout/esewa-failure/+page.svelte`

Purpose:

- Handles failed payment result

Collections touched:

- `orders`

Important behavior:

- Can cancel or mark pending orders after a payment failure

## Dashboard Routes

## `/dashboard`

File:

- `frontend/src/routes/dashboard/+page.svelte`

Purpose:

- Customer-facing order dashboard

Collections touched:

- `orders`
- `menuItems`

Important behavior:

- Subscribes to order changes
- Shows user order history/current orders

## `/business/dashboard`

File:

- `frontend/src/routes/business/dashboard/+page.svelte`

Purpose:

- Seller order operations dashboard

Collections touched:

- `orders`
- `menuItems`
- `notifications`

Important behavior:

- Business-only gate
- Subscribes to realtime order changes
- Moves order through lifecycle
- Handles cancellation and manual refund workflow

## `/business/menu`

File:

- `frontend/src/routes/business/menu/+page.svelte`

Purpose:

- Seller menu management page

Collections touched:

- `menuItems`

Shared dependencies:

- `MenuItemForm.svelte`

## `/business/analytics`

Files:

- `frontend/src/routes/business/analytics/+page.js`
- `frontend/src/routes/business/analytics/+page.svelte`

Purpose:

- Seller analytics and KPI reporting

Collections touched:

- `orders`
- `posts`
- `menuItems`
- `likes`
- `comments`

Important behavior:

- Explicitly client-only via `ssr = false`
- Builds analytics mostly in the browser from PocketBase records

## Supporting Route Notes

- `frontend/src/routes/demo/` is a demo/testing route.
- `frontend/src/routes/explore/+page.svelte` exists as part of discovery UX.
- `frontend/src/routes/business/analytics/+page.js`, `frontend/src/routes/home/+page.js`, and `frontend/src/routes/demo/+page.js` disable SSR explicitly.

## Practical Navigation Advice

If you need to change:

- signup/login/verification: start in `auth/`
- social feed/posts/comments/likes: start in `create/`, `profile/`, `search/`, `PostModal.svelte`
- messaging: start in `messages/` plus `Notifications.js`
- ordering/cart/checkout: start in `profile/`, `checkout/`, `stores/cart.ts`
- seller operations: start in `business/dashboard/`, `business/menu/`, `business/analytics/`
