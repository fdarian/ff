import { Context, Effect, pipe } from 'effect';

export function extract<
	// biome-ignore lint/suspicious/noExplicitAny: type inference pattern
	P extends any[],
	A,
	E,
	R,
	// biome-ignore lint/suspicious/noExplicitAny: type inference pattern
	INFERRED_EXCLUDED extends Context.Service<any, any> = never,
	EXCLUDED = Context.Service.Identifier<INFERRED_EXCLUDED>,
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
		const services = yield* Effect.context();

		const context = (
			options?.exclude ? Context.omit(...options.exclude)(services) : services
		) as Context.Context<Exclude<R, EXCLUDED>>;

		return (...params: P) => pipe(effect(...params), Effect.provide(context));
	});
}
