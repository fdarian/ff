import { call, os } from '@orpc/server';
import { Effect, Schema } from 'effect';
import { createHandler } from 'ff-effect/for/orpc';

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
		runEffect: Effect.runPromise,
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
