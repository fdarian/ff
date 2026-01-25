import { Data, Effect, FiberSet, Layer } from 'effect';
import * as Channel from 'effect/Channel';
import * as Context from 'effect/Context';
import * as Inspectable from 'effect/Inspectable';
import * as Sink from 'effect/Sink';
import * as STM from 'effect/STM';
import * as Stream from 'effect/Stream';
import * as EUnify from 'effect/Unify';

// TypeScript issue where the return type of createDatabase
// contains internal Effect types (TagTypeId) that aren't exported
// from this module,
// so TypeScript can't "name" them in the declaration file.
export const TagTypeId = Context.TagTypeId;
export const ChannelTypeId = Channel.ChannelTypeId;
export const EffectTypeId = Effect.EffectTypeId;
export const NodeInspectSymbol = Inspectable.NodeInspectSymbol;
export const STMTypeId = STM.STMTypeId;
export const SinkTypeId = Sink.SinkTypeId;
export const StreamTypeId = Stream.StreamTypeId;
export const Unify = EUnify;

export class DrizzleError extends Data.TaggedError('ff-effect/DrizzleError')<{
	message: string;
	cause?: unknown;
}> {}

type AnyDrizzleClient = {
	transaction: (fn: (tx: any) => Promise<any>) => Promise<any>;
};

type TxClient<TClient extends AnyDrizzleClient> = Parameters<
	Parameters<TClient['transaction']>[0]
>[0];

class WrappedTxError extends Error {}

const defaultPrefix = '@ff-effect/Drizzle' as const;

export function createDatabase<
	TClient extends AnyDrizzleClient,
	E,
	R,
	T extends string = typeof defaultPrefix,
>(createClient: Effect.Effect<TClient, E, R>, opts?: { tagId?: T }) {
	type Client = TClient | TxClient<TClient>;
	type Tx = TxClient<TClient>;

	const tagId = (opts?.tagId ?? defaultPrefix) as T;

	type Drizzle = typeof tagId;
	const Drizzle = Context.Tag(tagId)<Drizzle, Client>();

	const drizzleTxTagId = `${tagId}.tx` as const;
	type DrizzleTx = typeof drizzleTxTagId;
	const DrizzleTx = Context.Tag(drizzleTxTagId)<DrizzleTx, Tx>();

	const db = <T>(fn: (client: Client) => Promise<T>) =>
		Effect.gen(function* () {
			const client = yield* Drizzle;
			return yield* Effect.tryPromise({
				try: () => fn(client),
				catch: (cause) =>
					new DrizzleError({ message: 'Database operation failed', cause }),
			});
		});

	/** Requires being inside withTransaction - enforces transaction at compile time */
	const tx = <T>(fn: (client: Tx) => Promise<T>) =>
		Effect.gen(function* () {
			const client = yield* DrizzleTx;
			return yield* Effect.tryPromise({
				try: () => fn(client),
				catch: (cause) =>
					new DrizzleError({ message: 'Database operation failed', cause }),
			});
		});

	const withTransaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
		Effect.gen(function* () {
			const client = yield* Drizzle;
			const runFork =
				yield* FiberSet.makeRuntimePromise<Exclude<R, DrizzleTx>>();

			return yield* Effect.tryPromise<A, E | DrizzleError>({
				try: () =>
					(client as TClient).transaction((txClient) =>
						runFork(
							effect.pipe(
								Effect.provideService(Drizzle, txClient as Client),
								Effect.provideService(DrizzleTx, txClient as Tx),
								Effect.mapError((e) => new WrappedTxError('', { cause: e })),
							) as Effect.Effect<A, WrappedTxError, Exclude<R, DrizzleTx>>,
						),
					),
				catch: (error) => {
					if (error instanceof WrappedTxError) return error.cause as E;
					return new DrizzleError({
						message: 'Transaction failed',
						cause: error,
					});
				},
			});
		}).pipe(Effect.scoped);

	return {
		db,
		tx,
		Drizzle,
		DrizzleTx,
		withTransaction,
		layer: Layer.effect(Drizzle, createClient),
	};
}
