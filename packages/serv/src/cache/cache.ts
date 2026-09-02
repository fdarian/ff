import {
	Clock,
	Duration,
	Effect,
	Cache as EffectCache,
	Exit,
	Option,
} from 'effect';
import type { CacheAdapter, CacheEntry } from './adapter.js';

// Bundles value with resolved TTL/SWR and the time it was loaded, so the SWR check at read
// time can compute staleness itself — v4 dropped Cache.entryStats/loadedMillis, so the
// load timestamp now travels with the cached value instead of coming from cache metadata
type CacheValue<Value> = {
	readonly value: Value;
	readonly ttlMs: number;
	readonly swrMs: number;
	readonly loadedAt: number;
};

export type CacheInstance<Key, Value, Error> = {
	readonly get: (key: Key) => Effect.Effect<Value, Error>;
	readonly invalidate: (key: Key) => Effect.Effect<void>;
	readonly invalidateAll: Effect.Effect<void>;
};

export namespace Cache {
	export type Entry<Value> = {
		readonly _tag: 'CacheEntry';
		readonly value: Value;
		readonly ttl: Duration.Input;
		readonly swr?: Duration.Input;
	};

	export function entry<Value>(
		value: Value,
		opts: { ttl: Duration.Input; swr?: Duration.Input },
	): Entry<Value> {
		return { _tag: 'CacheEntry', value, ttl: opts.ttl, swr: opts.swr };
	}

	export type LookupResult<Value> = Value | Entry<Value>;

	export function make<Key, Value, Error = never, R = never>(opts: {
		ttl: Duration.Input;
		swr?: Duration.Input;
		lookup: (key: Key) => Effect.Effect<LookupResult<Value>, Error, R>;
		adapter?: CacheAdapter<Key, Value>;
	}): Effect.Effect<CacheInstance<Key, Value, Error>, never, R> {
		return Effect.gen(function* () {
			const adapter = opts.adapter;
			const defaultTtlMs = Duration.toMillis(opts.ttl);
			const defaultSwrMs = opts.swr ? Duration.toMillis(opts.swr) : 0;
			const capacity = adapter?.capacity ?? Number.MAX_SAFE_INTEGER;

			// Safe without synchronization — no yield points between has() and add() (cooperative scheduling)
			const refreshingKeys = new Set<string>();

			// makeWith takes the lookup as its own argument in v4 — the lookup stores CacheValue
			// so timeToLive can extract the total window (ttl + swr) from the exit result
			const inner = yield* EffectCache.makeWith(
				(key: Key) =>
					Effect.gen(function* () {
						const isRefreshing = refreshingKeys.has(JSON.stringify(key));

						if (adapter && !isRefreshing) {
							const cached = yield* adapter.get(key);
							if (Option.isSome(cached)) {
								const now = yield* Clock.currentTimeMillis;
								const age = now - cached.value.storedAt;
								const totalWindow = defaultTtlMs + defaultSwrMs;
								if (age < totalWindow) {
									// Adjust remaining TTL/SWR for elapsed age so SWR triggers at correct real-world
									// time, and treat "now" as the load time so the adjusted ttlMs stays consistent
									return {
										value: cached.value.value,
										ttlMs: Math.max(0, defaultTtlMs - age),
										swrMs: Math.max(
											0,
											defaultSwrMs - Math.max(0, age - defaultTtlMs),
										),
										loadedAt: now,
									} satisfies CacheValue<Value>;
								}
							}
						}

						const result = yield* opts.lookup(key);
						const now = yield* Clock.currentTimeMillis;
						const cv = resolveLookupResult(
							result,
							defaultTtlMs,
							defaultSwrMs,
							now,
						);

						if (adapter) {
							yield* adapter.set(
								key,
								{ value: cv.value, storedAt: now } satisfies CacheEntry<Value>,
								Duration.millis(cv.ttlMs + cv.swrMs),
							);
						}

						return cv;
					}),
				{
					capacity,
					timeToLive: (exit) => {
						if (Exit.isSuccess(exit)) {
							return Duration.millis(exit.value.ttlMs + exit.value.swrMs);
						}
						return Duration.zero;
					},
				},
			);

			const get = (key: Key) =>
				Effect.gen(function* () {
					const cv = yield* EffectCache.get(inner, key);

					if (cv.swrMs > 0) {
						const now = yield* Clock.currentTimeMillis;
						const age = now - cv.loadedAt;
						if (age > cv.ttlMs) {
							const keyStr = JSON.stringify(key);
							if (!refreshingKeys.has(keyStr)) {
								refreshingKeys.add(keyStr);
								// refresh() recomputes without invalidating, so stale value remains available during recomputation
								yield* Effect.forkDetach(
									EffectCache.refresh(inner, key).pipe(
										Effect.ensuring(
											Effect.sync(() => {
												refreshingKeys.delete(keyStr);
											}),
										),
										Effect.ignore,
									),
								);
							}
						}
					}

					return cv.value;
				});

			const invalidate = (key: Key) =>
				Effect.gen(function* () {
					yield* EffectCache.invalidate(inner, key);
					if (adapter) yield* adapter.remove(key);
				});

			const invalidateAll = Effect.gen(function* () {
				yield* EffectCache.invalidateAll(inner);
				if (adapter) yield* adapter.removeAll;
			});

			return { get, invalidate, invalidateAll } satisfies CacheInstance<
				Key,
				Value,
				Error
			>;
		});
	}
}

function isCacheEntry<Value>(
	result: Cache.LookupResult<Value>,
): result is Cache.Entry<Value> {
	return (
		typeof result === 'object' &&
		result !== null &&
		'_tag' in result &&
		(result as Cache.Entry<Value>)._tag === 'CacheEntry'
	);
}

function resolveLookupResult<Value>(
	result: Cache.LookupResult<Value>,
	defaultTtlMs: number,
	defaultSwrMs: number,
	loadedAt: number,
): CacheValue<Value> {
	if (isCacheEntry(result)) {
		return {
			value: result.value,
			ttlMs: Duration.toMillis(result.ttl),
			swrMs: result.swr ? Duration.toMillis(result.swr) : 0,
			loadedAt,
		};
	}
	return { value: result, ttlMs: defaultTtlMs, swrMs: defaultSwrMs, loadedAt };
}
