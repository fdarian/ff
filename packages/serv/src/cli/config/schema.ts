import { Schema } from 'effect';

const RailwaySourceConfig = Schema.Struct({
	type: Schema.Literal('railway'),
	projectId: Schema.String,
	environmentId: Schema.String,
	serviceId: Schema.String,
});

const DirectSourceConfig = Schema.Struct({
	type: Schema.Literal('direct'),
	databaseUrl: Schema.String,
});

export const DatabaseSourceConfig = Schema.Union(
	RailwaySourceConfig,
	DirectSourceConfig,
);

export const PullDatabaseConfig = Schema.Struct({
	source: DatabaseSourceConfig,
	targetDatabaseUrl: Schema.optional(Schema.String),
	defaultDumpPath: Schema.optional(Schema.String),
});

export const FfServConfig = Schema.Struct({
	pullDatabase: Schema.optional(PullDatabaseConfig),
});

export type FfServConfig = Schema.Schema.Type<typeof FfServConfig>;
export type PullDatabaseConfig = Schema.Schema.Type<typeof PullDatabaseConfig>;
export type DatabaseSourceConfig = Schema.Schema.Type<
	typeof DatabaseSourceConfig
>;
