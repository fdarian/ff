import * as cli from '@effect/cli';
import * as platform from '@effect/platform';
import { type Cause, Effect, Option } from 'effect';
import inquirer from 'inquirer';
import postgres from 'postgres';
import { loadConfig } from '../../config/index.js';
import {
	promptCleanupDump,
	promptRetry,
	promptTargetUrl,
} from '../../utils/prompts.js';
import {
	dumpToFile,
	getDatabaseUrlFromSource,
	resolveDatabaseSource,
} from './shared.js';

const DEFAULT_TARGET_DATABASE_URL =
	'postgresql://postgres:supersecret@postgres:5432/postgres';

type DatabaseInfo = {
	host: string;
	port: string;
	database: string;
	user: string;
};

const parsePostgresUrl = (url: string): DatabaseInfo => {
	const parsed = new URL(url);
	return {
		host: parsed.hostname || 'localhost',
		port: parsed.port || '5432',
		database: parsed.pathname.slice(1) || 'postgres',
		user: parsed.username || 'postgres',
	};
};

const confirmDatabaseUrls = (sourceUrl: string | null, targetUrl: string) =>
	Effect.gen(function* () {
		const target = parsePostgresUrl(targetUrl);

		if (sourceUrl) {
			const source = parsePostgresUrl(sourceUrl);
			yield* Effect.log('\n--- Source Database ---');
			yield* Effect.log(`Host: ${source.host}`);
			yield* Effect.log(`Port: ${source.port}`);
			yield* Effect.log(`Database: ${source.database}`);
		} else {
			yield* Effect.log('\n--- Source ---');
			yield* Effect.log('Local dump file');
		}

		yield* Effect.log('\n--- Target Database ---');
		yield* Effect.log(`Host: ${target.host}`);
		yield* Effect.log(`Port: ${target.port}`);
		yield* Effect.log(`Database: ${target.database}`);

		return yield* Effect.tryPromise(() =>
			inquirer.prompt([
				{
					type: 'confirm',
					name: 'confirmed',
					message: 'Are the settings correct?',
					default: false,
				},
			]),
		).pipe(Effect.map((r) => r.confirmed as boolean));
	});

type SchemaTableInfo = {
	schema: string;
	tables: string[];
};

const getSchemaTablesInfo = (databaseUrl: string) =>
	Effect.gen(function* () {
		const conn = postgres(databaseUrl);
		yield* Effect.addFinalizer(() =>
			Effect.ignore(Effect.tryPromise(() => conn.end())),
		);

		const schemas = yield* Effect.tryPromise(
			() =>
				conn<[{ schema_name: string }]>`
			SELECT schema_name
			FROM information_schema.schemata
			WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
			ORDER BY schema_name
		`,
		);

		const schemaTableInfo: SchemaTableInfo[] = [];

		for (const { schema_name } of schemas) {
			const tables = yield* Effect.tryPromise(
				() =>
					conn<[{ table_name: string }]>`
				SELECT table_name
				FROM information_schema.tables
				WHERE table_schema = ${schema_name}
				ORDER BY table_name
			`,
			);

			schemaTableInfo.push({
				schema: schema_name,
				tables: tables.map((t) => t.table_name),
			});
		}

		return schemaTableInfo;
	});

const confirmDatabaseReset = (databaseUrl: string) =>
	Effect.gen(function* () {
		const schemaInfo = yield* getSchemaTablesInfo(databaseUrl);

		yield* Effect.log('\nThe following will be truncated:\n');

		for (const { schema, tables } of schemaInfo) {
			if (tables.length === 0) {
				yield* Effect.log(`Schema: ${schema}`);
				yield* Effect.log('  (no tables)\n');
				continue;
			}

			yield* Effect.log(`Schema: ${schema}`);
			for (const table of tables) {
				yield* Effect.log(`  - ${table}`);
			}
			yield* Effect.log('');
		}

		const { shouldReset } = yield* Effect.tryPromise(() =>
			inquirer.prompt([
				{
					type: 'confirm',
					name: 'shouldReset',
					message: 'Proceed with truncation?',
					default: false,
				},
			]),
		);

		return { shouldReset: shouldReset as boolean, schemaInfo };
	});

const truncateAllTables = (
	databaseUrl: string,
	schemaInfo: SchemaTableInfo[],
) =>
	Effect.gen(function* () {
		const conn = postgres(databaseUrl);
		yield* Effect.addFinalizer(() =>
			Effect.ignore(Effect.tryPromise(() => conn.end())),
		);

		yield* Effect.log(`Truncating ${schemaInfo.length} schema(s)...`);

		for (const { schema, tables } of schemaInfo) {
			if (tables.length === 0) {
				yield* Effect.log(`  No tables in "${schema}"`);
				continue;
			}

			yield* Effect.log(
				`Truncating ${tables.length} table(s) in schema "${schema}"...`,
			);

			const tableNames = tables.map((t) => `"${schema}"."${t}"`).join(', ');

			yield* Effect.tryPromise(() =>
				conn.unsafe(`TRUNCATE ${tableNames} RESTART IDENTITY CASCADE`),
			);
		}

		yield* Effect.log('Database reset complete');
	});

