import * as cli from '@effect/cli';
import { Effect } from 'effect';
import { pullDatabaseCommand } from './pull-database.js';

export const dbCommand = cli.Command.make('db', {}, () =>
	Effect.log('Database commands - Use --help for available subcommands'),
).pipe(cli.Command.withSubcommands([pullDatabaseCommand]));
