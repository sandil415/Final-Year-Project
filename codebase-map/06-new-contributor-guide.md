# New Contributor Guide

This file is the practical "how to work in this codebase" guide.

## First Mental Model

Do not look for a traditional layered backend.

Instead, think in this order:

1. Which route/component owns the user experience?
2. Which PocketBase collection stores the feature data?
3. Which helper/store is gluing the feature together?
4. Which migration/rule controls whether the operation is allowed?

That mental model will get you to the right file faster than searching for controllers or services.

## Recommended First Read

If you are brand new, inspect these files first:

- `frontend/src/lib/pocketbase.js`
- `frontend/src/lib/auth.js`
- `frontend/src/lib/components/Header.svelte`
- `frontend/src/routes/profile/+page.svelte`
- `frontend/src/routes/checkout/+page.svelte`
- `frontend/src/routes/business/dashboard/+page.svelte`
- `frontend/src/lib/stores/cart.ts`
- `frontend/src/lib/recommendations.js`
- `Backend/pb_migrations/`

Why these files:

- they show the main app patterns
- they touch the largest number of cross-cutting features

## Local Development Shape

The repo currently has a clearer frontend setup than backend orchestration.

Frontend:

- package file: `frontend/package.json`
- normal SvelteKit commands live there

Backend:

- PocketBase executable is checked in at `Backend/pocketbase`
- local database files live under `Backend/pb_data/`
- schema history lives under `Backend/pb_migrations/`

Practical implication:

- frontend startup is script-driven
- backend startup appears to be manual PocketBase usage rather than wrapped in a root script

Before changing schema or auth behavior, confirm which local PocketBase database you are running against.

## Common Change Entry Points

## If you need to add or change a page

Start in:

- `frontend/src/routes/`

## If you need to add a shared modal/form/list

Start in:

- `frontend/src/lib/components/`

## If you need to change auth behavior

Start in:

- `frontend/src/lib/auth.js`
- `frontend/src/routes/auth/`
- `users` collection rules/migrations

## If you need to change ordering

Start in:

- `frontend/src/lib/stores/cart.ts`
- `frontend/src/routes/checkout/+page.svelte`
- `frontend/src/routes/business/dashboard/+page.svelte`
- `orders` collection schema/rules

## If you need to change recommendations

Start in:

- `frontend/src/lib/recommendations.js`
- `frontend/src/lib/Menuattributes.js`
- `menuItems` schema

## If you need to change messaging

Start in:

- `frontend/src/routes/messages/`
- `frontend/src/lib/Notifications.js`
- `conversations`, `messages`, `notifications`, `users.activeConversation`

## Debugging Advice

## PocketBase bugs often look like frontend bugs

When something fails, do not stop at the component.

Check:

- collection name
- field name
- auth rule
- relation filter syntax
- whether the user is logged in
- whether the field exists in the current live schema

## Realtime bugs often look like stale state bugs

A page may:

- load initial records with `getList()` or `getFullList()`
- then expect `subscribe()` to keep the UI fresh

If updates do not appear:

- verify the subscription exists
- verify the subscription filter
- verify the page is mutating local state in the callback

## Schema snapshot files are helpful, but not perfect

The checked-in `pb_schema.json` snapshots appear older than some frontend expectations.

For anything important, compare:

- frontend field usage
- latest migration files
- current live PocketBase data/schema

## Known Architectural Sharp Edges

- Profile logic is duplicated between `/profile` and `/profile/[username]`.
- Auth redirects are not fully consistent in naming.
- Some feature logic lives in large page files instead of small dedicated modules.
- Notifications are mostly frontend-generated right now.
- Order/payment fields appear to have evolved beyond the older schema snapshot files.

These are not blockers, but they are good things for a new contributor to know early.

## Safe Change Strategy

For most feature work:

1. Identify the page/component owner.
2. Search for all `pb.collection('<collection>')` usages.
3. Check the matching collection rules/migrations.
4. Test both the initial load and realtime updates.
5. If the feature touches profile or orders, test more than one route because those features are reused widely.

## High-Value Refactor Opportunities

If the team decides to improve maintainability later, the biggest wins would likely be:

- extracting large route files into feature modules
- centralizing PocketBase collection access per domain
- documenting or scripting local backend startup
- reducing duplicate logic between profile variants
- making notification and payment schemas more explicit and consistent

## Final Onboarding Advice

This codebase is easiest to understand feature-by-feature, not layer-by-layer.

Start from the user journey you care about, trace its page, then trace its PocketBase collections. That path mirrors how the app was built.
