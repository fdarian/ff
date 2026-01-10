import { expect, it } from '@effect/vitest';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { os, type RouterClient } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { Effect } from 'effect';
import { UnknownException } from 'effect/Cause';
import { wrapClient } from 'ff-effect';
import { serverTester } from './__test__/utils.ts';
import { createFetchHandler } from './fetch-handler.ts';
import { oRPCHandler } from './orpc.ts';

it.effect('e2e', () =>
	serverTester({
		server: ({ port }) =>
			Effect.gen(function* () {
				const router = {
					health: os.handler(() => 'ok'),
				};
				const handler = new RPCHandler(router);

				return {
					router,
					server: Bun.serve({
						port: port,
						fetch: yield* createFetchHandler([oRPCHandler(handler)]),
					}),
				};
			}),
		test: ({ server, router }) =>
			Effect.gen(function* () {
				const orpcClient: RouterClient<typeof router> = createORPCClient(
					new RPCLink({ url: `http://localhost:${server.port}` }),
				);
				const call = wrapClient({
					client: orpcClient,
					error: ({ cause }) => new UnknownException(cause),
				});

				expect(yield* call((client) => client.health())).toEqual('ok');
			}),
	}),
);
