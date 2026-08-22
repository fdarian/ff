import { Context, Effect, Layer } from 'effect';
import { expect, expectTypeOf, test } from 'vitest';
import { extract } from './extract.js';

class ServiceA extends Context.Service<ServiceA>()('A', {
	make: Effect.sync(() => ({ val: 'A' as string })),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

class ServiceB extends Context.Service<ServiceB>()('B', {
	make: Effect.sync(() => ({ val: 'B' as string })),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

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

		class Container extends Context.Service<Container>()('Container', {
			make: Container_effect,
		}) {
			static readonly layer = Layer.effect(this, this.make).pipe(
				Layer.provide(ServiceA.layer),
			);
		}

		const main = Effect.gen(function* () {
			const container = yield* Container;

			expect(yield* container.getVal()).toBe('A');
		}).pipe(Effect.provide(Container.layer));

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

		class Container extends Context.Service<Container>()('Container', {
			make: Container_effect,
		}) {
			static readonly layer = Layer.effect(this, this.make).pipe(
				Layer.provide(ServiceA.layer),
				// Assume this is what the service by default provides ServiceB
				Layer.provide(Layer.succeed(ServiceB, { val: 'not this' })),
			);
		}

		const main = Effect.gen(function* () {
			const container = yield* Container;
			const result = yield* container.getVal().pipe(
				// The exclusion should use this instead
				Effect.provideService(ServiceB, { val: 'this one' }),
			);

			expect(result.a).toBe('A');
			// B is using the new provided
			expect(result.b).toBe('this one');
		}).pipe(Effect.provide(Container.layer));

		yield* main;
	}).pipe((e) => Effect.runPromise(e)));
