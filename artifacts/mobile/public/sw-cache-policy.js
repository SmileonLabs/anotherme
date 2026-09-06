(function exposeAnotherMePwaCachePolicy(globalScope) {
  "use strict";

  function planAppShellCaches(
    cacheNames,
    currentCache,
    {
      cachePrefix = "anotherme-app-shell-",
      stagingPrefix = "anotherme-app-shell-staging-",
      retainPrevious = 2,
    } = {},
  ) {
    const boundedPrevious = Math.max(0, Math.floor(Number(retainPrevious) || 0));
    const appCaches = cacheNames.filter(
      (name) => name.startsWith(cachePrefix) && !name.startsWith(stagingPrefix),
    );
    const currentIndex = appCaches.indexOf(currentCache);
    const currentStorageIndex = cacheNames.indexOf(currentCache);
    // If this worker's own cache is absent there is no trustworthy ordering
    // anchor. Fail closed instead of guessing that an unknown cache belongs to
    // an older worker; it may be a partially installed future release.
    const eligiblePrevious = currentIndex >= 0
      ? appCaches.slice(0, currentIndex)
      : [];
    const previous = eligiblePrevious.slice(-boundedPrevious);
    const keep = new Set([currentCache, ...previous]);
    const definitelyOlder = new Set(
      currentIndex >= 0 ? appCaches.slice(0, currentIndex) : [],
    );
    const remove = currentStorageIndex < 0
      ? []
      : cacheNames.filter((name, index) => {
          // Never delete a cache opened after this worker's cache. It may
          // belong to an in-progress future worker installation.
          if (index >= currentStorageIndex) return false;
          if (name.startsWith(stagingPrefix)) return true;
          return definitelyOlder.has(name) && !keep.has(name);
        });

    return {
      // Prefer this worker's assets, then the newest retained predecessor. A
      // cache created by a newer, not-yet-active worker is intentionally never
      // eligible for lookup by the current worker.
      lookup: [currentCache, ...previous.slice().reverse()],
      keep: [...keep],
      remove,
    };
  }

  async function cacheAllRequired(cache, assetUrls) {
    if (!Array.isArray(assetUrls) || assetUrls.length === 0) {
      throw new Error("The PWA app shell must contain at least one required asset.");
    }

    // Sequential writes make failure cleanup deterministic: there are no
    // outstanding cache.add() operations after this function rejects.
    for (const url of assetUrls) {
      await cache.add(url);
    }
    for (const url of assetUrls) {
      if (!(await cache.match(url))) {
        throw new Error(`Required PWA app-shell asset was not cached: ${url}`);
      }
    }
  }

  const policy = Object.freeze({ planAppShellCaches, cacheAllRequired });
  if (typeof module === "object" && module.exports) module.exports = policy;
  if (globalScope) globalScope.AnotherMePwaCachePolicy = policy;
})(typeof self !== "undefined" ? self : undefined);
