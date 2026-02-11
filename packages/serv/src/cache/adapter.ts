import { Duration, Effect, Option, Schema } from 'effect'

export type CacheEntry<Value> = {
  readonly value: Value
  readonly storedAt: number
}

export type RedisClient = {
  readonly get: (key: string) => Effect.Effect<Option.Option<string>>
  readonly set: (
    key: string,
    value: string,
    ttlMs: number,
  ) => Effect.Effect<void>
  readonly del: (key: string) => Effect.Effect<void>
}

export type CacheAdapter<Key, Value> = {
  readonly get: (
    key: Key,
  ) => Effect.Effect<Option.Option<CacheEntry<Value>>>
  readonly set: (
    key: Key,
    entry: CacheEntry<Value>,
    ttl: Duration.Duration,
  ) => Effect.Effect<void>
  readonly remove: (key: Key) => Effect.Effect<void>
  readonly removeAll: Effect.Effect<void>
  readonly capacity?: number
}

export namespace CacheAdapter {
  export function memory<Key, Value>(opts?: {
    capacity?: number
  }): CacheAdapter<Key, Value> {
    return {
      get: () => Effect.succeed(Option.none()),
      set: () => Effect.void,
      remove: () => Effect.void,
      removeAll: Effect.void,
      capacity: opts?.capacity,
    }
  }

  export function redis<Key, Value>(opts: {
    client: RedisClient
    keyPrefix: string
    schema?: Schema.Schema<Value, string>
  }): CacheAdapter<Key, Value> {
    const encodeKey = (key: Key) => `${opts.keyPrefix}:${JSON.stringify(key)}`

    const encodeEntry = (entry: CacheEntry<Value>): Effect.Effect<string> => {
      if (opts.schema) {
        return Schema.encode(opts.schema)(entry.value).pipe(
          Effect.map(
            (encoded) => JSON.stringify({ value: encoded, storedAt: entry.storedAt }),
          ),
          Effect.orDie,
        )
      }
      return Effect.succeed(JSON.stringify(entry))
    }

    const decodeEntry = (raw: string): Effect.Effect<CacheEntry<Value>> => {
      const parsed = JSON.parse(raw)
      if (opts.schema) {
        return Schema.decode(opts.schema)(parsed.value).pipe(
          Effect.map((value) => ({ value, storedAt: parsed.storedAt as number })),
          Effect.orDie,
        )
      }
      return Effect.succeed(parsed as CacheEntry<Value>)
    }

    return {
      get: (key) =>
        Effect.gen(function* () {
          const raw = yield* opts.client.get(encodeKey(key))
          if (Option.isNone(raw)) return Option.none<CacheEntry<Value>>()
          const entry = yield* decodeEntry(raw.value)
          return Option.some(entry)
        }),
      set: (key, entry, ttl) =>
        Effect.gen(function* () {
          const encoded = yield* encodeEntry(entry)
          yield* opts.client.set(encodeKey(key), encoded, Duration.toMillis(ttl))
        }),
      remove: (key) => opts.client.del(encodeKey(key)),
      removeAll: Effect.void,
    }
  }

  export function tiered<Key, Value>(
    l1: CacheAdapter<Key, Value>,
    l2: CacheAdapter<Key, Value>,
  ): CacheAdapter<Key, Value> {
    return {
      get: (key) =>
        Effect.gen(function* () {
          const fromL1 = yield* l1.get(key)
          if (Option.isSome(fromL1)) return fromL1
          return yield* l2.get(key)
        }),
      set: (key, entry, ttl) =>
        Effect.all([l1.set(key, entry, ttl), l2.set(key, entry, ttl)], {
          discard: true,
        }),
      remove: (key) =>
        Effect.all([l1.remove(key), l2.remove(key)], { discard: true }),
      removeAll: Effect.all([l1.removeAll, l2.removeAll], { discard: true }),
      capacity: l1.capacity,
    }
  }
}
