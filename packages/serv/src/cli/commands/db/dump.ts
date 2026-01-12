import * as cli from '@effect/cli';
import { Effect, Option } from 'effect';
import { loadConfig } from '../../config/index.js';
import {
	dumpToFile,
	getDatabaseUrlFromSource,
	resolveDatabaseSource,
} from './shared.js';

export const dumpCommand = cli.Command.make(
	'dump',
	{
		output: cli.Options.file('output').pipe(
			cli.Options.withAlias('o'),
			cli.Options.withDefault('./dump.sql'),
		),
		config: cli.Options.file('config').pipe(cli.Options.optional),
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
