import type { Context } from '@orpc/server';
import type { FetchHandler } from '@orpc/server/fetch';
import type { FriendlyStandardHandleOptions } from '@orpc/server/standard';
import { Effect, FiberSet } from 'effect';
import { nanoid } from 'nanoid';
import { Logger } from '../logger.js';

type HandlerResult =
	| {
			matched: true;
			response: Response | Promise<Response>;
	  }
	| {
			matched: false;
			response: undefined;
	  };

type Handler = (opt: {
	url: URL;
	request: Request;
}) => HandlerResult | Promise<HandlerResult>;

export function basicHandler(
	path: string | ((url: URL) => boolean),
	handler: (request: Request) => Response | Promise<Response>,
): Handler {
	return ({ url, request }) => {
		const matched =
			typeof path === 'function' ? path(url) : path === url.pathname;
		if (!matched) return { matched: false, response: undefined };

		return { matched: true, response: handler(request) };
	};
}

type MaybeOptionalOptions<TOptions> = Record<never, never> extends TOptions
	? [options?: TOptions]
	: [options: TOptions];

export function oRPCHandler<T extends Context>(
	handler: FetchHandler<T>,
	...rest: MaybeOptionalOptions<FriendlyStandardHandleOptions<T>>
): Handler {
	return async ({ request }) => handler.handle(request, ...rest);
}

export const createFetchHandler = (
	handlers?: Handler | [Handler, ...Array<Handler>],
) =>
	Effect.gen(function* () {
		const runFork = yield* FiberSet.makeRuntimePromise();
		return async (request: Request) => {
			const urlObj = new URL(request.url);
			const requestId = nanoid(6);

			const effect = Effect.gen(function* () {
				yield* Logger.info(
					{ request: { pathname: urlObj.pathname } },
					'Request started',
				);

				for (const handler of Array.isArray(handlers) ? handlers : [handlers]) {
					if (!handler) continue;

					const maybeResult = handler({ url: urlObj, request });
					const result =
						maybeResult instanceof Promise
							? yield* Effect.tryPromise(() => maybeResult)
							: maybeResult;
					if (!result.matched) continue;
					return result.response;
				}

				return new Response('Not Found', { status: 404 });
			}).pipe(
				Effect.flatMap((response) =>
					response instanceof Promise
						? Effect.tryPromise(() => response)
						: Effect.succeed(response),
				),
				Effect.tap((response) =>
					response.ok
						? Logger.info(`Request completed with status ${response.status}`)
						: Logger.warn(`Request completed with status ${response.status}`),
				),
				Effect.catchAll((error) =>
					Effect.gen(function* () {
						yield* Logger.error(
							{ error },
							'Unhandled exception in HTTP handler',
						);
						return new Response('Internal Server Error', {
							status: 500,
						});
					}),
				),
				Effect.withSpan('http'),
				Effect.annotateLogs({ requestId }),
				Effect.scoped,
			);

			return runFork(effect);
		};
	});