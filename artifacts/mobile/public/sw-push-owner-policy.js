(function attachAnotherMePushOwnerPolicy(root) {
  "use strict";

  const OWNER_LEASE_MS = 24 * 60 * 60 * 1000;

  function createOwnerRecord(userId, now) {
    if (typeof userId !== "string" || userId.length === 0 || userId.length > 128) {
      return null;
    }
    return { userId, expiresAt: now + OWNER_LEASE_MS };
  }

  function parseOwnerRecord(value, now) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.userId !== "string" || value.userId.length === 0) return null;
    if (!Number.isFinite(value.expiresAt) || value.expiresAt <= now) return null;
    return { userId: value.userId, expiresAt: value.expiresAt };
  }

  function shouldDisplayForOwner(ownerRecord, recipientUserId, now) {
    const owner = parseOwnerRecord(ownerRecord, now);
    return !!owner && typeof recipientUserId === "string" && owner.userId === recipientUserId;
  }

  root.AnotherMePushOwnerPolicy = {
    OWNER_LEASE_MS,
    createOwnerRecord,
    parseOwnerRecord,
    shouldDisplayForOwner,
  };
})(typeof self !== "undefined" ? self : globalThis);
