import { Effect, FiberSet } from 'effect';
import type { UnknownException } from 'effect/Cause';
import { nanoid } from 'nanoid';
import { Logger } from '../logger.js';

// #region Handler

type AnyResponse = Response | Promise<Response>;

export type HandlerResult =
	| {
			matched: true;
			response: AnyResponse;
	  }
	| {
			matched: false;
			response: undefined;
	  };

export class Handler<NAME extends string, R> {
	constructor(
		readonly _tag: NAME,
		readonly handle: (opt: {
			url: URL;
			request: Request;
		}) => Effect.Effect<HandlerResult, unknown, R>,
	) {}
}

// #endregion

namespace BasicHandler {
	export namespace Path {
		export type Type = string | ((url: URL) => boolean);
		export function matched(path: Type, url: URL) {
			return typeof path === 'function' ? path(url) : path === url.pathname;
		}
	}

	export type EffectResult<R> = Effect.Effect<AnyResponse, unknown, R>;

	export function parseResponse<E, R>(
		result: AnyResponse | Effect.Effect<AnyResponse, E, R>,
	): Effect.Effect<AnyResponse, E, R> {
		return Effect.gen(function* () {
			if (!Effect.isEffect(result)) return result;
			return yield* result;
		});
	}
}

export function basicHandler(
	path: BasicHandler.Path.Type,
	handler: (request: Request) => AnyResponse,
): Handler<'basicHandler', never>;
export function basicHandler<R>(
	path: BasicHandler.Path.Type,
	handler: (request: Request) => BasicHandler.EffectResult<R>,
): Handler<'basicHandler', R>;
export function basicHandler<R>(
	path: BasicHandler.Path.Type,
	handler: (request: Request) => AnyResponse | BasicHandler.EffectResult<R>,
) {
	return new Handler('basicHandler', ({ url, request }) =>
		Effect.gen(function* () {
			if (!BasicHandler.Path.matched(path, url))
				return { matched: false, response: undefined };

			const response = handler(request);
			return {
				matched: true,
				response: yield* BasicHandler.parseResponse(response),
			};
		}),
	);
}

type ExtractRequirements<T> = T extends Handler<string, infer R> ? R : never;

export const createFetchHandler = <
	const HANDLERS extends [
		Handler<string, unknown>,
		...Array<Handler<string, unknown>>,
	],
	R = ExtractRequirements<HANDLERS[number]>,
>(
	handlers: HANDLERS,
	opts?: {
		debug?: boolean;
	},
) =>
	Effect.gen(function* () {
		const runFork = yield* FiberSet.makeRuntimePromise<R>();
		return async (request: Request) => {
			const urlObj = new URL(request.url);
			const requestId = nanoid(6);

			const effect = Effect.gen(function* () {
				yield* Logger.info(
					{ request: { pathname: urlObj.pathname } },
					'Request started',
				);

				for (const handler of handlers) {
					if (!handler) continue;

					const result = yield* handler.handle({ url: urlObj, request }).pipe(
						Effect.catchAllCause((error) =>
							Effect.gen(function* () {
								yield* Logger.error(
									{ error },
									`Unhandled exception in HTTP handler '${handler._tag}'`,
								);
								return {
									matched: true,
									response: new Response('Internal Server Error', {
										status: 500,
									}),
								} as HandlerResult;
							}),
						),
					);

					if (opts?.debug)
						yield* Logger.debug(
							{ handler: handler._tag, request, result },
							'Processed handler',
						);

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
				Effect.withSpan('http'),
				Effect.annotateLogs({ requestId }),
				Effect.scoped,
			) as Effect.Effect<Response, UnknownException, R>;

			return runFork(effect);
		};
	});
