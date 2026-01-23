import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createDatabase, DrizzleError } from './index.js';

const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
});

const schema = { users };

function createTestDb() {
	const dbPath = join(tmpdir(), `test-${randomUUID()}.db`);
	const client = createClient({ url: `file:${dbPath}` });
	return drizzle(client, { schema });
}

async function setupTable(testDb: ReturnType<typeof createTestDb>) {
	await testDb.run(sql`DROP TABLE IF EXISTS users`);
	await testDb.run(
		sql`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL)`,
	);
}

describe('db', () => {
	it('wraps promises and returns correct data', async () => {
		const testDb = createTestDb();
		await setupTable(testDb);
		await testDb.insert(users).values({ id: '1', name: 'Alice' });

		const { db, layer } = createDatabase('test/db', Effect.succeed(testDb));

		const result = await Effect.gen(function* () {
			return yield* db((client) => client.select().from(users));
		}).pipe(Effect.provide(layer), Effect.runPromise);

		expect(result).toEqual([{ id: '1', name: 'Alice' }]);
	});

	it('surfaces errors as DrizzleError', async () => {
		const testDb = createTestDb();

		const { db, layer } = createDatabase(
			'test/db-error',
			Effect.succeed(testDb),
		);

		const result = await Effect.gen(function* () {
			return yield* db(() => Promise.reject(new Error('DB failure')));
		}).pipe(Effect.provide(layer), Effect.flip, Effect.runPromise);

		expect(result).toBeInstanceOf(DrizzleError);
		expect(result.message).toBe('Database operation failed');
		expect(result.cause).toBeInstanceOf(Error);
		expect((result.cause as Error).message).toBe('DB failure');
	});
});

describe('withTransaction', () => {
	it('provides transaction context to nested db calls', async () => {
		const testDb = createTestDb();
		await setupTable(testDb);

		const { db, withTransaction, layer } = createDatabase(
			'test/db-tx',
			Effect.succeed(testDb),
		);

		await Effect.gen(function* () {
			const ok = 'ok' as const;
			const txResult = yield* withTransaction(
				Effect.gen(function* () {
					yield* db((client) =>
						client.insert(users).values({ id: '1', name: 'Bob' }),
					);
					yield* db((client) =>
						client.insert(users).values({ id: '2', name: 'Carol' }),
					);
					return ok;
				}),
			);
			expectTypeOf(txResult).toEqualTypeOf<typeof ok>();

			const result = yield* db((client) => client.select().from(users));
			expect(result).toHaveLength(2);
			expect(result).toEqual([
				{ id: '1', name: 'Bob' },
				{ id: '2', name: 'Carol' },
			]);
		}).pipe(Effect.provide(layer), Effect.runPromise);
	});

	it('rolls back on error', async () => {
		const testDb = createTestDb();
		await setupTable(testDb);

		const { db, withTransaction, layer } = createDatabase(
			'test/db-rollback',
			Effect.succeed(testDb),
		);

		const result = await Effect.gen(function* () {
			const txResult = yield* withTransaction(
				Effect.gen(function* () {
					yield* db((client) =>
						client.insert(users).values({ id: '1', name: 'Dave' }),
					);
					return yield* Effect.fail(new Error('Intentional failure'));
				}),
			).pipe(Effect.either);

			expect(txResult._tag).toBe('Left');

			return yield* db((client) => client.select().from(users));
		}).pipe(Effect.provide(layer), Effect.runPromise);

		expect(result).toEqual([]);
	});
});
