import { Effect, Runtime } from 'effect';

type LogParams = [obj: unknown, msg?: string];
function extractParams(...[obj, msg]: LogParams) {
	if (typeof obj === 'string') {
		return { message: obj };
	}
	// biome-ignore lint/suspicious/noExplicitAny: log attributes are unstructured
	return { message: msg, attributes: obj as Record<string, any> };
}

// biome-ignore lint/suspicious/noExplicitAny: log annotations are unstructured
type LogAnnotations = Record<string, any>;

export type SyncLogger = {
	info: (...params: Parameters<typeof Logger.info>) => void;
	debug: (...params: Parameters<typeof Logger.debug>) => void;
	warn: (...params: Parameters<typeof Logger.warn>) => void;
	error: (...params: Parameters<typeof Logger.error>) => void;
	child: (annotations: LogAnnotations) => SyncLogger;
};

function makeSyncLogger(
	runtime: Runtime.Runtime<never>,
	annotations: LogAnnotations,
): SyncLogger {
	const run = (e: Effect.Effect<void, never, never>) => {
		const annotated =
			Object.keys(annotations).length > 0
				? e.pipe(Effect.annotateLogs(annotations))
				: e;
		void Runtime.runPromise(runtime)(annotated);
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
		child: (childAnnotations: LogAnnotations) =>
			makeSyncLogger(runtime, { ...annotations, ...childAnnotations }),
	};
}

export namespace Logger {
	export const sync = (annotations?: LogAnnotations) =>
		Effect.gen(function* () {
			const runtime = yield* Effect.runtime();
			return makeSyncLogger(runtime, annotations ?? {});
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