const restoreFromFile = (databaseUrl: string, filePath: string) =>
	Effect.gen(function* () {
		yield* Effect.log('Restoring from file');
		yield* platform.Command.make('psql', databaseUrl, '-f', filePath).pipe(
			platform.Command.stdout('inherit'),
			platform.Command.exitCode,
		);
	});

const createDumpFile = Effect.gen(function* () {
	const fs = yield* platform.FileSystem.FileSystem;
	const path = yield* platform.Path.Path;
	const tmpDir = yield* fs.makeTempDirectory();
	const file = path.join(tmpDir, 'dump.sql');
	yield* Effect.log(`Prepared dump file: ${file}`);
	return file;
});

const saveDumpToPath = (sourcePath: string, destinationPath: string) =>
	Effect.gen(function* () {
		const fs = yield* platform.FileSystem.FileSystem;
		yield* fs.copy(sourcePath, destinationPath);
		yield* Effect.log(`Dump saved to: ${destinationPath}`);
	});

interface DumpState {
	filePath: string;
	downloaded: boolean;
}

const executeWithRetry = <A, E, R>(
	operation: Effect.Effect<A, E, R>,
	dumpState: DumpState,
): Effect.Effect<A, E | Cause.UnknownException, R> =>
	Effect.catchAll(operation, (error) =>
		Effect.gen(function* () {
			yield* Effect.logError(`Operation failed: ${error}`);

			if (dumpState.downloaded) {
				yield* Effect.log(`Dump file preserved at: ${dumpState.filePath}`);
				yield* Effect.log('You can retry using --fromDump flag');
			}

			const shouldRetry = yield* promptRetry;

			if (shouldRetry) {
				yield* Effect.log('Retrying...');
				return yield* executeWithRetry(operation, dumpState);
			}

			return yield* Effect.fail(error);
		}),
	);

export const pullCommand = cli.Command.make(
	'pull',
	{
		fromDump: cli.Options.file('fromDump').pipe(cli.Options.optional),
		targetDatabaseUrl: cli.Args.text({ name: 'targetDatabaseUrl' }).pipe(
			cli.Args.optional,
		),
		saveDump: cli.Options.file('saveDump').pipe(cli.Options.optional),
		config: cli.Options.file('config').pipe(cli.Options.optional),
	},
	({ fromDump, targetDatabaseUrl, saveDump, config }) =>
		Effect.gen(function* () {
			const loadedConfig = yield* loadConfig(
				Option.isSome(config) ? config.value : undefined,
			);

			const targetUrl =
				Option.getOrUndefined(targetDatabaseUrl) ||
				Option.flatMap(loadedConfig, (c) =>
					Option.fromNullable(c.pullDatabase?.targetDatabaseUrl),
				).pipe(Option.getOrUndefined) ||
				(yield* promptTargetUrl(DEFAULT_TARGET_DATABASE_URL));

			let dumpState: DumpState;

			if (Option.isSome(fromDump)) {
				dumpState = { filePath: fromDump.value, downloaded: true };
				yield* Effect.log(`Using dump file: ${dumpState.filePath}`);

				const confirmed = yield* confirmDatabaseUrls(null, targetUrl);
				if (!confirmed) {
					yield* Effect.log('Operation cancelled');
					return;
				}
			} else {
				const dumpPath = yield* createDumpFile;
				dumpState = { filePath: dumpPath, downloaded: false };

				const source = yield* resolveDatabaseSource(
					Option.flatMap(loadedConfig, (c) =>
						Option.fromNullable(c.pullDatabase?.source),
					).pipe(Option.getOrUndefined),
				);

				const sourceUrl = yield* getDatabaseUrlFromSource(source);

				const urlsConfirmed = yield* confirmDatabaseUrls(sourceUrl, targetUrl);
				if (!urlsConfirmed) {
					yield* Effect.log('Operation cancelled');
					return;
				}

				yield* executeWithRetry(
					dumpToFile(sourceUrl, dumpState.filePath).pipe(
						Effect.tap(() =>
							Effect.sync(() => {
								dumpState.downloaded = true;
							}),
						),
					),
					dumpState,
				);

				if (Option.isSome(saveDump)) {
					yield* saveDumpToPath(dumpState.filePath, saveDump.value);
				}
			}

			yield* executeWithRetry(
				Effect.gen(function* () {
					const { shouldReset, schemaInfo } =
						yield* confirmDatabaseReset(targetUrl);
					if (shouldReset) {
						yield* truncateAllTables(targetUrl, schemaInfo);
					}

					yield* restoreFromFile(targetUrl, dumpState.filePath);
				}),
				dumpState,
			);

			if (!Option.isSome(fromDump)) {
				const shouldCleanup = yield* promptCleanupDump(dumpState.filePath);
				if (shouldCleanup) {
					const fs = yield* platform.FileSystem.FileSystem;
					yield* fs.remove(dumpState.filePath, { recursive: true });
					yield* Effect.log('Dump file cleaned up');
				} else {
					yield* Effect.log(`Dump file kept at: ${dumpState.filePath}`);
				}
			}

			yield* Effect.log('Database pull complete!');
		}).pipe(Effect.scoped),
);
