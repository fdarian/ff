import * as BunContext from '@effect/platform-bun/BunContext';
import { describe, expect, layer } from '@effect/vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { Effect, Layer } from 'effect';
import { expectTypeOf } from 'vitest';
import { createDatabase, DrizzleError } from './index.js';

const users = pgTable('users', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
});

const schema = { users };

export class TestDb extends Effect.Service<TestDb>()('TestDb', {
	accessors: true,
	scoped: Effect.gen(function* () {
		const db = new PGlite();
		yield* Effect.promise(async () => {
			await db.query('DROP TABLE IF EXISTS users');
			await db.query(
				'CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL)',
			);
		});

		const dump = yield* Effect.promise(() => db.dumpDataDir());

		return {
			get: () =>
				Effect.gen(function* () {
					const db = new PGlite('memory://', { loadDataDir: dump });
					return drizzle(db, { schema });
				}),
		};
	}),
}) {}

layer(Layer.mergeAll(BunContext.layer, TestDb.Default))((it) => {
	describe('db', () => {
		it.scoped('wraps promises and returns correct data', () =>
			Effect.gen(function* () {
				const testDb = yield* TestDb.get();
				yield* Effect.promise(() =>
					testDb.insert(users).values({ id: '1', name: 'Alice' }),
				);

				const database = createDatabase(Effect.succeed(testDb));

				const result = yield* database
					.db((d) => d.select().from(users))
					.pipe(Effect.provide(database.layer));

				expect(result).toEqual([{ id: '1', name: 'Alice' }]);
			}),
		);

		it.scoped('surfaces errors as DrizzleError', () =>
			Effect.gen(function* () {
				const testDb = yield* TestDb.get();

				const database = createDatabase(Effect.succeed(testDb));

				const result = yield* database
					.db(() => Promise.reject(new Error('DB failure')))
					.pipe(Effect.provide(database.layer), Effect.flip);

				expect(result).toBeInstanceOf(DrizzleError);
				expect(result.message).toBe('Database operation failed');
				expect(result.cause).toBeInstanceOf(Error);
				expect((result.cause as Error).message).toBe('DB failure');
			}),
		);
	});

	describe('withTransaction', () => {
		it.scoped('provides transaction context to nested db calls', () =>
			Effect.gen(function* () {
				const testDb = yield* TestDb.get();

				const database = createDatabase(Effect.succeed(testDb));

				yield* Effect.gen(function* () {
					const ok = 'ok' as const;
					const txResult = yield* database.withTransaction(
						Effect.gen(function* () {
							yield* database.db((d) =>
								d.insert(users).values({ id: '1', name: 'Bob' }),
							);
							yield* database.db((d) =>
								d.insert(users).values({ id: '2', name: 'Carol' }),
							);
							return ok;
						}),
					);
					expectTypeOf(txResult).toEqualTypeOf<typeof ok>();

					const result = yield* database.db((d) => d.select().from(users));
					expect(result).toHaveLength(2);
					expect(result).toEqual([
						{ id: '1', name: 'Bob' },
						{ id: '2', name: 'Carol' },
					]);
				}).pipe(Effect.provide(database.layer));
			}),
		);

		it.scoped('rolls back on error', () =>
			Effect.gen(function* () {
				const testDb = yield* TestDb.get();

				const database = createDatabase(Effect.succeed(testDb));

				const result = yield* Effect.gen(function* () {
					const txResult = yield* database
						.withTransaction(
							Effect.gen(function* () {
								yield* database.db((d) =>
									d.insert(users).values({ id: '1', name: 'Dave' }),
								);

								yield* database.tx((d) =>
									d.insert(users).values({ id: '2', name: 'Bob' }),
								);
								return yield* Effect.fail(new Error('Intentional failure'));
							}),
						)
						.pipe(Effect.either);

					expect(txResult._tag).toBe('Left');

					return yield* database.db((d) => d.select().from(users));
				}).pipe(Effect.provide(database.layer));

				expect(result).toEqual([]);
			}),
		);
	});

	describe('multiple database', () => {
		it.scoped(
			'allows creating multiple database instances with different tagIds',
			() =>
				Effect.gen(function* () {
					const testDb = yield* TestDb;
					const database1 = createDatabase(testDb.get());

					const database2Identifier = 'custom-db' as const;
					const database2 = createDatabase(testDb.get(), {
						tagId: database2Identifier,
					});

					const firstDbEffect = Effect.gen(function* () {
						yield* database1.db((d) =>
							d.insert(users).values({ id: '1', name: 'Eve' }),
						);
					});
					expectTypeOf(firstDbEffect).toEqualTypeOf<
						Effect.Effect<
							void,
							DrizzleError,
							typeof database1.Drizzle.Identifier
						>
					>();

					const secondDbEffect = Effect.gen(function* () {
						yield* database2.db((d) =>
							d.insert(users).values({ id: '2', name: 'Frank' }),
						);
					});
					expectTypeOf(secondDbEffect).toEqualTypeOf<
						Effect.Effect<void, DrizzleError, typeof database2Identifier>
					>();

					const main = Effect.gen(function* () {
						yield* firstDbEffect;
						yield* secondDbEffect;

						yield* database1
							.db((d) => d.select().from(users))
							.pipe(
								Effect.flatMap((result) =>
									Effect.sync(() => {
										expect(result).toEqual([{ id: '1', name: 'Eve' }]);
									}),
								),
							);

						yield* database2
							.db((d) => d.select().from(users))
							.pipe(
								Effect.flatMap((result) =>
									Effect.sync(() => {
										expect(result).toEqual([{ id: '2', name: 'Frank' }]);
									}),
								),
							);
					}).pipe(
						Effect.provide(database1.layer),
						Effect.provide(database2.layer),
					);

					yield* main;
					expectTypeOf(main).toEqualTypeOf<Effect.Effect<void, DrizzleError>>();
				}),
		);
	});
});
