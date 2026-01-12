import * as cli from '@effect/cli';
import { Effect } from 'effect';
import { dumpCommand } from './dump.js';
import { pullCommand } from './pull.js';

export const dbCommand = cli.Command.make('db', {}, () =>
	Effect.log('Database commands - UsepullCommandle subcommands'),
).pipe(cli.Command.withSubcommands([pullCommand, dumpCommand]));
