import * as platform from '@effect/platform';
import cliProgress from 'cli-progress';
import { Effect, Fiber } from 'effect';
import type { DatabaseSourceConfig } from '../../config/schema.js';
import {
	createDirectSource,
	createRailwaySource,
	type DatabaseSource,
} from '../../utils/database-source.js';
import {
	promptDatabaseSourceType,
	promptDirectUrl,
	promptRailwayConfig,
} from '../../utils/prompts.js';

export const getDatabaseUrlFromSource = (source: DatabaseSource) =>
	Effect.gen(function* () {
		yield* Effect.log(`Getting database URL from ${source.displayName}...`);
		return yield* source.getConnectionUrl;
	});

export const dumpToFile = (databaseUrl: string, filePath: string) =>
	Effect.gen(function* () {
		const fs = yield* platform.FileSystem.FileSystem;

		const bar = new cliProgress.SingleBar({
			format: 'Dumping |{bar}| {fileSize} MB ({rate} MB/s)',
			barCompleteChar: '\u2588',
			barIncompleteChar: '\u2591',
			hideCursor: true,
		});

		const process = yield* platform.Command.make(
			'pg_dump',
			databaseUrl,
			'--file',
			filePath,
		).pipe(platform.Command.start);

		bar.start(100, 0, { fileSize: '0', rate: '0' });

		const startTime = Date.now();
		let lastSize = 0n;
		let lastCheckTime = startTime;

		const fileSizeMonitor = Effect.gen(function* () {
			while (true) {
				yield* Effect.sleep('500 millis');

				const stat = yield* fs
					.stat(filePath)
					.pipe(Effect.catchAll(() => Effect.succeed({ size: 0n })));
				const now = Date.now();
				const elapsed = (now - startTime) / 1000;
				const sizeBytes = Number(stat.size);
				const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

				const timeSinceLastCheck = (now - lastCheckTime) / 1000;
				const bytesSinceLastCheck = Number(stat.size - lastSize);
				const rateMB =
					timeSinceLastCheck > 0
						? (bytesSinceLastCheck / 1024 / 1024 / timeSinceLastCheck).toFixed(
								2,
							)
						: '0';

				bar.update(elapsed, {
					fileSize: sizeMB,
					rate: rateMB,
				});

				lastSize = stat.size;
				lastCheckTime = now;
			}
		});

		const monitorFiber = yield* Effect.fork(fileSizeMonitor);
		yield* process.exitCode;
		yield* Fiber.interrupt(monitorFiber);

		bar.stop();
		yield* Effect.log('Dump complete');
	});

export const resolveDatabaseSource = (
	sourceConfig?: DatabaseSourceConfig,
): Effect.Effect<
	DatabaseSource,
	Effect.Effect.Error<typeof promptDatabaseSourceType>
> =>
	Effect.gen(function* () {
		if (sourceConfig) {
			if (sourceConfig.type === 'railway') {
				return createRailwaySource({
					projectId: sourceConfig.projectId,
					environmentId: sourceConfig.environmentId,
					serviceId: sourceConfig.serviceId,
				});
			}
			return createDirectSource(sourceConfig.databaseUrl);
		}

		const sourceType = yield* promptDatabaseSourceType;

		if (sourceType === 'railway') {
			const config = yield* promptRailwayConfig;
			return createRailwaySource(config);
		}

		const url = yield* promptDirectUrl;
		return createDirectSource(url);
	});
