import { Effect, Option } from 'effect';
import type { RedisClient } from '../adapter.js';

type IORedisClient = {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, px: 'PX', ttlMs: number): Promise<unknown>;
	del(key: string): Promise<number>;
};

export function ioredis(client: IORedisClient): RedisClient {
	return {
		get: (key) =>
			Effect.tryPromise(() => client.get(key)).pipe(
				Effect.map((value) =>
					value !== null ? Option.some(value) : Option.none(),
				),
				Effect.orDie,
			),
		set: (key, value, ttlMs) =>
			Effect.tryPromise(() => client.set(key, value, 'PX', ttlMs)).pipe(
				Effect.asVoid,
				Effect.orDie,
			),
		del: (key) =>
			Effect.tryPromise(() => client.del(key)).pipe(
				Effect.asVoid,
				Effect.orDie,
			),
	};
}
