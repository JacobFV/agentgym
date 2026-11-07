import { TtlCache } from './cache.mjs';

// Thin service over a remote user API with read-through caching.
export function createUserService(api, cacheOpts = {}) {
  const cache = new TtlCache(cacheOpts);

  return {
    cache,
    async getUser(id) {
      return cache.getOrLoad(`user:${id}`, () => api.fetchUser(id));
    },
    /** Synchronous peek used by the request logger; must never return a promise. */
    peekUser(id) {
      return cache.get(`user:${id}`);
    },
    invalidate(id) {
      cache.delete(`user:${id}`);
    },
  };
}
