import type { Context } from '@orpc/server';
import type { FetchHandler } from '@orpc/server/fetch';
import type { FriendlyStandardHandleOptions } from '@orpc/server/standard';
import { Effect } from 'effect';
import { buildHandler } from './fetch-handler.js';

type MaybeOptionalOptions<TOptions> =
	Record<never, never> extends TOptions
		? [options?: TOptions]
		: [options: TOptions];

export function oRPCHandler<T extends Context>(
	handler: FetchHandler<T>,
	...rest: MaybeOptionalOptions<FriendlyStandardHandleOptions<T>>
) {
	return buildHandler('oRPCHandler', ({ request }) =>
		Effect.tryPromise(() => handler.handle(request, ...rest)),
	);
}
