import { it } from '@effect/vitest';
import { Duration, Effect, Option } from 'effect';
import { describe, expect } from 'vitest';
import { CacheAdapter } from './adapter.js';

describe('CacheAdapter', () => {
	describe('memory', () => {
		it.effect('get returns None', () =>
			Effect.gen(function* () {
				const adapter = CacheAdapter.memory();
				const result = yield* adapter.get('key');
				expect(Option.isNone(result)).toBe(true);
			}),
		);

		it.effect('set and remove are no-ops', () =>
			Effect.gen(function* () {
				const adapter = CacheAdapter.memory();
				yield* adapter.set(
					'key',
					{ value: 'val', storedAt: 0 },
					Duration.minutes(5),
				);
				yield* adapter.remove('key');
				yield* adapter.removeAll;
				// Should not throw
				const result = yield* adapter.get('key');
				expect(Option.isNone(result)).toBe(true);
			}),
		);

		it.effect('carries capacity', () =>
			Effect.sync(() => {
				const adapter = CacheAdapter.memory({ capacity: 100 });
				expect(adapter.capacity).toBe(100);
			}),
		);
	});

	describe('redis', () => {
		const makeInMemoryRedisClient = () => {
			const store = new Map<string, { value: string; expiresAt: number }>();
			return {
				client: {
					get: (key: string) =>
						Effect.sync(() => {
							const entry = store.get(key);
							if (!entry) return Option.none<string>();
							if (Date.now() > entry.expiresAt) {
								store.delete(key);
								return Option.none<string>();
							}
							return Option.some(entry.value);
						}),
					set: (key: string, value: string, ttlMs: number) =>
						Effect.sync(() => {
							store.set(key, { value, expiresAt: Date.now() + ttlMs });
						}),
					del: (key: string) =>
						Effect.sync(() => {
							store.delete(key);
						}),
				},
				store,
			};
		};

		it.effect('prefixes keys', () =>
			Effect.gen(function* () {
				const redis = makeInMemoryRedisClient();
				const adapter = CacheAdapter.redis<number, string>({
					client: redis.client,
					keyPrefix: 'user',
				});
				yield* adapter.set(
					123,
					{ value: 'alice', storedAt: 1000 },
					Duration.minutes(5),
				);
				expect(redis.store.has('user:123')).toBe(true);
			}),
		);

		it.effect('roundtrips entries', () =>
			Effect.gen(function* () {
				const redis = makeInMemoryRedisClient();
				const adapter = CacheAdapter.redis<number, string>({
					client: redis.client,
					keyPrefix: 'user',
				});
				yield* adapter.set(
					1,
					{ value: 'alice', storedAt: 1000 },
					Duration.minutes(5),
				);
				const result = yield* adapter.get(1);
				expect(Option.isSome(result)).toBe(true);
				if (Option.isSome(result)) {
					expect(result.value.value).toBe('alice');
					expect(result.value.storedAt).toBe(1000);
				}
			}),
		);

		it.effect('removes entries', () =>
			Effect.gen(function* () {
				const redis = makeInMemoryRedisClient();
				const adapter = CacheAdapter.redis<number, string>({
					client: redis.client,
					keyPrefix: 'user',
				});
				yield* adapter.set(
					1,
					{ value: 'alice', storedAt: 1000 },
					Duration.minutes(5),
				);
				yield* adapter.remove(1);
				const result = yield* adapter.get(1);
				expect(Option.isNone(result)).toBe(true);
			}),
		);
	});

	describe('tiered', () => {
		it.effect('falls through L1 to L2', () =>
			Effect.gen(function* () {
				const l1 = CacheAdapter.memory<string, string>();
				const l2Store = new Map<string, { value: string; storedAt: number }>();
				const l2: typeof l1 = {
					get: (key) => {
						const entry = l2Store.get(key);
						return Effect.succeed(
							entry !== undefined ? Option.some(entry) : Option.none(),
						);
					},
					set: (key, entry) =>
						Effect.sync(() => {
							l2Store.set(key, entry);
						}),
					remove: (key) =>
						Effect.sync(() => {
							l2Store.delete(key);
						}),
					removeAll: Effect.sync(() => {
						l2Store.clear();
					}),
				};

				const tiered = CacheAdapter.tiered(l1, l2);

				// Set in tiered (should write to both)
				yield* tiered.set(
					'k',
					{ value: 'v', storedAt: 1000 },
					Duration.minutes(5),
				);
				expect(l2Store.has('k')).toBe(true);

				// Get from tiered (L1 memory is no-op, so falls through to L2)
				const result = yield* tiered.get('k');
				expect(Option.isSome(result)).toBe(true);
				if (Option.isSome(result)) {
					expect(result.value.value).toBe('v');
				}

				// Remove from tiered
				yield* tiered.remove('k');
				expect(l2Store.has('k')).toBe(false);
			}),
		);

		it.effect('uses L1 capacity', () =>
			Effect.sync(() => {
				const l1 = CacheAdapter.memory<string, string>({ capacity: 50 });
				const l2 = CacheAdapter.memory<string, string>({ capacity: 1000 });
				const tiered = CacheAdapter.tiered(l1, l2);
				expect(tiered.capacity).toBe(50);
			}),
		);
	});
});
