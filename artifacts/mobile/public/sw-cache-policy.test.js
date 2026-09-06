const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cacheAllRequired,
  planAppShellCaches,
} = require("./sw-cache-policy.js");

test("cache retention keeps the current cache and two immediate predecessors", () => {
  const plan = planAppShellCaches(
    [
      "unrelated-cache",
      "anotherme-app-shell-v0",
      "anotherme-app-shell-v1",
      "anotherme-app-shell-v2",
      "anotherme-app-shell-staging-v3",
      "anotherme-app-shell-v3",
    ],
    "anotherme-app-shell-v3",
  );

  assert.deepEqual(plan.lookup, [
    "anotherme-app-shell-v3",
    "anotherme-app-shell-v2",
    "anotherme-app-shell-v1",
  ]);
  assert.deepEqual(plan.remove, [
    "anotherme-app-shell-v0",
    "anotherme-app-shell-staging-v3",
  ]);
  assert.equal(plan.remove.includes("unrelated-cache"), false);
});

test("an active worker never reads a cache created after its own cache", () => {
  const plan = planAppShellCaches(
    [
      "anotherme-app-shell-v-1",
      "anotherme-app-shell-v0",
      "anotherme-app-shell-v1",
      "anotherme-app-shell-v2",
      "anotherme-app-shell-staging-v3",
      "anotherme-app-shell-v3-partial",
    ],
    "anotherme-app-shell-v2",
  );

  assert.deepEqual(plan.lookup, [
    "anotherme-app-shell-v2",
    "anotherme-app-shell-v1",
    "anotherme-app-shell-v0",
  ]);
  assert.deepEqual(plan.remove, ["anotherme-app-shell-v-1"]);
  assert.equal(plan.remove.includes("anotherme-app-shell-staging-v3"), false);
  assert.equal(plan.remove.includes("anotherme-app-shell-v3-partial"), false);
});

test("a missing current cache does not make an unknown future cache eligible", () => {
  const plan = planAppShellCaches(
    ["anotherme-app-shell-v3", "anotherme-app-shell-staging-v4"],
    "anotherme-app-shell-v2",
  );

  assert.deepEqual(plan.lookup, ["anotherme-app-shell-v2"]);
  assert.deepEqual(plan.keep, ["anotherme-app-shell-v2"]);
  assert.deepEqual(plan.remove, []);
});

test("required app-shell caching fails fast and does not continue after a failed asset", async () => {
  const added = [];
  const cache = {
    async add(url) {
      added.push(url);
      if (url === "/app/b.js") throw new Error("network unavailable");
    },
    async match() {
      return {};
    },
  };

  await assert.rejects(
    cacheAllRequired(cache, ["/app/", "/app/b.js", "/app/c.js"]),
    /network unavailable/,
  );
  assert.deepEqual(added, ["/app/", "/app/b.js"]);
});

test("required app-shell caching verifies every write before activation", async () => {
  const stored = new Set();
  const cache = {
    async add(url) {
      stored.add(url);
    },
    async match(url) {
      return url === "/app/missing.js" ? undefined : stored.has(url) ? {} : undefined;
    },
  };

  await assert.rejects(
    cacheAllRequired(cache, ["/app/", "/app/missing.js"]),
    /was not cached/,
  );
});
