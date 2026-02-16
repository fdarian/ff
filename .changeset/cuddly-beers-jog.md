---
"ff-serv": patch
---

Add `Cache` module with stale-while-revalidate (SWR) support built on Effect's Cache:
- Pluggable persistence via `CacheAdapter` interface (memory, redis, tiered)
- Redis client adapters for ioredis and Bun native Redis
- Per-entry TTL/SWR overrides via `Cache.entry()`
- Exported via `ff-serv/cache`, `ff-serv/cache/ioredis`, `ff-serv/cache/bun-redis`
