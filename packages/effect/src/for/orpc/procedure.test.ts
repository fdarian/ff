import { layer } from '@effect/vitest';
import { call, implement, os } from '@orpc/server';
import { Effect } from 'effect';
import * as v from 'valibot';
import { expect, expectTypeOf, test } from 'vitest';
import { createHandler, FfOrpcCtx } from './procedure.js';

class Deps extends Effect.Service<Deps>()('deps', {
	effect: Effect.gen(function* () {
		return yield* Effect.succeed({
			value: 'world',
		});
	}),
}) {}

test('FfOrpcCtx.is', () => {
	const validCtx = {
		_tag: 'ff-orpc',
		runEffect: async () => {},
	};
	expect(FfOrpcCtx.is(validCtx)).toBe(true);

	expect(FfOrpcCtx.is(null)).toBe(false);
	expect(FfOrpcCtx.is(undefined)).toBe(false);
	expect(FfOrpcCtx.is({})).toBe(false);
	expect(FfOrpcCtx.is({ _tag: 'other' })).toBe(false);
});

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

	it(
		'with custom runEffect',
		Effect.fn(function* () {
			let runEffectCalled = false;

			const deps = yield* Deps;
			const customRunEffect = async <A, E>(
				effect: Effect.Effect<A, E, Deps>,
			): Promise<A> => {
				runEffectCalled = true;
				return Effect.runSync(effect.pipe(Effect.provideService(Deps, deps)));
			};

			const effectProcedure = createHandler(
				os
					.$context<{ ff: FfOrpcCtx<Deps> }>()
					.input(v.object({ message: v.string() })),
				Effect.fn(function* ({ input }) {
					return `${input.message} ${(yield* Deps).value}`;
				}),
			);
			const procedure = yield* effectProcedure;

			const result = yield* Effect.promise(() =>
				call(
					procedure,
					{ message: 'hello' },
					{
						context: {
							ff: FfOrpcCtx.create({
								runEffect: customRunEffect,
							}),
						},
					},
				),
			);

			expect(result).toBe('hello world');
			expect(runEffectCalled).toBe(true);
		}),
	);

	it(
		'fallback to runPromiseUnwrapped when no ff context',
		Effect.fn(function* () {
			const effectProcedure = createHandler(
				os
					.$context<{ ff?: FfOrpcCtx<Deps> }>()
					.input(v.object({ message: v.string() })),
				Effect.fn(function* ({ input }) {
					return `${input.message} ${(yield* Deps).value}`;
				}),
			);
			const procedure = yield* effectProcedure;

			const result = yield* Effect.promise(() =>
				call(procedure, { message: 'hello' }, { context: {} }),
			);

			expect(result).toBe('hello world');
		}),
	);
});
