import * as platform from '@effect/platform';
import { Effect, Option, Schema } from 'effect';
import { FfServConfig } from './schema.js';

const DEFAULT_CONFIG_PATHS = ['.ff-serv.json', 'ff-serv.config.json'];

const tryLoadConfigFromPath = (
	filePath: string,
): Effect.Effect<
	Option.Option<FfServConfig>,
	never,
	platform.FileSystem.FileSystem
> =>
	Effect.gen(function* () {
		const fs = yield* platform.FileSystem.FileSystem;

		const exists = yield* fs
			.exists(filePath)
			.pipe(Effect.catchAll(() => Effect.succeed(false)));

		if (!exists) {
			return Option.none<FfServConfig>();
		}

		const contentResult = yield* fs
			.readFileString(filePath)
			.pipe(Effect.either);

		if (contentResult._tag === 'Left') {
			return Option.none<FfServConfig>();
		}

		const parseResult = yield* Effect.try(() =>
			JSON.parse(contentResult.right),
		).pipe(Effect.either);

		if (parseResult._tag === 'Left') {
			return Option.none<FfServConfig>();
		}

		const validateResult = yield* Schema.decodeUnknown(FfServConfig)(
			parseResult.right,
		).pipe(Effect.either);

		if (validateResult._tag === 'Left') {
			return Option.none<FfServConfig>();
		}

		return Option.some(validateResult.right);
	});

export const loadConfig = (
	customConfigPath?: string,
): Effect.Effect<
	Option.Option<FfServConfig>,
	never,
	platform.FileSystem.FileSystem
> =>
	Effect.gen(function* () {
		const pathsToTry = customConfigPath
			? [customConfigPath]
			: [
					...(process.env.FF_SERV_CONFIG
						? [process.env.FF_SERV_CONFIG]
						: []),
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
