import * as platform from '@effect/platform';
import { Context, Effect, Layer } from 'effect';

export interface DatabaseSource {
	readonly getConnectionUrl: Effect.Effect<
		string,
		Error,
		platform.CommandExecutor.CommandExecutor
	>;
	readonly displayName: string;
}

export class DatabaseSourceService extends Context.Tag(
	'ff-serv/cli/DatabaseSourceService',
)<DatabaseSourceService, DatabaseSource>() {}

export const createRailwaySource = (config: {
	projectId: string;
	environmentId: string;
	serviceId: string;
}): DatabaseSource => ({
	displayName: 'Railway',
	getConnectionUrl: Effect.gen(function* () {
		yield* platform.Command.make(
			'railway',
			'link',
			`--project=${config.projectId}`,
			`--environment=${config.environmentId}`,
			`--service=${config.serviceId}`,
		).pipe(
			platform.Command.stdout('inherit'),
			platform.Command.exitCode,
		);

		const output = yield* platform.Command.make(
			'railway',
			'run',
			'node',
			'-e',
			'console.log(process.env.DATABASE_PUBLIC_URL)',
		).pipe(platform.Command.string);

		return output.trim();
	}),
});

export const createDirectSource = (url: string): DatabaseSource => ({
	displayName: 'Direct Connection',
	getConnectionUrl: Effect.succeed(url),
});

export const createRailwaySourceLayer = (config: {
	projectId: string;
	environmentId: string;
	serviceId: string;
}) => Layer.succeed(DatabaseSourceService, createRailwaySource(config));

export const createDirectSourceLayer = (url: string) =>
	Layer.succeed(DatabaseSourceService, createDirectSource(url));
