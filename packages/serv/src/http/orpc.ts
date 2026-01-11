import type { Context } from '@orpc/server';
import type { FetchHandler } from '@orpc/server/fetch';
import type { FriendlyStandardHandleOptions } from '@orpc/server/standard';
import { Effect } from 'effect';
import { Handler } from './fetch-handler.js';

type MaybeOptionalOptions<TOptions> =
	Record<never, never> extends TOptions
		? [options?: TOptions]
		: [options: TOptions];

export function oRPCHandler<T extends Context, E, R>(
	handler: FetchHandler<T>,
	opt?:
		| FriendlyStandardHandleOptions<T>
		| Effect.Effect<FriendlyStandardHandleOptions<T>, E, R>,
) {
	return new Handler('oRPCHandler', ({ request }) =>
		Effect.gen(function* () {
			const _opt = (
				opt ? [Effect.isEffect(opt) ? yield* opt : opt] : []
			) as MaybeOptionalOptions<FriendlyStandardHandleOptions<T>>;
			return yield* Effect.tryPromise(() => handler.handle(request, ..._opt));
		}),
	);
}
