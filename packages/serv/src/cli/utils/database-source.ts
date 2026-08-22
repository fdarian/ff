import { Effect } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

export interface DatabaseSource {
	readonly getConnectionUrl: Effect.Effect<
		string,
		Error,
		ChildProcessSpawner.ChildProcessSpawner
	>;
	readonly displayName: string;
}

export const createRailwaySource = (config: {
	projectId: string;
	environmentId: string;
	serviceId: string;
}): DatabaseSource => ({
	displayName: 'Railway',
	getConnectionUrl: Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

		yield* spawner.exitCode(
			ChildProcess.make(
				'railway',
				[
					'link',
					`--project=${config.projectId}`,
					`--environment=${config.environmentId}`,
					`--service=${config.serviceId}`,
				],
				{ stdout: 'inherit' },
			),
		);

		const output = yield* spawner.string(
			ChildProcess.make('railway', [
				'run',
				'node',
				'-e',
				'console.log(process.env.DATABASE_PUBLIC_URL)',
			]),
		);

		return output.trim();
	}),
});

export const createDirectSource = (url: string): DatabaseSource => ({
	displayName: 'Direct Connection',
	getConnectionUrl: Effect.succeed(url),
});
