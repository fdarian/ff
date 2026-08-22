import { Effect, FileSystem, Option, Schema } from 'effect';
import { FfServConfig } from './schema.js';

const DEFAULT_CONFIG_PATHS = ['.ff-serv.json', 'ff-serv.config.json'];

const tryLoadConfigFromPath = (
	filePath: string,
): Effect.Effect<Option.Option<FfServConfig>, never, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;

		const exists = yield* fs
			.exists(filePath)
			.pipe(Effect.catch(() => Effect.succeed(false)));

		if (!exists) {
			return Option.none<FfServConfig>();
		}

		const contentResult = yield* fs
			.readFileString(filePath)
			.pipe(Effect.result);

		if (contentResult._tag === 'Failure') {
			return Option.none<FfServConfig>();
		}

		const parseResult = yield* Effect.try(() =>
			JSON.parse(contentResult.success),
		).pipe(Effect.result);

		if (parseResult._tag === 'Failure') {
			yield* Effect.logWarning(`Failed to parse config file: ${filePath}`);
			return Option.none<FfServConfig>();
		}

		const validateResult = yield* Schema.decodeUnknownEffect(FfServConfig)(
			parseResult.success,
		).pipe(Effect.result);

		if (validateResult._tag === 'Failure') {
			yield* Effect.logWarning(`Invalid config schema in: ${filePath}`);
			return Option.none<FfServConfig>();
		}

		return Option.some(validateResult.success);
	});

export const loadConfig = (
	customConfigPath?: string,
): Effect.Effect<Option.Option<FfServConfig>, never, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const pathsToTry = customConfigPath
			? [customConfigPath]
			: [
					...(process.env.FF_SERV_CONFIG ? [process.env.FF_SERV_CONFIG] : []),
					...DEFAULT_CONFIG_PATHS,
				];

		for (const configPath of pathsToTry) {
			const result = yield* tryLoadConfigFromPath(configPath);
			if (Option.isSome(result)) {
				yield* Effect.log(`Loaded config from: ${configPath}`);
				return Option.some(result.value);
			}
		}

		return Option.none();
	});
