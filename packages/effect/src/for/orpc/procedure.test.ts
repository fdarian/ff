import { layer } from '@effect/vitest';
import { call, implement, os } from '@orpc/server';
import { Effect } from 'effect';
import * as v from 'valibot';
import { expect, expectTypeOf } from 'vitest';
import { createHandler } from './procedure.js';

class Deps extends Effect.Service<Deps>()('deps', {
	effect: Effect.gen(function* () {
		return {
			value: 'world',
		};
	}),
}) {}

layer(Deps.Default)((it) => {
	it(
		'basic',
		Effect.fn(function* () {
			const effectProcedure = createHandler(
				os.input(v.object({ message: v.string() })),
				Effect.fn(function* ({ input }) {
					return `${input.message} ${(yield* Deps).value}`;
				}),
			);
			const procedure = yield* effectProcedure;

			const result = call(procedure, { message: 'hello' });
			expect(result).toBe('hello world');
			expectTypeOf(effectProcedure).toEqualTypeOf<
				Effect.Effect<typeof procedure, never, Deps>
			>();
		}),
	);

	it(
		'contract',
		Effect.fn(function* () {
			const contract = {
				sayHi: os.input(v.object({ message: v.string() })).output(v.string()),
			};
			const osContract = implement(contract);

			const effectProcedure = createHandler(
				osContract.sayHi,
				Effect.fn(function* ({ input }) {
					return `${input.message} ${(yield* Deps).value}`;
				}),
			);
			const procedure = yield* effectProcedure;

			const result = call(procedure, { message: 'hello' });
			expect(result).toBe('hello world');
			expectTypeOf(effectProcedure).toEqualTypeOf<
				Effect.Effect<typeof procedure, never, Deps>
			>();
		}),
	);
});
