import { Effect, Layer } from 'effect';
import { expect, expectTypeOf, test } from 'vitest';
import { extract } from './extract.js';

class ServiceA extends Effect.Service<ServiceA>()('A', {
	sync: () => ({ val: 'A' as string }),
}) {}

class ServiceB extends Effect.Service<ServiceB>()('B', {
	sync: () => ({ val: 'B' as string }),
}) {}

test('basic', () =>
	Effect.gen(function* () {
		const getVal = Effect.fn(function* () {
			return (yield* ServiceA).val;
		});

		const Container_effect = Effect.gen(function* () {
			return {
				getVal: yield* extract(getVal),
			};
		});
		expectTypeOf(Container_effect).toEqualTypeOf<
			Effect.Effect<
				{
					// ServiceA is moved, no longer here
					getVal: () => Effect.Effect<string, never, never>;
				},
				never,
				// ServiceA is now here
				ServiceA
			>
		>();

		class Container extends Effect.Service<Container>()('Container', {
			dependencies: [ServiceA.Default],
			effect: Container_effect,
		}) {}

		const main = Effect.gen(function* () {
			const container = yield* Container;

			expect(yield* container.getVal()).toBe('A');
		}).pipe(Effect.provide(Container.Default));

		yield* main;
	}).pipe((e) => Effect.runPromise(e)));

/** Checks whether we have omitted the `excluded` tags in runtime (not type level) */
test('with excluded', () =>
	Effect.gen(function* () {
		const getVal = Effect.fn(function* () {
			return {
				a: (yield* ServiceA).val,
				b: (yield* ServiceB).val,
			};
		});

		const Container_effect = Effect.gen(function* () {
			return {
				getVal: yield* extract(getVal, { exclude: [ServiceB] }),
			};
		});
		expectTypeOf(Container_effect).toEqualTypeOf<
			Effect.Effect<
				{
					getVal: () => Effect.Effect<
						{
							a: string;
							b: string;
						},
						never,
						// ServiceA is moved, no longer here,
						// but ServiceB still, because of the `exclude`
						ServiceB
					>;
				},
				never,
				// ServiceA is now here
				ServiceA
			>
		>();

		class Container extends Effect.Service<Container>()('Container', {
			dependencies: [
				ServiceA.Default,
				// Assume this is what the service by default provides ServiceB
				Layer.succeed(ServiceB, ServiceB.make({ val: 'not this' })),
			],
			effect: Container_effect,
		}) {}

		const main = Effect.gen(function* () {
			const container = yield* Container;
			const result = yield* container.getVal().pipe(
				Effect.provideService(
					ServiceB,
					// The exclusion should use this instead
					ServiceB.make({ val: 'this one' }),
				),
			);

			expect(result.a).toBe('A');
			// B is using the new provided
			expect(result.b).toBe('this one');
		}).pipe(Effect.provide(Container.Default));

		yield* main;
	}).pipe((e) => Effect.runPromise(e)));
