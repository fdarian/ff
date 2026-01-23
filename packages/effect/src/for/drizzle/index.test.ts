import { randomUUID } from 'node:crypto';
import { FileSystem, Path } from '@effect/platform';
import * as BunContext from '@effect/platform-bun/BunContext';
import { describe, expect, layer } from '@effect/vitest';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { Effect } from 'effect';
import { expectTypeOf } from 'vitest';
import { createDatabase, DrizzleError } from './index.js';

const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
});

const schema = { users };

const createTestDb = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;

	const tmpDir = yield* fs.makeTempDirectoryScoped();
	const dbPath = path.join(tmpDir, `test-${randomUUID()}.db`);

	const client = createClient({ url: `file:${dbPath}` });
	return drizzle(client, { schema });
});

const setupTable = (testDb: ReturnType<typeof drizzle>) =>
	Effect.gen(function* () {
		yield* Effect.promise(() => testDb.run(sql`DROP TABLE IF EXISTS users`));
		yield* Effect.promise(() =>
			testDb.run(
				sql`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
			),
		);
	});

layer(BunContext.layer)((it) => {
	describe('db', () => {
		it.scoped('wraps promises and returns correct data', () =>
			Effect.gen(function* () {
				const testDb = yield* createTestDb;
				yield* setupTable(testDb);
				yield* Effect.promise(() =>
					testDb.insert(users).values({ id: '1', name: 'Alice' }),
				);

				const database = createDatabase('test/db', Effect.succeed(testDb));

				const result = yield* database
					.db((client) => client.select().from(users))
					.pipe(Effect.provide(database.layer));

				expect(result).toEqual([{ id: '1', name: 'Alice' }]);
			}),
		);

		it.scoped('surfaces errors as DrizzleError', () =>
			Effect.gen(function* () {
				const testDb = yield* createTestDb;

				const database = createDatabase(
					'test/db-error',
					Effect.succeed(testDb),
				);

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
				const testDb = yield* createTestDb;
				yield* setupTable(testDb);

				const database = createDatabase('test/db-tx', Effect.succeed(testDb));

				yield* Effect.gen(function* () {
					const ok = 'ok' as const;
					const txResult = yield* database.withTransaction(
						Effect.gen(function* () {
							yield* database.db((client) =>
								client.insert(users).values({ id: '1', name: 'Bob' }),
							);
							yield* database.db((client) =>
								client.insert(users).values({ id: '2', name: 'Carol' }),
							);
							return ok;
						}),
					);
					expectTypeOf(txResult).toEqualTypeOf<typeof ok>();

					const result = yield* database.db((client) =>
						client.select().from(users),
					);
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
				const testDb = yield* createTestDb;
				yield* setupTable(testDb);

				const database = createDatabase(
					'test/db-rollback',
					Effect.succeed(testDb),
				);

				const result = yield* Effect.gen(function* () {
					const txResult = yield* database
						.withTransaction(
							Effect.gen(function* () {
								yield* database.db((client) =>
									client.insert(users).values({ id: '1', name: 'Dave' }),
								);
								return yield* Effect.fail(new Error('Intentional failure'));
							}),
						)
						.pipe(Effect.either);

					expect(txResult._tag).toBe('Left');

					return yield* database.db((client) => client.select().from(users));
				}).pipe(Effect.provide(database.layer));

				expect(result).toEqual([]);
			}),
		);
	});
});
