import { describe, expect, test } from 'bun:test';
import type * as Ai from 'ai';
import { calcInputCost, type PricePerMillion } from './model-price.js';

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
