import type { Context } from '@orpc/server';
import type { FetchHandler } from '@orpc/server/fetch';
import type { FriendlyStandardHandleOptions } from '@orpc/server/standard';
import type { Handler } from './fetch-handler.js';

type MaybeOptionalOptions<TOptions> = Record<never, never> extends TOptions
	? [options?: TOptions]
	: [options: TOptions];

export function oRPCHandler<T extends Context>(
	handler: FetchHandler<T>,
	...rest: MaybeOptionalOptions<FriendlyStandardHandleOptions<T>>
): Handler<'oRPCHandler'> {
	return {
		_tag: 'oRPCHandler',
		handle: async ({ request }) => handler.handle(request, ...rest),
	};
}
