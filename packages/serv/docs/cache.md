# Cache

In-memory caching with SWR (stale-while-revalidate) and optional persistence adapters, built on Effect's `Cache`.

## Quick Start

```ts
import { Cache } from 'ff-serv/cache'
import { Duration, Effect } from 'effect'

const userCache = Cache.make({
  ttl: Duration.minutes(5),
  lookup: (id: number) => fetchUser(id),
})

const program = Effect.gen(function* () {
  const users = yield* userCache
  const user = yield* users.get(123)
  yield* users.invalidate(123)
})
```

## TTL & SWR

- `ttl` (required) — how long an entry is considered fresh
- `swr` (optional, default `0`) — additional window after TTL where stale values are served immediately while a background refresh runs

```
|--- fresh (ttl) ---|--- stale-while-revalidate (swr) ---|--- expired ---|
     return cached        return stale + background refresh    block for fresh
```

```ts
Cache.make({
  ttl: Duration.minutes(5),
  swr: Duration.minutes(10),
  lookup: (id: number) => fetchUser(id),
})
```

## Dynamic TTL

Override TTL/SWR per entry based on the lookup result using `Cache.entry()`:

```ts
Cache.make({
  ttl: Duration.minutes(5),
  lookup: (id: number) => Effect.gen(function* () {
    const user = yield* fetchUser(id)
    if (user.isPremium) {
      return Cache.entry(user, { ttl: Duration.hours(1), swr: Duration.hours(2) })
    }
    return user // uses default ttl/swr
  }),
})
```

## Adapters

### In-memory (default)

No adapter needed. Optionally set capacity:

```ts
import { CacheAdapter } from 'ff-serv/cache'

Cache.make({
  adapter: CacheAdapter.memory({ capacity: 1000 }),
  ttl: Duration.minutes(5),
  lookup: (id: number) => fetchUser(id),
})
```

### Redis

Persists cache entries to Redis. Entries survive process restarts.

#### ioredis

```ts
import { CacheAdapter } from 'ff-serv/cache'
import { ioredis } from 'ff-serv/cache/ioredis'

Cache.make({
  adapter: CacheAdapter.redis({
    client: ioredis(redisClient),
    keyPrefix: 'user',
    schema: UserSchema, // optional Effect Schema for encode/decode
  }),
  ttl: Duration.minutes(5),
  lookup: (id: number) => fetchUser(id),
})
```

#### bun-redis

```ts
import { CacheAdapter } from 'ff-serv/cache'
import { bunRedis } from 'ff-serv/cache/bun-redis'
import { RedisClient } from 'bun'

const client = new RedisClient()

Cache.make({
  adapter: CacheAdapter.redis({
    client: bunRedis(client),
    keyPrefix: 'user',
  }),
  ttl: Duration.minutes(5),
  lookup: (id: number) => fetchUser(id),
})
```

### Tiered

Combine adapters. L1 (memory) for capacity control, L2 (Redis) for persistence:

```ts
Cache.make({
  adapter: CacheAdapter.tiered(
    CacheAdapter.memory({ capacity: 500 }),
    CacheAdapter.redis({ client: ioredis(redisClient), keyPrefix: 'user' }),
  ),
  ttl: Duration.minutes(5),
  lookup: (id: number) => fetchUser(id),
})
```

## Invalidation

```ts
const cache = yield* userCache
yield* cache.invalidate(123)   // single key
yield* cache.invalidateAll     // all keys
```
