import assert from 'node:assert';
import { FetchHttpClient } from '@effect/platform';
import { HttpClient } from '@effect/platform/HttpClient';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { os, type RouterClient } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import {
	Deferred,
	Effect,
	Logger as EffectLogger,
	Fiber,
	Layer,
	LogLevel,
} from 'effect';
import { basicHandler, createFetchHandler, getPort, Logger } from 'ff-serv';
import { oRPCHandler } from 'ff-serv/orpc';
import { runTester } from '../utils/run-tester.js';

function runServerTester<
	SERVER_R,
	TEST_R,
	SERVER_OUTPUT extends { server: Bun.Server<never> },
>(opt: {
	server: (opt: {
		port: number;
	}) => Effect.Effect<SERVER_OUTPUT, unknown, SERVER_R> | SERVER_OUTPUT;
	test: (opt: SERVER_OUTPUT) => Effect.Effect<unknown, unknown, TEST_R>;
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
	});
}

const DUMMY_MSG = 'supersecret';
export class Dummy extends Effect.Service<Dummy>()('dummy', {
	sync: () => ({ message: DUMMY_MSG }),
}) {}

export class Dummy2 extends Effect.Service<Dummy2>()('dummy2', {
	sync: () => ({ message: DUMMY_MSG }),
}) {}

runTester({
	dependencies: Layer.mergeAll(FetchHttpClient.layer, EffectLogger.pretty),
	effect: Effect.gen(function* () {
		yield* runServerTester({
			server: ({ port }) =>
				Effect.gen(function* () {
					return {
						server: Bun.serve({
							port: port,
							fetch: yield* createFetchHandler([
								basicHandler('/health', () => new Response('ok')),
							]),
						}),
					};
				}),
			test: ({ server }) =>
				Effect.gen(function* () {
					const client = yield* HttpClient;
					const response = yield* client.get(
						`http://localhost:${server.port}/health`,
					);

					assert.strictEqual(yield* response.text, 'ok');
				}),
		});

		yield* runServerTester({
			server: ({ port }) =>
				Effect.gen(function* () {
					const router = {
						rpc: {
							health: os.handler(() => 'also ok'),
						},
					};
					const handler = new RPCHandler(router);
					return {
						router,
						server: Bun.serve({
							port: port,
							fetch: yield* createFetchHandler([
								basicHandler('/message', () =>
									Effect.gen(function* () {
										const svc = yield* Dummy;
										return new Response(svc.message);
									}),
								),
								basicHandler('/message-2', () =>
									Effect.gen(function* () {
										const svc = yield* Dummy2;
										return new Response(svc.message);
									}),
								),
								oRPCHandler(handler),
							]),
						}),
					};
				}).pipe(
					(e) => e,
					// Effect.provide(Dummy.Default), // using this should throw type error
					Effect.provide(Layer.mergeAll(Dummy.Default, Dummy2.Default)),
				),
			test: ({ router, server }) =>
				Effect.gen(function* () {
					const http = yield* HttpClient;

					yield* Effect.gen(function* () {
						const response = yield* http.get(
							`http://localhost:${server.port}/message`,
						);
						assert.strictEqual(yield* response.text, DUMMY_MSG);
					});

					yield* Effect.gen(function* () {
						const response = yield* http.get(
							`http://localhost:${server.port}/message-2`,
						);
						assert.strictEqual(yield* response.text, DUMMY_MSG);
					});

					const orpcClient: RouterClient<typeof router> = createORPCClient(
						new RPCLink({ url: `http://localhost:${server.port}` }),
					);

					assert.strictEqual(
						yield* Effect.promise(async () => orpcClient.rpc.health()),
						'also ok',
					);
				}),
		}).pipe((e) => e);
	}).pipe(
		(e) => e,
		Effect.scoped,
		EffectLogger.withMinimumLogLevel(LogLevel.Debug),
	),
});
