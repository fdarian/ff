#!/usr/bin/env node
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';
import pkg from '../../package.json' with { type: 'json' };
import { dbCommand } from './commands/db/index.js';

const rootCommand = Command.make('ff-serv', {}, () =>
	Effect.log('ff-serv CLI - Use --help for available commands'),
).pipe(Command.withSubcommands([dbCommand]));

const main = Command.runWith(rootCommand, {
	version: pkg.version,
});

BunRuntime.runMain(main(process.argv).pipe(Effect.provide(BunServices.layer)));
