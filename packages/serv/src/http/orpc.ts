import type { Context } from '@orpc/server';
import type { FetchHandler } from '@orpc/server/fetch';
import type { FriendlyStandardHandleOptions } from '@orpc/server/standard';
import { Effect } from 'effect';
import { Handler } from './fetch-handler.js';

type MaybeOptionalOptions<TOptions> =
	Record<never, never> extends TOptions
		? [options?: TOptions]
		: [options: TOptions];

type PossibleOpt<T extends Context, E, R> =
	| FriendlyStandardHandleOptions<T>
	| Effect.Effect<FriendlyStandardHandleOptions<T>, E, R>;

function getValue<T extends Context, E, R>(opt: PossibleOpt<T, E, R>) {
	return Effect.isEffect(opt) ? opt : Effect.succeed(opt);
}

export function oRPCHandler<T extends Context, E, R>(
	handler: FetchHandler<T>,
	opt?: PossibleOpt<T, E, R> | (() => PossibleOpt<T, E, R>),
) {
	return new Handler('oRPCHandler', ({ request }) =>
		Effect.gen(function* () {
			const _opt = (
				opt ? [yield* getValue(typeof opt === 'function' ? opt() : opt)] : []
			) as MaybeOptionalOptions<FriendlyStandardHandleOptions<T>>;
			return yield* Effect.tryPromise(() => handler.handle(request, ..._opt));
		}),
	);
}
