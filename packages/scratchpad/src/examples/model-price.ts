import { FetchHttpClient } from '@effect/platform';
import { Effect } from 'effect';
import { getModelUsageCost } from 'ff-ai';
import { runTester } from '../utils/run-tester';

runTester({
	dependencies: FetchHttpClient.layer,
	effect: Effect.gen(function* () {
		const result = yield* getModelUsageCost({
			model: 'alibaba/qwen3-coder-plus',
			usage: { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 },
		});
		console.log(result);
	}),
});
