---
name: Clerk instance migration & user provisioning
description: Why switching Clerk pk_test->pk_live broke all authed requests, and how requireAuth must provision users.
---

# Clerk pk_test -> pk_live migration breaks user provisioning

Switching the production Clerk instance (e.g. test key -> live key) gives the
**same person a brand-new `clerk_id`** while their email stays the same. If the
`users` table has a UNIQUE constraint on `email`, the provisioning insert in
`requireAuth` crashes with `users_email_unique` duplicate-key and returns **500
on every authenticated request** — this breaks BOTH the PWA/web and the native
app at once (it is a server bug, not a client/proxy bug).

**Rule:** `requireAuth` must provision idempotently. When no row matches the
`clerk_id`, look up by the **verified primary email** and *relink* (update the
existing row's `clerk_id`) instead of inserting a duplicate.

**Why verified-primary-only:** relinking on `emailAddresses[0]` (possibly
unverified/non-primary) is an account-hijack vector — someone could claim
another user's row by adding their email. Resolve `primaryEmailAddressId`,
require `verification.status === "verified"`, and reject (403) when there is no
verified primary email instead of inserting an empty-string email.

**How to apply:** any time the production Clerk publishable/secret keys change
instance, expect new clerk_ids for existing users; the relink path is what keeps
them logged into their existing data.

# @clerk/expo proxy prop is `proxyUrl` (the `n` is just minification)

In `@clerk/expo` the bundled `createClerkInstance`/`ClerkProvider` source shows
the proxy destructured as `n` and passed to the native instance as `{ n, domain }`.
That `n` is **only a minified rename of `proxyUrl`** — the public/typed prop is
`proxyUrl`, and passing `proxyUrl` DOES reach the native FAPI client. Do not try
to pass a literal `n` prop (it fails typecheck: "Property 'n' does not exist").
Native was never broken on the proxy; `proxyUrl` works on web and native.
