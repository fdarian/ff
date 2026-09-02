import { xai } from '@ai-sdk/xai';
import { Effect, References } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { getModelUsageCost } from 'ff-ai';
import { runTester } from '../utils/run-tester';

runTester({
	dependencies: FetchHttpClient.layer,
	effect: Effect.gen(function* () {
		console.log(
			yield* getModelUsageCost({
				model: 'alibaba/qwen3-coder-plus',
				usage: {
					inputTokens: 1000,
					outputTokens: 100,
					totalTokens: 1100,
					inputTokenDetails: {
						noCacheTokens: undefined,
						cacheReadTokens: undefined,
						cacheWriteTokens: undefined,
					},
					outputTokenDetails: {
						textTokens: undefined,
						reasoningTokens: undefined,
					},
				},
			}),
		);

		console.log(
			yield* getModelUsageCost({
				model: xai('grok-4-latest'),
				usage: {
					inputTokens: 1000,
					outputTokens: 100,
					totalTokens: 1100,
					inputTokenDetails: {
						noCacheTokens: undefined,
						cacheReadTokens: undefined,
						cacheWriteTokens: undefined,
					},
					outputTokenDetails: {
						textTokens: undefined,
						reasoningTokens: undefined,
					},
				},
			}),
		);
	}).pipe(Effect.provideService(References.MinimumLogLevel, 'Debug')),
});
