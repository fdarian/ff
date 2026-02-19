import { it } from '@effect/vitest';
import { Clock, Duration, Effect, Option, Ref, TestClock } from 'effect';
import { describe, expect } from 'vitest';
import type { CacheAdapter, CacheEntry } from './adapter.js';
import { Cache } from './cache.js';

function makeTestAdapter<Key, Value>() {
	const store = new Map<string, CacheEntry<Value>>();
	const adapter: CacheAdapter<Key, Value> = {
		get: (key) =>
			Effect.sync(() => {
				const entry = store.get(JSON.stringify(key));
				return entry ? Option.some(entry) : Option.none();
			}),
		set: (key, entry, _ttl) =>
			Effect.sync(() => {
				store.set(JSON.stringify(key), entry);
			}),
		remove: (key) =>
			Effect.sync(() => {
				store.delete(JSON.stringify(key));
			}),
		removeAll: Effect.sync(() => {
			store.clear();
		}),
	};
	return { adapter, store };
}

describe('Cache', () => {
	describe('core', () => {
		it.effect('calls lookup and returns value', () =>
			Effect.gen(function* () {
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					lookup: (id: number) => Effect.succeed(`user-${id}`),
				});
				const value = yield* cache.get(1);
				expect(value).toBe('user-1');
			}),
		);

		it.effect('caches lookup result', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					lookup: (id: number) =>
						Ref.update(callCount, (n) => n + 1).pipe(
							Effect.map(() => `user-${id}`),
						),
				});
				yield* cache.get(1);
				yield* cache.get(1);
				expect(yield* Ref.get(callCount)).toBe(1);
			}),
		);

		it.effect('calls lookup for different keys', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					lookup: (id: number) =>
						Ref.update(callCount, (n) => n + 1).pipe(
							Effect.map(() => `user-${id}`),
						),
				});
				yield* cache.get(1);
				yield* cache.get(2);
				expect(yield* Ref.get(callCount)).toBe(2);
			}),
		);

		it.effect('expires entries after TTL', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					lookup: (id: number) =>
						Ref.update(callCount, (n) => n + 1).pipe(
							Effect.map(() => `user-${id}`),
						),
				});
				yield* cache.get(1);
				yield* TestClock.adjust(Duration.minutes(6));
				yield* cache.get(1);
				expect(yield* Ref.get(callCount)).toBe(2);
			}),
		);

		it.effect('propagates lookup errors', () =>
			Effect.gen(function* () {
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					lookup: (_id: number) => Effect.fail('lookup-error' as const),
				});
				const result = yield* cache.get(1).pipe(Effect.either);
				expect(result._tag).toBe('Left');
			}),
		);

		it.effect('invalidates a single key', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					lookup: (id: number) =>
						Ref.update(callCount, (n) => n + 1).pipe(
							Effect.map(() => `user-${id}`),
						),
				});
				yield* cache.get(1);
				yield* cache.invalidate(1);
				yield* cache.get(1);
				expect(yield* Ref.get(callCount)).toBe(2);
			}),
		);

		it.effect('invalidates all keys', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					lookup: (id: number) =>
						Ref.update(callCount, (n) => n + 1).pipe(
							Effect.map(() => `user-${id}`),
						),
				});
				yield* cache.get(1);
				yield* cache.get(2);
				yield* cache.invalidateAll;
				yield* cache.get(1);
				yield* cache.get(2);
				expect(yield* Ref.get(callCount)).toBe(4);
			}),
		);
	});

	describe('SWR', () => {
		it.effect('returns stale value within SWR window', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					swr: Duration.minutes(10),
					lookup: (id: number) =>
						Effect.gen(function* () {
							yield* Ref.update(callCount, (n) => n + 1);
							const count = yield* Ref.get(callCount);
							return `user-${id}-v${count}`;
						}),
				});

				const v1 = yield* cache.get(1);
				expect(v1).toBe('user-1-v1');

				// Advance past TTL but within SWR window
				yield* TestClock.adjust(Duration.minutes(7));
				const v2 = yield* cache.get(1);
				// Should return stale value immediately
				expect(v2).toBe('user-1-v1');
			}),
		);

		it.effect('triggers background refresh after stale read', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					swr: Duration.minutes(10),
					lookup: (id: number) =>
						Effect.gen(function* () {
							yield* Ref.update(callCount, (n) => n + 1);
							const count = yield* Ref.get(callCount);
							return `user-${id}-v${count}`;
						}),
				});

				yield* cache.get(1);
				yield* TestClock.adjust(Duration.minutes(7));

				// This returns stale but triggers background refresh
				yield* cache.get(1);
				// Let the background fiber run
				yield* Effect.yieldNow();
				yield* TestClock.adjust(Duration.zero);
				yield* Effect.yieldNow();

				// Background refresh should have been triggered
				expect(yield* Ref.get(callCount)).toBe(2);
			}),
		);

		it.effect('serves fresh value after background refresh', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					swr: Duration.minutes(10),
					lookup: (id: number) =>
						Effect.gen(function* () {
							yield* Ref.update(callCount, (n) => n + 1);
							const count = yield* Ref.get(callCount);
							return `user-${id}-v${count}`;
						}),
				});

				yield* cache.get(1);
				yield* TestClock.adjust(Duration.minutes(7));
				yield* cache.get(1);
				yield* Effect.yieldNow();
				yield* TestClock.adjust(Duration.zero);
				yield* Effect.yieldNow();

				// Next get should return the refreshed value
				const v3 = yield* cache.get(1);
				expect(v3).toBe('user-1-v2');
			}),
		);

		it.effect('does not serve stale when swr is not set', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					lookup: (id: number) =>
						Effect.gen(function* () {
							yield* Ref.update(callCount, (n) => n + 1);
							const count = yield* Ref.get(callCount);
							return `user-${id}-v${count}`;
						}),
				});

				yield* cache.get(1);
				yield* TestClock.adjust(Duration.minutes(6));

				// No SWR — should block and call lookup again
				const v2 = yield* cache.get(1);
				expect(v2).toBe('user-1-v2');
				expect(yield* Ref.get(callCount)).toBe(2);
			}),
		);

		it.effect('blocks for fresh value past SWR window', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					swr: Duration.minutes(10),
					lookup: (id: number) =>
						Effect.gen(function* () {
							yield* Ref.update(callCount, (n) => n + 1);
							const count = yield* Ref.get(callCount);
							return `user-${id}-v${count}`;
						}),
				});

				yield* cache.get(1);
				// Advance past TTL + SWR window
				yield* TestClock.adjust(Duration.minutes(16));
				const v2 = yield* cache.get(1);
				expect(v2).toBe('user-1-v2');
				expect(yield* Ref.get(callCount)).toBe(2);
			}),
		);
	});

	describe('dynamic TTL', () => {
		it.effect('Cache.entry overrides TTL', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					lookup: (id: number) =>
						Effect.gen(function* () {
							yield* Ref.update(callCount, (n) => n + 1);
							const count = yield* Ref.get(callCount);
							return Cache.entry(`user-${id}-v${count}`, {
								ttl: Duration.hours(1),
							});
						}),
				});

				yield* cache.get(1);
				// Advance past default TTL (5m) but within custom TTL (1h)
				yield* TestClock.adjust(Duration.minutes(30));
				yield* cache.get(1);
				// Should still be cached — custom TTL is 1h
				expect(yield* Ref.get(callCount)).toBe(1);
			}),
		);

		it.effect('Cache.entry overrides SWR', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					swr: Duration.minutes(10),
					lookup: (id: number) =>
						Effect.gen(function* () {
							yield* Ref.update(callCount, (n) => n + 1);
							const count = yield* Ref.get(callCount);
							return Cache.entry(`user-${id}-v${count}`, {
								ttl: Duration.minutes(1),
								swr: Duration.minutes(2),
							});
						}),
				});

				yield* cache.get(1);
				// Advance past custom TTL (1m) but within custom SWR (1m + 2m = 3m)
				yield* TestClock.adjust(Duration.minutes(2));
				const stale = yield* cache.get(1);
				// Should return stale value (SWR active)
				expect(stale).toBe('user-1-v1');
			}),
		);

		it.effect('plain return uses default TTL/SWR', () =>
			Effect.gen(function* () {
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					swr: Duration.minutes(10),
					lookup: (id: number) =>
						Ref.update(callCount, (n) => n + 1).pipe(
							Effect.map(() => `user-${id}`),
						),
				});

				yield* cache.get(1);
				// Within default TTL
				yield* TestClock.adjust(Duration.minutes(3));
				yield* cache.get(1);
				expect(yield* Ref.get(callCount)).toBe(1);

				// Past default TTL but within SWR
				yield* TestClock.adjust(Duration.minutes(4));
				const stale = yield* cache.get(1);
				expect(stale).toBe('user-1');
			}),
		);

		it.effect('mixed entries use their own TTL', () =>
			Effect.gen(function* () {
				const callCountA = yield* Ref.make(0);
				const callCountB = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					lookup: (id: string) =>
						Effect.gen(function* () {
							if (id === 'a') {
								yield* Ref.update(callCountA, (n) => n + 1);
								return `val-a`;
							}
							yield* Ref.update(callCountB, (n) => n + 1);
							return Cache.entry(`val-b`, { ttl: Duration.hours(1) });
						}),
				});

				yield* cache.get('a');
				yield* cache.get('b');

				// Advance past default TTL but within custom TTL
				yield* TestClock.adjust(Duration.minutes(6));

				yield* cache.get('a'); // should re-fetch (past 5m TTL)
				yield* cache.get('b'); // should still be cached (within 1h TTL)

				expect(yield* Ref.get(callCountA)).toBe(2);
				expect(yield* Ref.get(callCountB)).toBe(1);
			}),
		);
	});

	describe('adapter', () => {
		it.effect('uses adapter data on cold start without calling lookup', () =>
			Effect.gen(function* () {
				const { adapter, store } = makeTestAdapter<number, string>();
				const now = yield* Clock.currentTimeMillis;
				store.set(JSON.stringify(1), { value: 'cached-user-1', storedAt: now });

				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					lookup: (id: number) =>
						Ref.update(callCount, (n) => n + 1).pipe(
							Effect.map(() => `user-${id}`),
						),
					adapter,
				});

				const value = yield* cache.get(1);
				expect(value).toBe('cached-user-1');
				expect(yield* Ref.get(callCount)).toBe(0);
			}),
		);

		it.effect(
			'SWR refresh calls lookup instead of short-circuiting with adapter',
			() =>
				Effect.gen(function* () {
					const { adapter } = makeTestAdapter<number, string>();
					const callCount = yield* Ref.make(0);
					const cache = yield* Cache.make({
						ttl: Duration.minutes(5),
						swr: Duration.minutes(10),
						lookup: (id: number) =>
							Effect.gen(function* () {
								yield* Ref.update(callCount, (n) => n + 1);
								const count = yield* Ref.get(callCount);
								return `user-${id}-v${count}`;
							}),
						adapter,
					});

					yield* cache.get(1);
					yield* TestClock.adjust(Duration.minutes(7));

					// Trigger SWR refresh
					yield* cache.get(1);
					yield* Effect.yieldNow();
					yield* TestClock.adjust(Duration.zero);
					yield* Effect.yieldNow();

					// lookup must have been called twice (initial + refresh)
					expect(yield* Ref.get(callCount)).toBe(2);
				}),
		);

		it.effect('adapter updated after SWR refresh', () =>
			Effect.gen(function* () {
				const { adapter, store } = makeTestAdapter<number, string>();
				const callCount = yield* Ref.make(0);
				const cache = yield* Cache.make({
					ttl: Duration.minutes(5),
					swr: Duration.minutes(10),
					lookup: (id: number) =>
						Effect.gen(function* () {
							yield* Ref.update(callCount, (n) => n + 1);
							const count = yield* Ref.get(callCount);
							return `user-${id}-v${count}`;
						}),
					adapter,
				});

				yield* cache.get(1);
				yield* TestClock.adjust(Duration.minutes(7));

				yield* cache.get(1);
				yield* Effect.yieldNow();
				yield* TestClock.adjust(Duration.zero);
				yield* Effect.yieldNow();

				const entry = store.get(JSON.stringify(1));
				expect(entry?.value).toBe('user-1-v2');
			}),
		);
	});
});
