import { Effect, Option } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { loadConfig } from '../../config/index.js';
import {
	dumpToFile,
	getDatabaseUrlFromSource,
	resolveDatabaseSource,
} from './shared.js';

export const dumpCommand = Command.make(
	'dump',
	{
		output: Flag.file('output').pipe(
			Flag.withAlias('o'),
			Flag.withDefault('./dump.sql'),
		),
		config: Flag.file('config').pipe(Flag.optional),
	},
	({ output, config }) =>
		Effect.gen(function* () {
			const loadedConfig = yield* loadConfig(
				Option.isSome(config) ? config.value : undefined,
			);

			const source = yield* resolveDatabaseSource(
				Option.isSome(loadedConfig) && loadedConfig.value.pullDatabase?.source
					? loadedConfig.value.pullDatabase.source
					: undefined,
			);

			const sourceUrl = yield* getDatabaseUrlFromSource(source);

			yield* Effect.log(`Dumping database to: ${output}`);
			yield* dumpToFile(sourceUrl, output);
			yield* Effect.log(`Database dump complete: ${output}`);
		}).pipe(Effect.scoped),
);
