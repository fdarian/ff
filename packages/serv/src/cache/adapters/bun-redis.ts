import { Effect, Option } from 'effect'
import type { RedisClient } from '../adapter.js'

type BunRedisClient = {
  get(key: string): Promise<string | null>
  send(command: string, args: string[]): Promise<unknown>
  del(key: string): Promise<number>
}

export function bunRedis(client: BunRedisClient): RedisClient {
  return {
    get: (key) =>
      Effect.tryPromise(() => client.get(key)).pipe(
        Effect.map((value) =>
          value !== null ? Option.some(value) : Option.none(),
        ),
        Effect.orDie,
      ),
    set: (key, value, ttlMs) =>
      Effect.tryPromise(() =>
        client.send('SET', [key, value, 'PX', String(ttlMs)]),
      ).pipe(Effect.asVoid, Effect.orDie),
    del: (key) =>
      Effect.tryPromise(() => client.del(key)).pipe(
        Effect.asVoid,
        Effect.orDie,
      ),
  }
}
