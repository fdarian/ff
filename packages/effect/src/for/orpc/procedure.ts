import { Effect } from 'effect';
import { extract } from '../../extract';
import { runPromiseUnwrapped } from '../../run-promise-unwrapped';

export namespace FfOrpcCtx {
	const TAG = 'ff-orpc';

	export function create<R>(input: {
		runEffect: <A = unknown, E = unknown>(
			effect: Effect.Effect<A, E, R>,
		) => Promise<A>;
	}) {
		return {
			_tag: TAG,
			runEffect: input.runEffect,
		};
	}

	export function is(ctx: unknown): ctx is FfOrpcCtx.Type<unknown> {
		return (
			typeof ctx === 'object' &&
			ctx !== null &&
			'_tag' in ctx &&
			ctx._tag === TAG
		);
	}

	export type Type<R> = ReturnType<typeof create<R>>;
}

export type FfOrpcCtx<R> = FfOrpcCtx.Type<R>;

type SimpleBuilder<INPUT, OUTPUT, IMPLEMENTED_HANDLER> = {
	handler: (handler: (_: INPUT) => Promise<OUTPUT>) => IMPLEMENTED_HANDLER;
};

/**
 * Create a Effect-based handler
 *
 * @example
 * ```ts
 * // Before - Plain oRPC
 * const procedure = os
 *   .input(v.object({ hello: v.string() }))
 *   .handler(({ input }) => 'world');
 *
 * // After
 * const procedure = createHandler(
 *   os.input(v.object({ hello: v.string() })),
 *   Effect.fn(function* ({ input }) {
 *     return 'world'
 *   }),
 * );
 * ```
 **/
export function createHandler<
	OPT extends { context: { ff?: FfOrpcCtx<never> } },
	OUTPUT,
	IMPLEMENTED_HANDLER,
	R,
>(
	builder: SimpleBuilder<OPT, OUTPUT, IMPLEMENTED_HANDLER>,
	handler: (opt: OPT) => Effect.Effect<OUTPUT, unknown, R>,
) {
	return Effect.gen(function* () {
		const ext_handler = yield* extract(handler);
		return builder.handler(async (opt) => {
			const runEffect = FfOrpcCtx.is(opt.context.ff)
				? opt.context.ff.runEffect
				: runPromiseUnwrapped;
			return ext_handler(opt).pipe((e) => runEffect(e));
		});
	});
}
