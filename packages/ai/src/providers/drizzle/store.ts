import { drizzle } from 'drizzle-orm/postgres-js';
import { Context, Effect, Layer } from 'effect';
import type postgres from 'postgres';
import { StoreError } from '../../common/store';

export function createClient(conn: postgres.Sql) {
	return drizzle(conn);
}
type Client = ReturnType<typeof createClient>;

export function createCaller<U>(client: U) {
	return <T>(fn: (db: U) => Promise<T>): Effect.Effect<T, StoreError> =>
		Effect.tryPromise({
			try: () => fn(client),
			catch: (cause) =>
				new StoreError('Failed to call database', {
					cause,
				}),
		});
}

export class StoreDrizzle extends Context.Tag('ff-ai/drizzle/store')<
	StoreDrizzle,
	{
		call: <T>(
			fn: (
				db: Client | Parameters<Parameters<Client['transaction']>[0]>[0],
			) => Promise<T>,
		) => Effect.Effect<T, StoreError>;
	}
>() {
	static createLayer = (conn: postgres.Sql) =>
		Layer.succeed(StoreDrizzle, {
			call: createCaller(createClient(conn)),
		});
}
