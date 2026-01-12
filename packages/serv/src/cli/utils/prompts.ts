import { Effect } from 'effect';
import inquirer from 'inquirer';

export const promptDatabaseSourceType = Effect.tryPromise(() =>
	inquirer.prompt([
		{
			type: 'list',
			name: 'sourceType',
			message: 'Select database source type:',
			choices: [
				{ name: 'Railway', value: 'railway' },
				{ name: 'Direct URL', value: 'direct' },
			],
		},
	]),
).pipe(Effect.map((r) => r.sourceType as 'railway' | 'direct'));

export const promptRailwayConfig = Effect.tryPromise(() =>
	inquirer.prompt([
		{
			type: 'input',
			name: 'projectId',
			message: 'Enter Railway Project ID:',
		},
		{
			type: 'input',
			name: 'environmentId',
			message: 'Enter Railway Environment ID:',
		},
		{
			type: 'input',
			name: 'serviceId',
			message: 'Enter Railway Service ID:',
		},
	]),
).pipe(
	Effect.map(
		(r) =>
			r as {
				projectId: string;
				environmentId: string;
				serviceId: string;
			},
	),
);

export const promptDirectUrl = Effect.tryPromise(() =>
	inquirer.prompt([
		{
			type: 'input',
			name: 'databaseUrl',
			message: 'Enter source database URL:',
		},
	]),
).pipe(Effect.map((r) => r.databaseUrl as string));

export const promptTargetUrl = (defaultUrl?: string) =>
	Effect.tryPromise(() =>
		inquirer.prompt([
			{
				type: 'input',
				name: 'targetUrl',
				message: 'Enter target database URL:',
				default: defaultUrl,
			},
		]),
	).pipe(Effect.map((r) => r.targetUrl as string));

export const promptRetry = Effect.tryPromise(() =>
	inquirer.prompt([
		{
			type: 'confirm',
			name: 'retry',
			message: 'An error occurred. Would you like to retry?',
			default: true,
		},
	]),
).pipe(Effect.map((r) => r.retry as boolean));

export const promptCleanupDump = (dumpPath: string) =>
	Effect.tryPromise(() =>
		inquirer.prompt([
			{
				type: 'confirm',
				name: 'cleanup',
				message: `Delete dump file at ${dumpPath}?`,
				default: false,
			},
		]),
	).pipe(Effect.map((r) => r.cleanup as boolean));
