import { FetchHttpClient, HttpClient } from '@effect/platform';
import * as BunContext from '@effect/platform-bun/BunContext';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { Effect, Layer } from 'effect';
import * as S from 'effect/Schema';
import { createInngest } from 'ff-effect/for/inngest';
import { basicHandler, createFetchHandler, Logger } from 'ff-serv';
import * as InngestSdk from 'inngest';

/**
 * # How to use
 * 1. Start inngest cli `npx --ignore-scripts=false inngest-cli@latest dev`
 * 2. Run this
 **/

class Nothing extends Effect.Service<Nothing>()('nothing', {
	effect: Effect.gen(function* () {
		return {
			say: (message: string) => Logger.info(message),
		};
	}),
}) {}

const Inngest = createInngest(
	Effect.succeed(
		new InngestSdk.Inngest({
			id: 'dev',
			schemas: new InngestSdk.EventSchemas().fromSchema({
				'say-hello': S.standardSchemaV1(
					S.Struct({
						message: S.String,
					}),
				),
			}),
		}),
	),
);

const program = Effect.gen(function* () {
	const helloWorld = yield* Inngest.createFunction(
		{ id: 'asdf' },
		{ event: 'say-hello' },
		({ event, step, runId }) =>
			Effect.gen(function* () {
				yield* Logger.info('Workflow starting');

				yield* step.run('one', () =>
					Effect.gen(function* () {
						const svc = yield* Nothing;
						yield* svc.say(`Hello ${event.data.message}`);
					}),
				);
			}).pipe(Effect.annotateLogs({ runId })),
	);

	const server = Bun.serve({
		fetch: yield* createFetchHandler(
			[
				basicHandler(
					'/api/inngest',
					yield* Inngest.fetchHandler({ functions: [helloWorld] }),
				),
				basicHandler('/invoke', () =>
					Effect.gen(function* () {
						yield* Inngest.send({
							name: 'say-hello',
							data: { message: 'world' },
						});
						return new Response('ok');
					}),
				),
			],
			{ debug: false },
		),
	});
	yield* Effect.addFinalizer(() => Effect.promise(() => server.stop()));
	yield* Logger.info(`Server started in port ${server.port}`);

	yield* HttpClient.put(`http://localhost:${server.port}/api/inngest`);
	yield* Logger.info('Called inngest put');

	yield* Effect.never;
});

BunRuntime.runMain(
	program.pipe(
		Effect.provide(
			Layer.mergeAll(
				BunContext.layer,
				Nothing.Default,
				Inngest.layer,
				Layer.scope,
				FetchHttpClient.layer,
			),
		),
	),
);
