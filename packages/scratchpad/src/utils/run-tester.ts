import { Effect, type Layer } from 'effect';

export async function runTester<R>(opts: {
	debug?: boolean;
	dependencies: Layer.Layer<R, unknown>;
	effect: Effect.Effect<unknown, unknown, R>;
}) {
	// const MainLayer = Layer.provideMerge(
	// 	opts.dependencies,
	// 	Logger.createLayer({ level: opts.debug ? 'debug' : 'info' }),
	// );
	const MainLayer = opts.dependencies;

	opts.effect.pipe(
		Effect.provide(MainLayer), //
		(e) => Effect.runPromise(e),
	);
}
