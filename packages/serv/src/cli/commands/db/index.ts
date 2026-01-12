import * as cli from '@effect/cli';
import { Effect } from 'effect';
import { dumpCommand } from './dump.js';
import { pullDatabaseCommand } from './pull-database.js';

export const dbCommand = cli.Command.make('db', {}, () =>
	Effect.log('Database commands - Use --help for available subcommands'),
).pipe(cli.Command.withSubcommands([pullDatabaseCommand, dumpCommand]));
