import {
	Config,
	Context,
	Effect,
	Logger as EffectLogger,
	HashMap,
	Layer,
	LogLevel,
	ManagedRuntime,
	Option,
} from 'effect';
import pino from 'pino';

// Pino Instance

namespace LoggerType {
	export function fromPino(x: pino.Logger<never, boolean>) {
		return {
			info: x.info.bind(x),
			error: x.error.bind(x),
			warn: x.warn.bind(x),
			debug: x.debug.bind(x),
			child: (...params: Parameters<typeof x.child>) => {
				return fromPino(
					x.child(...params) as unknown as pino.Logger<never, boolean>,
				);
			},
			flush: x.flush.bind(x),
			_pino: x,
		};
	}

	export type CreateParams = {
		stream?: pino.DestinationStream;
	};

	export function create(params?: CreateParams) {
		const logger = pino(
			{
				level: 'trace', // Level is managed by Effect, so we set the lowest here
				serializers: {
					error: pino.stdSerializers.errWithCause,
					err: pino.stdSerializers.errWithCause,
				},
				formatters: {
					level: (label) => {
						return { level: label };
					},
				},
			},
			params?.stream,
		);
		return fromPino(logger);
	}

	export type Type = ReturnType<typeof LoggerType.create>;

	export function is(x: object): x is Type {
		return '_pino' in x;
	}
}
type LoggerType = LoggerType.Type;

// The Gist

const createInstance = (params?: LoggerType.CreateParams) =>
	Effect.gen(function* () {
		const isDev = Option.getOrNull(
			yield* Config.boolean('DEV').pipe(Config.option),
		);
		const logFile = Option.getOrNull(
			yield* Config.boolean('LOGGER_LOGFILE').pipe(Config.option),
		);

		return LoggerType.create({
			...params,
			...(isDev && {
				stream: logFile
					? pino.transport({
							target: 'pino/file',
							options: {
								destination: './logs/server.log',
								mkdir: true,
							},
						})
					: pino.transport({
							target: 'pino-pretty',
							options: {
								ignore: 'pid,hostname',
							},
						}),
			}),
		});
	});

// Pino Context and Effect Logger integration

type LogParams = [obj: unknown, msg?: string];
function extractParams(...[obj, msg]: LogParams) {
	if (typeof obj === 'string') {
		return { message: obj };
	}
	return { message: msg, attributes: obj as Record<string, any> };
}

/** A simple helper for calling pino log functions */
function callPino(
	{
		annotations,
		message,
	}: Pick<EffectLogger.Logger.Options<unknown>, 'annotations' | 'message'>,
	call: (...params: [obj: unknown, msg?: string]) => void,
) {
	const entries = HashMap.toEntries(annotations);
	if (entries.length > 0) {
		return call(Object.fromEntries(entries), String(message));
	}

	return call(String(message));
}

namespace PinoCtx {
	const tag = 'ff-serv/Pino';
	export type Type = ReturnType<typeof create>;

	export function is(obj: unknown): obj is Type {
		return (
			typeof obj === 'object' &&
			obj != null &&
			'_tag' in obj &&
			obj._tag === tag
		);
	}

	export function create(pino: LoggerType) {
		return {
			_tag: tag,
			pino,
			effectLogger: EffectLogger.make(({ logLevel, ...input }) => {
				switch (logLevel) {
					case LogLevel.Info:
						return callPino(input, pino.info);
					case LogLevel.Debug:
						return callPino(input, pino.debug);
					case LogLevel.Warning:
						return callPino(input, pino.warn);
					case LogLevel.Error:
					case LogLevel.Fatal:
						return callPino(input, pino.error);
					default:
						return callPino(input, pino.info);
				}
			}),
		};
	}
}
type PinoCtx = PinoCtx.Type;

class Pino extends Context.Tag('ff-serv/Pino')<Pino, PinoCtx>() {}

// Facade

export namespace Logger {
	export const layer = (opts?: Parameters<typeof createInstance>[0]) =>
		EffectLogger.replaceEffect(
			EffectLogger.defaultLogger,
			Effect.gen(function* () {
				return (yield* Pino).effectLogger;
			}),
		).pipe(
			Layer.provideMerge(
				Layer.effect(
					Pino,
					Effect.gen(function* () {
						return PinoCtx.create(yield* createInstance(opts));
					}),
				),
			),
		);

	//

	export const sync = () =>
		Effect.gen(function* () {
			const pino = yield* Pino;
			const runtime = ManagedRuntime.make(
				EffectLogger.replace(EffectLogger.defaultLogger, pino.effectLogger),
			);
			return {
				info: (...params: Parameters<typeof Logger.info>) =>
					Logger.info(...params).pipe((e) => runtime.runSync(e)),
				debug: (...params: Parameters<typeof Logger.debug>) =>
					Logger.debug(...params).pipe((e) => runtime.runSync(e)),
				warn: (...params: Parameters<typeof Logger.warn>) =>
					Logger.warn(...params).pipe((e) => runtime.runSync(e)),
				error: (...params: Parameters<typeof Logger.error>) =>
					Logger.error(...params).pipe((e) => runtime.runSync(e)),
			};
		});

	/** @deprecated — will be renamed to `sync` */
	export const get = () => Logger.sync();

	export const replace =
		(logger: LoggerType | pino.Logger) =>
		<A, E, R>(e: Effect.Effect<A, E, R>) =>
			Effect.gen(function* () {
				const oldPinoCtx = yield* Pino;
				const pino = LoggerType.is(logger)
					? logger
					: LoggerType.fromPino(logger);
				const pinoCtx = PinoCtx.create(pino);

				return yield* Effect.provide(
					e,
					Layer.mergeAll(
						EffectLogger.replace(oldPinoCtx.effectLogger, pinoCtx.effectLogger),
						Layer.succeed(Pino, pinoCtx),
					),
				);
			});

	export const replaceChild =
		(...params: Parameters<LoggerType['child']>) =>
		<A, E, R>(e: Effect.Effect<A, E, R>) =>
			Effect.gen(function* () {
				const oldPinoCtx = yield* Pino;
				const pino = oldPinoCtx.pino.child(...params);
				const pinoCtx = PinoCtx.create(pino);

				return yield* Effect.provide(
					Effect.provide(
						e,
						EffectLogger.replace(oldPinoCtx.effectLogger, pinoCtx.effectLogger),
					),
					Layer.succeed(Pino, pinoCtx),
				);
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

	/** @deprecated */
	export const flush = (..._params: Parameters<LoggerType['flush']>) =>
		Effect.void;
}
