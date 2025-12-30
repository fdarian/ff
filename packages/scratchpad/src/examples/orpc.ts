import { call, os } from '@orpc/server';
import { Effect, Schema } from 'effect';
import { createHandler, FfOrpcCtx } from 'ff-effect/for/orpc';

console.log(
	await call(
		Effect.runSync(
			createHandler(
				os.input(
					Schema.standardSchemaV1(Schema.Struct({ name: Schema.String })),
				),
				Effect.fn(function* ({ input }) {
					return yield* Effect.succeed(`Hello ${input.name}`);
				}),
			),
		),
		{ name: 'world!' },
	),
);

//

function createContext() {
	return {
		asdf: 1,
		ff: FfOrpcCtx.create({
			runEffect: async <A, E>(e: Effect.Effect<A, E>) => {
				console.log('Using custom runEffect');
				return Effect.runPromise(e as Effect.Effect<A, E>);
			},
		}),
	};
}
type Context = ReturnType<typeof createContext>;

console.log(
	await call(
		Effect.runSync(
			createHandler(
				os
					.$context<Context>()
					.input(
						Schema.standardSchemaV1(Schema.Struct({ name: Schema.String })),
					),
				Effect.fn(function* ({ input }) {
					return yield* Effect.succeed(`Hello ${input.name}`);
				}),
			),
		),
		{ name: 'world!' },
		{ context: createContext() },
	),
);
