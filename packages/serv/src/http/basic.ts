import { Effect } from 'effect';
import { type AnyResponse, Handler } from './fetch-handler.js';

export namespace Path {
	export type Type = `/${string}` | ((url: URL) => boolean);
	export function matched(path: Type, url: URL) {
		return typeof path === 'function' ? path(url) : path === url.pathname;
	}
}

export namespace Fn {
	type Input = [request: Request];

	type OutputSync = AnyResponse;
	type OutputEffect<R> = Effect.Effect<AnyResponse, unknown, R>;

	export type FnSync = (...input: Input) => OutputSync;
	export type FnEffect<R> = (...input: Input) => OutputEffect<R>;
	export type FnAny<R> = (...input: Input) => OutputSync | OutputEffect<R>;

	export function exec<R>(fn: FnAny<R>, ...[request]: Input) {
		const response = fn(request);
		if (!Effect.isEffect(response)) return Effect.succeed(response);
		return response;
	}
}

export function basicHandler(
	path: Path.Type,
	fn: Fn.FnSync,
): Handler<'basicHandler', never>;
export function basicHandler<R>(
	path: Path.Type,
	fn: Fn.FnEffect<R>,
): Handler<'basicHandler', R>;
export function basicHandler<R>(path: Path.Type, fn: Fn.FnAny<R>) {
	return new Handler('basicHandler', ({ url, request }) => {
		if (!Path.matched(path, url))
			return Effect.succeed({ matched: false, response: undefined });

		return Effect.gen(function* () {
			return {
				matched: true,
				response: yield* Fn.exec(fn, request),
			};
		});
	});
}
