# PocketBase Backend

This project's backend is PocketBase, not a custom API server.

## Backend Folder Anatomy

```text
Backend/
├── pocketbase          # PocketBase executable
├── pb_data/            # local data.db, auxiliary.db, generated typings
├── pb_migrations/      # schema history and rule changes
└── pb_hooks/           # server-side hook scripts
```

## What "Backend Routes" Means In This Repo

There are no custom Express/Fastify route handlers in the repository.

Instead, frontend pages call standard PocketBase APIs such as:

- `/api/collections/users/records`
- `/api/collections/posts/records`
- `/api/collections/orders/records`
- `/api/collections/messages/records`

When someone asks "where is the backend route for this feature?", the correct answer is usually:

- find the PocketBase collection
- find its access rules in migrations/schema
- find the frontend page/component that calls `pb.collection('<name>')`

## PocketBase Client Contract

The frontend uses one shared client:

- File: `frontend/src/lib/pocketbase.js`
- URL: `http://127.0.0.1:8090`

All auth, CRUD, filters, uploads, and subscriptions flow through that client.

## Collections Overview

These are the main non-system collections currently used by the app.

## `users` (auth collection)

Purpose:

- login identity
- profile fields
- account role (`personal` or `business`)
- avatar/bio/business information
- messaging presence via `activeConversation`

Used by:

- all auth routes
- profile routes
- messaging
- order buyer/seller relations
- notifications trigger context

## `posts`

Purpose:

- social posts with image/video and caption

Used by:

- `/create`
- `/home`
- `/profile`
- `/search`
- `PostModal.svelte`

## `likes`

Purpose:

- many-to-many relation between user and post

Used by:

- profile pages
- search explore ranking
- post modal
- business analytics
- recommendation engine

## `comments`

Purpose:

- post comments

Used by:

- `PostModal.svelte`
- profile pages
- search explore ranking
- analytics

## `follows`

Purpose:

- social graph between users

Used by:

- profile follow/unfollow
- search/explore ranking
- recommendation engine

## `conversations`

Purpose:

- top-level message thread metadata

Fields seen in usage:

- participants
- lastMessage
- lastMessageTime

Used by:

- `/messages`
- `/messages/[conversationId]`
- profile "message user" flow

## `messages`

Purpose:

- actual chat messages within a conversation

Fields seen in usage:

- conversation
- sender
- content
- type
- media
- read

Used by:

- `/messages/[conversationId]`
- realtime messaging subscriptions

## `notifications`

Purpose:

- in-app notifications for likes, comments, follows, messages, and order updates

Used by:

- `Header.svelte`
- `NotificationsPanel.svelte`
- `Notifications.js`
- seller dashboard
- checkout success/failure flows
- profile actions

Notes:

- The code references message-related linking fields such as conversation linkage in addition to the basic schema snapshot.
- Treat current frontend usage plus latest migrations/live data as the real contract.

## `menuItems`

Purpose:

- seller inventory/menu
- product catalog for ordering and recommendations

Base fields:

- seller
- name
- description
- price
- category
- image
- isAvailable
- preparationTime

Later fields added through migrations/frontend usage:

- mealType
- cuisineType
- dietType
- priceTier
- spiceLevel
- healthTag
- popularityTag
- modifiers

Used by:

- profile storefront
- seller menu management
- checkout/cart
- search
- recommendations
- analytics

## `orders`

Purpose:

- order records between buyer and seller

Core fields from migrations/frontend usage:

- buyer
- seller
- items
- totalAmount
- status
- deliveryAddress
- notes
- scheduledAt

Frontend also expects additional payment/refund metadata in some flows:

- payment method/status style fields
- eSewa transaction identifiers
- refund status/details

Notes:

- The frontend order flow has evolved faster than the checked-in schema snapshots.
- Verify the latest migration chain and live collection fields before doing order-schema work.

Used by:

- checkout
- customer dashboard
- seller dashboard
- analytics
- recommendation engine

## `highlights` and `highlight_items`

Purpose:

- Instagram-story-style grouped highlights

Used by:

- profile highlight UI

## `stories`

Purpose:

- story-like short-lived or grouped media content

Used by:

- story/highlight-related UI

## `recipes`

Purpose:

- long-form recipe content attached to a user profile

Used by:

- profile pages
- search

## `business_applications`

Purpose:

- requests to become a business account

Used by:

- profile edit page

## `favorites`

Purpose:

- user-saved menu items

Used by:

- search
- profile pages
- profile edit

Notable rule:

- unique index on `(user, menuItem)`

## Access Rules And Security Model

PocketBase rules are the main backend authorization layer.

Examples from current schema/migrations:

- `likes` creation is restricted to authenticated users creating likes for themselves
- `comments` are user-owned
- `conversations` and `messages` are filtered by participant membership
- `notifications` are user-scoped
- `favorites` are user-scoped

Important nuance:

- some collections like `orders` have permissive or evolving rules in snapshots/migrations
- frontend code often assumes business-role discipline in addition to collection rules

For sensitive changes, always inspect both:

- access rules in migrations/schema
- client code paths that create/update the records

## Realtime Usage

PocketBase realtime is an important part of the app.

Current usage includes:

- `messages` subscriptions in chat detail
- `notifications` subscriptions in header/panels
- `orders` subscriptions in seller/customer dashboards

This means behavior may be split between:

- initial `getList` or `getFullList`
- subscription callbacks that keep local state fresh

## Hooks

Current hook file:

- `Backend/pb_hooks/message_notify.pb.js`

Important context:

- the message notification hook code is currently commented out
- the app is mostly generating notifications from frontend code via `frontend/src/lib/Notifications.js`

So the effective notification system today is primarily client-driven, not hook-driven.

## Migrations

Schema evolution lives in `Backend/pb_migrations/`.

Examples:

- user collection evolution
- conversations/messages
- posts, likes, comments
- menu items and their recommendation attributes
- orders and scheduled ordering
- recipes
- business applications
- favorites

When onboarding someone to backend work, the migration folder is the schema history log.

## Practical Backend Debugging Checklist

When a feature breaks, check in this order:

1. Does the relevant collection field exist in PocketBase?
2. Do collection rules allow the current auth state to do the operation?
3. Is the frontend using the correct collection/field names?
4. Is a realtime subscription expected to refresh UI state?
5. Is the bug caused by old schema snapshots not matching the live collection?
