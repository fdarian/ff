#!/usr/bin/env node
import * as cli from '@effect/cli';
import * as BunContext from '@effect/platform-bun/BunContext';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { Effect } from 'effect';
import { dbCommand } from './commands/db/index.js';

const rootCommand = cli.Command.make('ff-serv', {}, () =>
	Effect.log('ff-serv CLI - Use --help for available commands'),
).pipe(cli.Command.withSubcommands([dbCommand]));

const main = cli.Command.run(rootCommand, {
	name: 'ff-serv',
	version: '0.1.4',
});

main(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain);
