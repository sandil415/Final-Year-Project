# Auth And User Lifecycle

This file explains how authentication works and how a user moves through the app from signup to normal usage.

## Core Auth Mechanism

The app uses PocketBase auth through the shared client in `frontend/src/lib/pocketbase.js`.

Main auth signals:

- `pb.authStore.isValid`
- `pb.authStore.model`
- `pb.authStore.record`

The helper file `frontend/src/lib/auth.js` provides:

- `requireAuth()`
- `getUser()`
- `isAuthenticated()`

`requireAuth()` is lightweight. It checks `pb.authStore` and redirects to `/login` when unauthenticated.

Important note:

- most protected pages call `requireAuth()` inside `onMount()`
- this is a client-side guard, not a server-side route guard
- the real security boundary is still PocketBase collection rules

## Signup Flow

Primary file:

- `frontend/src/routes/auth/signup/+page.svelte`

Flow:

1. User enters username, email, and password
2. Frontend validates password strength
3. App checks for a stale unverified user with the same email
4. If found, stale user is deleted
5. New PocketBase `users` record is created
6. `requestVerification(email)` is called
7. Email is saved to `localStorage` as `fiestra_pending_email`
8. User is sent to `/auth/verify-pending`

Why this matters:

- without the stale-record cleanup, an abandoned unverified signup would block future attempts with the same email

## Verification Flow

Files:

- `frontend/src/routes/auth/verify-pending/+page.svelte`
- `frontend/src/routes/auth/verify/[token]/+page.svelte`

Flow:

1. User lands on verify-pending screen
2. App shows the target email from query string or `localStorage`
3. User clicks verification email
4. `/auth/verify/[token]` calls PocketBase email verification confirmation

Important nuance:

- PocketBase verification does not automatically create a logged-in session for this app flow
- because of that, the app has a special setup-profile step that can also show an inline login prompt

## Login Flow

Primary file:

- `frontend/src/routes/auth/login/+page.svelte`

Flow:

1. User submits email and password
2. App calls `pb.collection('users').authWithPassword(email, password)`
3. On success, user is sent to `/home`

Password reset:

- same page calls `requestPasswordReset(email)`

## Post-Verification Profile Setup

Primary file:

- `frontend/src/routes/auth/setupProfile/+page.svelte`

Purpose:

- bridge between email verification and first-class app usage

What it collects:

- avatar
- bio
- location address
- latitude/longitude

Important behavior:

- if the user is already authenticated, the page edits the current record
- if not, it offers inline login using the email saved during signup
- after profile save, it updates the `users` record and refreshes `pb.authStore`

Location setup uses:

- Leaflet for map UI
- OpenStreetMap tiles
- Nominatim reverse geocoding

## Logout Flow

Most pages use a simple logout implementation:

- `pb.authStore.clear()`
- redirect to `/auth/login`

This happens in routes like profile pages and settings-style pages.

## Account Types And Roles

The `users` collection drives role-based UX with `accountType`.

Main modes:

- `personal`
- `business`

Business account behavior affects:

- dashboard destination in header
- menu management access
- seller dashboard access
- business analytics access
- storefront rendering on profile pages

There is also a `business_applications` collection used from profile edit.

## Profile Editing And Account Management

Primary file:

- `frontend/src/routes/profile/edit/+page.svelte`

Capabilities include:

- update profile fields
- update avatar and business details
- change password
- delete account
- submit business application
- inspect favorites/orders in settings context

Important auth detail:

- when user data is updated, the code often calls `pb.authStore.save(pb.authStore.token, updated)` so the in-memory auth model stays fresh

## Messaging Presence And Auth

The messaging system relies on user auth plus a presence-like field:

- `users.activeConversation`

When a user opens a conversation:

1. chat page updates `activeConversation`
2. message notifications can be skipped if the recipient is already viewing that conversation
3. field is cleared on page destroy

This is a lightweight presence system implemented on the user record itself.

## Where Auth Is Enforced

Auth enforcement happens in three places together:

## 1. Client guard

- `requireAuth()`

## 2. UI role checks

Examples:

- business pages redirect non-business users
- profile pages branch on own-profile vs other-user

## 3. PocketBase collection rules

Examples:

- likes/comments/follows/favorites are user-scoped
- messages are participant-scoped
- notifications are recipient-scoped

For onboarding, the key lesson is:

- a page redirect does not equal real security
- the collection rule is the backend security boundary

## Auth-Related Gotchas

- Redirect targets are not perfectly consistent everywhere; `requireAuth()` redirects to `/login`, while the actual login route is `/auth/login`.
- The app sometimes reads `pb.authStore.record` and sometimes `pb.authStore.model`.
- Some routes assume auth state exists immediately on mount.
- Profile setup is special because email verification does not automatically log the user in.

If you change auth, test:

1. signup
2. verification email flow
3. login
4. setup profile
5. logout
6. protected page access
7. business-only routes
