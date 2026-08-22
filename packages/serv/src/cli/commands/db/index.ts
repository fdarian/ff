import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';
import { dumpCommand } from './dump.js';
import { pullCommand } from './pull.js';

export const dbCommand = Command.make('db', {}, () =>
	Effect.log('Database commands - UsepullCommandle subcommands'),
).pipe(Command.withSubcommands([pullCommand, dumpCommand]));
