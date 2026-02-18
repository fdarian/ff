import { Context, Effect, pipe } from 'effect';

type InferClass<T> = T extends new (...args: any[]) => infer R ? R : never;

// biome-ignore lint/suspicious/noExplicitAny: intended
export function extract<
	P extends any[],
	A,
	E,
	R,
	INFERRED_EXCLUDED extends Context.Tag<any, any> = never,
	EXCLUDED = InferClass<INFERRED_EXCLUDED>,
>(
	effect: (...params: P) => Effect.Effect<A, E, R>,
	options?: { exclude?: Array<INFERRED_EXCLUDED> },
): Effect.Effect<
	(...params: P) => Effect.Effect<A, E, Extract<R, EXCLUDED>>,
	never,
	Exclude<R, EXCLUDED>
> {
	// @ts-expect-error quite hard to type, check unit test
	return Effect.gen(function* () {
		const runtime = yield* Effect.runtime();

		const context = runtime.context.pipe(
			options?.exclude ? Context.omit(...options.exclude) : (e) => e,
		) as Context.Context<Exclude<R, EXCLUDED>>;

		return (...params: P) => pipe(effect(...params), Effect.provide(context));
	});
}
