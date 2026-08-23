import { Effect } from 'effect';
import { createDrizzleStoreLayer } from 'ff-ai/providers/drizzle';
import postgres from 'postgres';
import { query } from './examples/conversation';

const main = Effect.gen(function* () {
	yield* query;
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const MainLayer = createDrizzleStoreLayer(postgres(databaseUrl));

Effect.runPromise(main.pipe(Effect.provide(MainLayer)));
