import { FetchHttpClient, HttpClient } from '@effect/platform';
import { expect, layer } from '@effect/vitest';
import { Cause, Data, Effect, Layer, Ref } from 'effect';
import { serverTester } from './__test__/utils.ts';
import { basicHandler } from './basic.ts';
import { createFetchHandler } from './fetch-handler.ts';

class AlsoError extends Error {}
class CustomError extends Data.TaggedError('CustomError') {}

layer(
	Layer.mergeAll(
		FetchHttpClient.layer,
		// Logger.pretty
	),
)((it) => {
	it.effect('e2e', () =>
		serverTester({
			server: ({ port }) =>
				Effect.gen(function* () {
					const errorsRef = yield* Ref.make<Array<Cause.Cause<unknown>>>([]);
					return {
						errors: errorsRef,
						server: Bun.serve({
							port: port,
							fetch: yield* createFetchHandler(
								[
									basicHandler('/one', () => {
										throw new AlsoError();
									}),
									basicHandler('/two', () =>
										Effect.gen(function* () {
											return yield* new CustomError();
										}),
									),
								],
								{
									onError: ({ error }) =>
										Effect.gen(function* () {
											const errors = yield* Ref.get(errorsRef) ?? [];
											errors.push(error);
											yield* Ref.set(errorsRef, errors);
										}),
								},
							),
						}),
					};
				}),
			test: ({ errors, server }) =>
				Effect.gen(function* () {
					const call = (path: string) =>
						HttpClient.get(`http://localhost:${server.port}${path}`).pipe(
							Effect.flatMap((e) => e.text),
						);

					expect(yield* call('/one')).toEqual('Internal Server Error');
					yield* Effect.gen(function* () {
						const cause = (yield* Ref.get(errors))[0];
						const isDie = cause._tag === 'Die';
						expect(isDie, `Cause is ${cause._tag}`).toEqual(true);
						if (isDie) {
							expect(cause.defect).toBeInstanceOf(AlsoError);
						}
					});

					expect(yield* call('/two')).toEqual('Internal Server Error');
					yield* Effect.gen(function* () {
						const cause = (yield* Ref.get(errors))[1];
						const isFailType = Cause.isFailType(cause);
						expect(isFailType, `Cause is ${cause._tag}`).toEqual(true);
						if (isFailType) {
							expect(cause.error).toBeInstanceOf(CustomError);
						}
					});
				}),
		}),
	);
});
