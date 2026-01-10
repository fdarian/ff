import { FetchHttpClient, FileSystem, HttpClient } from '@effect/platform';
import { describe, expect, expectTypeOf, it, layer } from '@effect/vitest';
import { Effect, Layer, type Scope } from 'effect';
import { serverTester } from './__test__/utils.ts';
import { basicHandler } from './basic.ts';
import { createFetchHandler, type Handler } from './fetch-handler.ts';

describe('type inferences', () => {
	type DefaultRequirements = Scope.Scope;

	it('no requirement', () => {
		const handler = basicHandler('/dummy', () => new Response('ok'));
		expectTypeOf(handler).toEqualTypeOf<Handler<'basicHandler', never>>();

		expectTypeOf(createFetchHandler([handler])).toEqualTypeOf<
			Effect.Effect<
				(request: Request) => Promise<Response>,
				never,
				DefaultRequirements
			>
		>();
	});

	it('with requirement', () => {
		const handler = basicHandler('/dummy', () =>
			Effect.gen(function* () {
				yield* HttpClient.HttpClient;
				return new Response('ok');
			}),
		);
		expectTypeOf(handler).toEqualTypeOf<
			Handler<'basicHandler', HttpClient.HttpClient>
		>();

		expectTypeOf(createFetchHandler([handler])).toEqualTypeOf<
			Effect.Effect<
				(request: Request) => Promise<Response>,
				never,
				HttpClient.HttpClient | DefaultRequirements
			>
		>();
	});

	it('with requirements', () => {
		expectTypeOf(
			createFetchHandler([
				basicHandler('/dummy', () =>
					Effect.gen(function* () {
						yield* HttpClient.HttpClient;
						return new Response('ok');
					}),
				),
				basicHandler('/dummy', () =>
					Effect.gen(function* () {
						yield* FileSystem.FileSystem;
						return new Response('ok');
					}),
				),
			]),
		).toEqualTypeOf<
			Effect.Effect<
				(request: Request) => Promise<Response>,
				never,
				HttpClient.HttpClient | FileSystem.FileSystem | DefaultRequirements
			>
		>();
	});
});

class Dummy extends Effect.Service<Dummy>()('dummy', {
	sync: () => ({ message: 'ok-service' }),
}) {}

layer(Layer.mergeAll(FetchHttpClient.layer, Dummy.Default))((it) => {
	it.effect('e2e', () =>
		serverTester({
			server: ({ port }) =>
				Effect.gen(function* () {
					return {
						server: Bun.serve({
							port: port,
							fetch: yield* createFetchHandler([
								basicHandler('/one', () => new Response('ok')),
								basicHandler('/two', () =>
									Effect.succeed(new Response('ok-effect')),
								),
								basicHandler('/three', () =>
									Effect.gen(function* () {
										const svc = yield* Dummy;
										return new Response(svc.message);
									}),
								),
							]),
						}),
					};
				}),
			test: ({ server }) =>
				Effect.gen(function* () {
					const call = (path: string) =>
						HttpClient.get(`http://localhost:${server.port}${path}`).pipe(
							Effect.map((e) => e.text),
						);

					expect(yield* call('/one'), 'ok');
					expect(yield* call('/two'), 'ok-effect');
					expect(yield* call('/three'), 'ok-service');
				}),
		}),
	);
});
