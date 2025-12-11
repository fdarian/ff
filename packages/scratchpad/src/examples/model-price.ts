import { xai } from '@ai-sdk/xai';
import { FetchHttpClient } from '@effect/platform';
import { Effect } from 'effect';
import { getModelUsageCost } from 'ff-ai';
import { runTester } from '../utils/run-tester';

runTester({
	dependencies: FetchHttpClient.layer,
	effect: Effect.gen(function* () {
		console.log(
			yield* getModelUsageCost({
				model: 'alibaba/qwen3-coder-plus',
				usage: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 },
			}),
		);

		console.log(
			yield* getModelUsageCost({
				model: xai('grok-4-latest'),
				usage: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 },
			}),
		);
	}),
});
