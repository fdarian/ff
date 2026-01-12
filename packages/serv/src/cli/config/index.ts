import * as platform from '@effect/platform';
import { Effect, Option, Schema } from 'effect';
import { FfServConfig } from './schema.js';

const DEFAULT_CONFIG_PATHS = ['.ff-serv.json', 'ff-serv.config.json'];

const tryLoadConfigFromPath = (
	filePath: string,
): Effect.Effect<FfServConfig, never, platform.FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* platform.FileSystem.FileSystem;

		const exists = yield* fs.exists(filePath).pipe(
			Effect.catchAll(() => Effect.succeed(false)),
		);

		if (!exists) {
			return Option.none();
		}

		const content = yield* fs.readFileString(filePath).pipe(
			Effect.catchAll(() => Effect.succeed(Option.none())),
			Effect.flatten,
		);

		if (Option.isNone(content)) {
			return Option.none();
		}

		const parsed = yield* Effect.try(() =>
			JSON.parse(content.value),
		).pipe(Effect.catchAll(() => Effect.succeed(Option.none())));

		if (Option.isNone(parsed)) {
			return Option.none();
		}

		const validated = yield* Schema.decodeUnknown(FfServConfig)(
			parsed,
		).pipe(
			Effect.catchAll(() => Effect.succeed(Option.none())),
			Effect.map(Option.some),
		);

		return validated;
	}).pipe(Effect.flatten);

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
