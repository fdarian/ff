import { Effect } from 'effect';
import { createDrizzleStoreLayer } from 'ff-ai/providers/drizzle';
import postgres from 'postgres';
import { query } from './examples/conversation';

const main = Effect.gen(function* () {
	yield* query;
});

const MainLayer = createDrizzleStoreLayer(postgres(process.env.DATABASE_URL!));

Effect.runPromise(main.pipe(Effect.provide(MainLayer)));
