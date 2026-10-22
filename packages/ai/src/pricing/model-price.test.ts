import { describe, expect, test } from 'bun:test';
import type * as Ai from 'ai';
import { Effect } from 'effect';
import * as toml from 'smol-toml';
import {
	calcInputCost,
	decodeModelsDevData,
	getModelProvider,
	type PricePerMillion,
} from './model-price.js';

function makeUsage(params: {
	inputTokens: number | undefined;
	noCacheTokens?: number;
	cacheReadTokens?: number;
}): Ai.LanguageModelUsage {
	return {
		inputTokens: params.inputTokens,
		inputTokenDetails: {
			noCacheTokens: params.noCacheTokens,
			cacheReadTokens: params.cacheReadTokens,
			cacheWriteTokens: undefined,
		},
		outputTokens: undefined,
		outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
		totalTokens: undefined,
	};
}

function makePrice(input: number, cacheRead?: number) {
	return {
		input: input as PricePerMillion,
		cacheRead: cacheRead == null ? undefined : (cacheRead as PricePerMillion),
	};
}

describe('calcInputCost', () => {
	test('v7 shape: uses the SDK-supplied noCacheTokens split directly', () => {
		const cost = calcInputCost(
			makeUsage({
				inputTokens: 1_000_000,
				noCacheTokens: 800_000,
				cacheReadTokens: 200_000,
			}),
			makePrice(10, 2),
		);

		// 200_000 cached @ $2/M + 800_000 fresh @ $10/M
		expect(cost).toBeCloseTo(0.4 + 8, 10);
	});

	test('v6 shape: derives fresh tokens from inputTokens - cacheReadTokens when noCacheTokens is absent', () => {
		const cost = calcInputCost(
			makeUsage({ inputTokens: 1_000_000, cacheReadTokens: 200_000 }),
			makePrice(10, 2),
		);

		// same totals as the v7 case above, so the price must match exactly
		expect(cost).toBeCloseTo(0.4 + 8, 10);
	});

	test('no cache detail at all: prices the full total at the flat rate', () => {
		const cost = calcInputCost(
			makeUsage({ inputTokens: 500_000 }),
			makePrice(10, 2),
		);

		expect(cost).toBeCloseTo(5, 10);
	});

	test('cacheReadTokens known but no cache rate: prices the full total at the flat rate', () => {
		const cost = calcInputCost(
			makeUsage({ inputTokens: 500_000, cacheReadTokens: 100_000 }),
			makePrice(10),
		);

		expect(cost).toBeCloseTo(5, 10);
	});

	test('missing inputTokens: costs nothing', () => {
		const cost = calcInputCost(
			makeUsage({ inputTokens: undefined }),
			makePrice(10, 2),
		);

		expect(cost).toBe(0);
	});
});

const decode = (source: string) =>
	Effect.runPromise(decodeModelsDevData(toml.parse(source)));

describe('decodeModelsDevData', () => {
	test('legacy flat cost', async () => {
		const data = await decode(`
[cost]
input = 3
output = 15
cache_read = 0.3
cache_write = 3.75
`);

		expect(data.input).toBe(3);
		expect(data.output).toBe(15);
		expect(data.cacheRead).toBe(0.3);
		expect(data.cacheWrite).toBe(3.75);
	});

	test('schema 2: reads text rates and numeric cache.write', async () => {
		const data = await decode(`
schema = 2

[cost.text.input]
price = 1.25

[cost.text.input.cache]
read = 0.125
write = 1.5

[cost.text.output]
price = 10
`);

		expect(data.input).toBe(1.25);
		expect(data.output).toBe(10);
		expect(data.cacheRead).toBe(0.125);
		expect(data.cacheWrite).toBe(1.5);
	});

	test('schema 2: cache.write duration map uses the "5m" entry', async () => {
		const data = await decode(`
schema = 2

[cost.text.input]
price = 2

[cost.text.input.cache]
read = 0.2

[cost.text.input.cache.write]
"5m" = 2.5
"1h" = 4

[cost.text.output]
price = 8
`);

		expect(data.cacheWrite).toBe(2.5);
	});

	test('schema 2: cache.write map without "5m" leaves cache write absent', async () => {
		const data = await decode(`
schema = 2

[cost.text.input]
price = 2

[cost.text.input.cache.write]
"1h" = 4

[cost.text.output]
price = 8
`);

		expect(data.cacheWrite).toBeUndefined();
	});

	test('schema 2: missing output rate fails instead of defaulting', async () => {
		await expect(
			decode(`
schema = 2

[cost.text.input]
price = 2
`),
		).rejects.toThrow();
	});
});

describe('getModelProvider', () => {
	test.each([
		['openai.responses', 'openai'],
		['xai.responses', 'xai'],
		['anthropic.messages', 'anthropic'],
		['google.generative-ai', 'google'],
		['groq.chat', 'groq'],
		['openai', 'openai'],
	])('%s -> %s', (provider, expected) => {
		expect(getModelProvider({ provider } as Ai.LanguageModel)).toBe(expected);
	});

	test('string model ids map to vercel', () => {
		expect(getModelProvider('openai/gpt-5')).toBe('vercel');
	});
});
