# Character profile ownership contract

This document is the implementation contract for the multi-profile rollout.

## Account-owned data

Authentication, verified email, linked wallets, NFT ownership, billing/PVT,
security settings, sanctions, blocks and device push tokens remain owned by the
member account. These values are never exposed as a public social identity.

## Profile-owned data

Public identity, posts, comments, reactions, follows, chat/call presentation,
growth, missions, achievements, inventory and profile notifications are owned
by `character_profiles.id`. Public APIs return profile identifiers and must not
return the owning user identifier.

## Runtime actor

Profile-scoped requests may carry `X-Character-Profile-Id`. The API verifies
that the authenticated member owns an active profile with that id. The stored
active profile is only a default for clients that have not supplied a request
actor. Account-wide sanctions and blocks are checked after profile resolution
so switching profiles cannot bypass them.

## Lifecycle

Profiles move through `active`, `locked`, `torimia`, and `archived`. At least one
non-archived profile must remain on every account. Archiving is a soft delete:
historical posts and messages retain a profile snapshot while new activity is
rejected.

## Currency

PVT is an account wallet. XP, stats, missions, achievements, inventory and
growth materials are profile-scoped. A transfer of NFT ownership locks the old
STAR profile; it never transfers the old profile or its history to a new member.
