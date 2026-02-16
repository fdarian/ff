# Cache Module

In-memory caching with SWR (stale-while-revalidate) and pluggable persistence adapters, built on Effect's `Cache`.

- `cache.ts` — `Cache.make()`, SWR logic, `Cache.entry()` for per-entry TTL overrides
- `adapter.ts` — `CacheAdapter` interface with `memory()`, `redis()`, `tiered()`
- `adapters/` — Redis client adapters (ioredis, bun-redis) that wrap clients to `RedisClient` interface
- User-facing docs: `docs/cache.md`
