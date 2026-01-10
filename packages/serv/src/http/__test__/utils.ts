import { Deferred, Effect, Fiber } from 'effect';
import { Logger } from '../../logger.js';
import { getPort } from '../../port.js';

export function serverTester<
	SERVER_R,
	SERVER_E,
	SERVER_OUTPUT extends { server: Bun.Server<never> },
	TEST_A,
	TEST_E,
	TEST_R,
>(opt: {
	server: (opt: {
		port: number;
	}) => Effect.Effect<SERVER_OUTPUT, SERVER_E, SERVER_R> | SERVER_OUTPUT;
	test: (opt: SERVER_OUTPUT) => Effect.Effect<TEST_A, TEST_E, TEST_R>;
}) {
	return Effect.gen(function* () {
		const port = yield* getPort();
		const ready = yield* Deferred.make<SERVER_OUTPUT>();

		const fiber = yield* Effect.fork(
			Effect.scoped(
				Effect.gen(function* () {
					const res = opt.server({ port });
					const output = Effect.isEffect(res) ? yield* res : res;
					yield* Logger.info(`Server started in ${port}`);
					yield* Deferred.succeed(ready, output);
					yield* Effect.addFinalizer(() =>
						Effect.gen(function* () {
							yield* Effect.promise(() => output.server.stop(true));
							yield* Logger.info('Server stopped');
						}),
					);
					yield* Effect.never;
				}),
			),
		);

		const output = yield* Deferred.await(ready);

		yield* opt.test(output).pipe(
			Effect.tap(() => Logger.info('All good')),
			Effect.catchAllDefect((error) => Logger.error({ error }, 'Failed')),
		);

		yield* Fiber.interrupt(fiber);
	}).pipe(Effect.scoped);
}
