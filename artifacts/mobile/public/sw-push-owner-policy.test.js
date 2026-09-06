const assert = require("node:assert/strict");
const test = require("node:test");

require("./sw-push-owner-policy.js");

const policy = globalThis.AnotherMePushOwnerPolicy;

test("push is displayed only for the active unexpired account", () => {
  const now = 1_800_000_000_000;
  const owner = policy.createOwnerRecord("user-b", now);
  assert.equal(policy.shouldDisplayForOwner(owner, "user-b", now), true);
  assert.equal(policy.shouldDisplayForOwner(owner, "user-a", now), false);
  assert.equal(policy.shouldDisplayForOwner(owner, undefined, now), false);
  assert.equal(
    policy.shouldDisplayForOwner(owner, "user-b", now + policy.OWNER_LEASE_MS + 1),
    false,
  );
});

test("invalid owner records fail closed", () => {
  const now = 1_800_000_000_000;
  assert.equal(policy.createOwnerRecord("", now), null);
  assert.equal(policy.shouldDisplayForOwner(null, "user-a", now), false);
  assert.equal(policy.shouldDisplayForOwner({ userId: "user-a" }, "user-a", now), false);
});
