import { Context, Data, Effect, FiberSet, Layer } from 'effect';

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

export function createDatabase<TClient extends AnyDrizzleClient, E, R>(
  tagId: string,
  createClient: Effect.Effect<TClient, E, R>,
) {
  type Client = TClient | TxClient<TClient>;
  type Tx = TxClient<TClient>;

  const Drizzle = Context.GenericTag<typeof tagId, Client>(tagId);
  const DrizzleTx = Context.GenericTag<`${typeof tagId}.tx`, Tx>(`${tagId}.tx`);

  const db = <T>(fn: (client: Client) => Promise<T>) =>
    Effect.gen(function* () {
      const client = yield* Drizzle;
      return yield* Effect.tryPromise({
        try: () => fn(client),
        catch: (cause) => new DrizzleError({ message: 'Database operation failed', cause }),
      });
    });

  /** Requires being inside withTransaction - enforces transaction at compile time */
  const tx = <T>(fn: (client: Tx) => Promise<T>) =>
    Effect.gen(function* () {
      const client = yield* DrizzleTx;
      return yield* Effect.tryPromise({
        try: () => fn(client),
        catch: (cause) => new DrizzleError({ message: 'Database operation failed', cause }),
      });
    });

  const withTransaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const client = yield* Drizzle;
      const runFork = yield* FiberSet.makeRuntimePromise<R>();

      return yield* Effect.tryPromise({
        try: () =>
          (client as TClient).transaction((txClient) =>
            runFork(
              effect.pipe(
                Effect.provideService(Drizzle, txClient as Client),
                Effect.provideService(DrizzleTx, txClient as Tx),
                Effect.mapError((e) => new WrappedTxError('', { cause: e })),
              ) as Effect.Effect<A, WrappedTxError, R>
            )
          ),
        catch: (error) => {
          if (error instanceof WrappedTxError) return error.cause as E;
          return new DrizzleError({ message: 'Transaction failed', cause: error });
        },
      });
    }).pipe(Effect.scoped);

  return {
    Drizzle,
    DrizzleTx,
    db,
    tx,
    withTransaction,
    layer: Layer.effect(Drizzle, createClient),
  };
}
