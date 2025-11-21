import { Effect } from 'effect';
import { extract } from '../../extract';
import { runPromiseUnwrapped } from '../../run-promise-unwrapped';

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
export function createHandler<INPUT, OUTPUT, IMPLEMENTED_HANDLER, R>(
	builder: SimpleBuilder<INPUT, OUTPUT, IMPLEMENTED_HANDLER>,
	handler: (opt: INPUT) => Effect.Effect<OUTPUT, unknown, R>,
) {
	return Effect.gen(function* () {
		const ext_handler = yield* extract(handler);
		return builder.handler(async (opt) =>
			ext_handler(opt).pipe((e) => runPromiseUnwrapped(e)),
		);
	});
}
