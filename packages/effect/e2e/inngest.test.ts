import { FetchHttpClient, HttpClient } from '@effect/platform';
import { it } from '@effect/vitest';
import { Effect, Schedule } from 'effect';
import { Inngest as InngestSdk } from 'inngest';
import { describe, expect } from 'vitest';
import { createInngest } from '../src/for/inngest';

const INNGEST_DEV_URL = 'http://localhost:8288';

function poll(predicate: () => boolean, interval: number, timeout: number) {
	return Effect.suspend(() =>
		predicate() ? Effect.void : Effect.fail(new Error('Condition not met')),
	).pipe(Effect.retry(Schedule.spaced(interval)), Effect.timeout(timeout));
}

const devServerRunning = await Effect.runPromise(
	HttpClient.get(INNGEST_DEV_URL).pipe(
		Effect.map((res) => res.status < 500),
		Effect.orElseSucceed(() => false),
		Effect.provide(FetchHttpClient.layer),
	),
);

describe.skipIf(!devServerRunning)('inngest integration', () => {
	const client = new InngestSdk({ id: 'integration-test', isDev: true });
	const Inngest = createInngest(Effect.succeed(client));

	it.scopedLive('function executes via inngest dev server', () =>
		Effect.gen(function* () {
			const executionLog: string[] = [];

			const fn = yield* Inngest.createFunction(
				{ id: 'test-hello' },
				{ event: 'test/hello' },
				({ event, step }) =>
					Effect.gen(function* () {
						yield* step.run('log-event', () =>
							Effect.sync(() => {
								executionLog.push(`received: ${event.data.message}`);
							}),
						);
					}),
			);

			const handler = yield* Inngest.fetchHandler({
				functions: [fn],
				servePath: '/api/inngest',
			});

			const server = Bun.serve({ port: 0, fetch: handler });

			yield* Effect.addFinalizer(() => Effect.sync(() => server.stop(true)));

			yield* HttpClient.put(`http://localhost:${server.port}/api/inngest`);

			yield* Effect.sleep(1500);

			yield* Inngest.send({ name: 'test/hello', data: { message: 'world' } });

			yield* poll(() => executionLog.includes('received: world'), 500, 15_000);

			expect(executionLog).toContain('received: world');
		}).pipe(Effect.provide(Inngest.layer), Effect.provide(FetchHttpClient.layer)),
	);

	it.scopedLive('step tools work correctly', () =>
		Effect.gen(function* () {
			const executionLog: string[] = [];

			const fn = yield* Inngest.createFunction(
				{ id: 'test-steps' },
				{ event: 'test/steps' },
				({ step }) =>
					Effect.gen(function* () {
						const firstResult = yield* step.run('first-step', () =>
							Effect.succeed('step-one-done'),
						);

						yield* step.run('second-step', () =>
							Effect.sync(() => {
								executionLog.push(`second step got: ${firstResult}`);
							}),
						);
					}),
			);

			const handler = yield* Inngest.fetchHandler({
				functions: [fn],
				servePath: '/api/inngest',
			});

			const server = Bun.serve({ port: 0, fetch: handler });

			yield* Effect.addFinalizer(() => Effect.sync(() => server.stop(true)));

			yield* HttpClient.put(`http://localhost:${server.port}/api/inngest`);

			yield* Effect.sleep(1500);

			yield* Inngest.send({ name: 'test/steps', data: {} });

			yield* poll(
				() => executionLog.includes('second step got: step-one-done'),
				500,
				15_000,
			);

			expect(executionLog).toContain('second step got: step-one-done');
		}).pipe(Effect.provide(Inngest.layer), Effect.provide(FetchHttpClient.layer)),
	);
});
