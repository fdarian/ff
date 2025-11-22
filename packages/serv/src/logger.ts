import { Config, Effect, Layer, Option } from 'effect';
import pino from 'pino';

// Base logger

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
		level?: pino.Level;
		stream?: pino.DestinationStream;
	};

	export function create(params?: CreateParams) {
		const logger = pino(
			{
				level: params?.level ?? 'info',
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

	export function is(x: object): x is LoggerType {
		return '_pino' in x;
	}
}
type LoggerType = ReturnType<typeof LoggerType.create>;

// Effect service
const createInstance = Effect.fn(function* (params?: LoggerType.CreateParams) {
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

const tag = 'ff-serv/logger' as const;
export class Logger extends Effect.Service<Logger>()(tag, {
	effect: createInstance(),
}) {
	static create(params?: LoggerType.CreateParams) {
		return Logger.make(LoggerType.create(params));
	}

	static layer = (params?: Parameters<typeof createInstance>[0]) =>
		Layer.effect(
			Logger,
			Effect.gen(function* () {
				return Logger.make(yield* createInstance(params));
			}),
		);

	//

	static get = Effect.fn(function* () {
		const logger = yield* Effect.serviceOption(Logger);
		if (Option.isNone(logger)) return undefined;
		return logger.value;
	});

	static replace =
		(logger: Logger | LoggerType | pino.Logger | undefined) =>
		<A, E, R>(e: Effect.Effect<A, E, R>) => {
			if (logger == null) return e;
			if (logger instanceof Logger)
				return Effect.provideService(e, Logger, logger);

			if (LoggerType.is(logger)) {
				return Effect.provideService(e, Logger, Logger.make(logger));
			}

			return Effect.provideService(
				e,
				Logger,
				Logger.make(LoggerType.fromPino(logger)),
			);
		};

	static replaceChild =
		(...params: Parameters<LoggerType['child']>) =>
		<A, E, R>(e: Effect.Effect<A, E, R>) =>
			Effect.gen(function* () {
				const logger = yield* Logger.get();
				if (logger == null) return yield* e;

				const child = logger.child(...params);
				return yield* Effect.provideService(e, Logger, Logger.make(child));
			});

	// --

	static info = Effect.fn(function* (
		...params: Parameters<LoggerType['info']>
	) {
		const logger = yield* Logger.get();
		if (logger == null) return;
		logger.info(...params);
	});

	static debug = Effect.fn(function* (
		...params: Parameters<LoggerType['debug']>
	) {
		const logger = yield* Logger.get();
		if (logger == null) return;
		logger.debug(...params);
	});

	static warn = Effect.fn(function* (
		...params: Parameters<LoggerType['warn']>
	) {
		const logger = yield* Logger.get();
		if (logger == null) return;
		logger.warn(...params);
	});

	static error = Effect.fn(function* (
		...params: Parameters<LoggerType['error']>
	) {
		const logger = yield* Logger.get();
		if (logger == null) return;
		logger.error(...params);
	});

	static flush = Effect.fn(function* (
		...params: Parameters<LoggerType['flush']>
	) {
		const logger = yield* Logger.get();
		if (logger == null) return;
		logger.flush(...params);
	});
}
