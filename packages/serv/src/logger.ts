import { Effect, FiberSet, Runtime } from 'effect';

type LogParams = [obj: unknown, msg?: string];
function extractParams(...[obj, msg]: LogParams) {
	if (typeof obj === 'string') {
		return { message: obj };
	}
	return { message: msg, attributes: obj as Record<string, any> };
}

export namespace Logger {
	export const sync = () =>
		Effect.gen(function* () {
			const runtime = yield* Effect.runtime();

			const run = (e: Effect.Effect<void, never, never>) => {
				// Intentionally ignoring the await here
				// void runPromise(e);
				void Runtime.runPromise(runtime)(e);
			};

			return {
				info: (...params: Parameters<typeof Logger.info>) =>
					run(Logger.info(...params)),
				debug: (...params: Parameters<typeof Logger.debug>) =>
					run(Logger.debug(...params)),
				warn: (...params: Parameters<typeof Logger.warn>) =>
					run(Logger.warn(...params)),
				error: (...params: Parameters<typeof Logger.error>) =>
					run(Logger.error(...params)),
			};
		});

	// --

	export const info = (...params: LogParams) =>
		Effect.gen(function* () {
			const { message, attributes } = extractParams(...params);
			yield* Effect.logInfo(message).pipe(
				attributes ? Effect.annotateLogs(attributes) : (e) => e,
			);
		});

	export const debug = (...params: LogParams) =>
		Effect.gen(function* () {
			const { message, attributes } = extractParams(...params);
			yield* Effect.logDebug(message).pipe(
				attributes ? Effect.annotateLogs(attributes) : (e) => e,
			);
		});

	export const warn = (...params: LogParams) =>
		Effect.gen(function* () {
			const { message, attributes } = extractParams(...params);
			yield* Effect.logWarning(message).pipe(
				attributes ? Effect.annotateLogs(attributes) : (e) => e,
			);
		});

	export const error = (...params: LogParams) =>
		Effect.gen(function* () {
			const { message, attributes } = extractParams(...params);
			yield* Effect.logError(message).pipe(
				attributes ? Effect.annotateLogs(attributes) : (e) => e,
			);
		});
}
