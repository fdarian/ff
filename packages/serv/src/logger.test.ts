import { it } from '@effect/vitest';
import {
	Effect,
	Array as EffectArray,
	Logger as EffectLogger,
	Layer,
	LogLevel,
} from 'effect';
import { describe, expect } from 'vitest';
import { Logger } from './logger.js';

type CapturedEntry = {
	message: string;
	logLevel: LogLevel.LogLevel;
	annotations: Record<string, unknown>;
};

function makeTestLogger() {
	const entries: Array<CapturedEntry> = [];

	const logger = EffectLogger.make((options) => {
		const annotations: Record<string, unknown> = {};
		for (const [key, value] of options.annotations) {
			annotations[key] = value;
		}
		entries.push({
			message: EffectArray.ensure(options.message).join(' '),
			logLevel: options.logLevel,
			annotations,
		});
	});

	const layer = Layer.merge(
		EffectLogger.replace(EffectLogger.defaultLogger, logger),
		EffectLogger.minimumLogLevel(LogLevel.All),
	);

	return { entries, layer };
}

describe('Logger.sync', () => {
	it.effect('logs without annotations', () =>
		Effect.gen(function* () {
			const { entries, layer } = makeTestLogger();
			const log = yield* Logger.sync().pipe(Effect.provide(layer));
			log.info('hello');
			yield* Effect.yieldNow();
			expect(entries).toHaveLength(1);
			expect(entries[0].message).toBe('hello');
			expect(entries[0].annotations).toEqual({});
		}),
	);

	it.effect('initial annotations from sync()', () =>
		Effect.gen(function* () {
			const { entries, layer } = makeTestLogger();
			const log = yield* Logger.sync({ service: 'api' }).pipe(
				Effect.provide(layer),
			);
			log.info('started');
			yield* Effect.yieldNow();
			expect(entries[0].annotations).toEqual({ service: 'api' });
		}),
	);

	it.effect('.child() adds annotations', () =>
		Effect.gen(function* () {
			const { entries, layer } = makeTestLogger();
			const log = yield* Logger.sync().pipe(Effect.provide(layer));
			const child = log.child({ requestId: '123' });
			child.info('handled');
			yield* Effect.yieldNow();
			expect(entries[0].annotations).toEqual({ requestId: '123' });
		}),
	);

	it.effect('.child() merges parent + child annotations', () =>
		Effect.gen(function* () {
			const { entries, layer } = makeTestLogger();
			const log = yield* Logger.sync({ service: 'api' }).pipe(
				Effect.provide(layer),
			);
			const child = log.child({ requestId: '123' });
			child.info('handled');
			yield* Effect.yieldNow();
			expect(entries[0].annotations).toEqual({
				service: 'api',
				requestId: '123',
			});
		}),
	);

	it.effect('.child() overrides parent on key conflict', () =>
		Effect.gen(function* () {
			const { entries, layer } = makeTestLogger();
			const log = yield* Logger.sync({ env: 'dev' }).pipe(
				Effect.provide(layer),
			);
			const child = log.child({ env: 'prod' });
			child.info('test');
			yield* Effect.yieldNow();
			expect(entries[0].annotations).toEqual({ env: 'prod' });
		}),
	);

	it.effect('chained .child().child() accumulates annotations', () =>
		Effect.gen(function* () {
			const { entries, layer } = makeTestLogger();
			const log = yield* Logger.sync({ a: 1 }).pipe(Effect.provide(layer));
			const grandchild = log.child({ b: 2 }).child({ c: 3 });
			grandchild.info('deep');
			yield* Effect.yieldNow();
			expect(entries[0].annotations).toEqual({ a: 1, b: 2, c: 3 });
		}),
	);

	it.effect('parent unaffected by child creation', () =>
		Effect.gen(function* () {
			const { entries, layer } = makeTestLogger();
			const parent = yield* Logger.sync({ service: 'api' }).pipe(
				Effect.provide(layer),
			);
			parent.child({ requestId: '123' });
			parent.info('still parent');
			yield* Effect.yieldNow();
			expect(entries[0].annotations).toEqual({ service: 'api' });
		}),
	);

	it.effect('all log levels work on child', () =>
		Effect.gen(function* () {
			const { entries, layer } = makeTestLogger();
			const log = yield* Logger.sync().pipe(Effect.provide(layer));
			const child = log.child({ ctx: 'test' });
			child.info('i');
			child.debug('d');
			child.warn('w');
			child.error('e');
			yield* Effect.yieldNow();
			expect(entries).toHaveLength(4);
			expect(entries[0].logLevel).toBe(LogLevel.Info);
			expect(entries[1].logLevel).toBe(LogLevel.Debug);
			expect(entries[2].logLevel).toBe(LogLevel.Warning);
			expect(entries[3].logLevel).toBe(LogLevel.Error);
			for (const entry of entries) {
				expect(entry.annotations).toEqual({ ctx: 'test' });
			}
		}),
	);

	it.effect('per-call attributes merge with persistent annotations', () =>
		Effect.gen(function* () {
			const { entries, layer } = makeTestLogger();
			const log = yield* Logger.sync({ service: 'api' }).pipe(
				Effect.provide(layer),
			);
			const child = log.child({ requestId: '123' });
			child.info({ extra: 'val' }, 'with attrs');
			yield* Effect.yieldNow();
			expect(entries[0].message).toBe('with attrs');
			expect(entries[0].annotations).toEqual({
				service: 'api',
				requestId: '123',
				extra: 'val',
			});
		}),
	);
});
