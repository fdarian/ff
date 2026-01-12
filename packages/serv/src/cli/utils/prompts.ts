import { Effect } from 'effect';
import inquirer from 'inquirer';

const typedPrompt = <T>(questions: Parameters<typeof inquirer.prompt>[0]) =>
	Effect.tryPromise(() => inquirer.prompt(questions) as Promise<T>);

export const promptDatabaseSourceType = typedPrompt<{
	sourceType: 'railway' | 'direct';
}>([
	{
		type: 'list',
		name: 'sourceType',
		message: 'Select database source type:',
		choices: [
			{ name: 'Railway', value: 'railway' },
			{ name: 'Direct URL', value: 'direct' },
		],
	},
]).pipe(Effect.map((r) => r.sourceType));

export const promptRailwayConfig = typedPrompt<{
	projectId: string;
	environmentId: string;
	serviceId: string;
}>([
	{
		type: 'input',
		// @ts-expect-error - expected, need better typing. Try callling it directly with inquirer.prompt, it's overload issue
		name: 'projectId',
		message: 'Enter Railway Project ID:',
		validate: (input: string) =>
			input.trim().length > 0 || 'Project ID is required',
	},
	{
		type: 'input',
		// @ts-expect-error - expected, need better typing. Try callling it directly with inquirer.prompt, it's overload issue
		name: 'environmentId',
		message: 'Enter Railway Environment ID:',
		validate: (input: string) =>
			input.trim().length > 0 || 'Environment ID is required',
	},
	{
		type: 'input',
		// @ts-expect-error - expected, need better typing. Try callling it directly with inquirer.prompt, it's overload issue
		name: 'serviceId',
		message: 'Enter Railway Service ID:',
		validate: (input: string) =>
			input.trim().length > 0 || 'Service ID is required',
	},
]);

export const promptDirectUrl = typedPrompt<{ databaseUrl: string }>([
	{
		type: 'input',
		name: 'databaseUrl',
		message: 'Enter source database URL:',
	},
]).pipe(Effect.map((r) => r.databaseUrl));

export const promptTargetUrl = (defaultUrl?: string) =>
	typedPrompt<{ targetUrl: string }>([
		{
			type: 'input',
			name: 'targetUrl',
			message: 'Enter target database URL:',
			default: defaultUrl,
		},
	]).pipe(Effect.map((r) => r.targetUrl));

export const promptRetry = typedPrompt<{ retry: boolean }>([
	{
		type: 'confirm',
		name: 'retry',
		message: 'An error occurred. Would you like to retry?',
		default: true,
	},
]).pipe(Effect.map((r) => r.retry));

export const promptCleanupDump = (dumpPath: string) =>
	typedPrompt<{ cleanup: boolean }>([
		{
			type: 'confirm',
			name: 'cleanup',
			message: `Delete dump file at ${dumpPath}?`,
			default: false,
		},
	]).pipe(Effect.map((r) => r.cleanup));
