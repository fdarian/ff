import { describe, expect, test } from 'bun:test';
import type * as Ai from 'ai';
import { Effect } from 'effect';
import * as toml from 'smol-toml';
import {
	calcInputCost,
	decodeModelsDevData,
	getModelProvider,
	type PricePerMillion,
	resolveRates,
} from './model-price.js';

function makeUsage(params: {
	inputTokens: number | undefined;
	noCacheTokens?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	outputTokens?: number;
}): Ai.LanguageModelUsage {
	return {
		inputTokens: params.inputTokens,
		inputTokenDetails: {
			noCacheTokens: params.noCacheTokens,
			cacheReadTokens: params.cacheReadTokens,
			cacheWriteTokens: params.cacheWriteTokens,
		},
		outputTokens: params.outputTokens,
		outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
		totalTokens: undefined,
	};
}

function makePrice(input: number, cacheRead?: number, cacheWrite?: number) {
	return {
		input: input as PricePerMillion,
		cacheRead: cacheRead == null ? undefined : (cacheRead as PricePerMillion),
		cacheWrite:
			cacheWrite == null ? undefined : (cacheWrite as PricePerMillion),
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

	describe('GPT-6.1 terra rates (input 1, cache_read 0.05, cache_write 1.25)', () => {
		const terra = makePrice(1, 0.05, 1.25);

		test('full split with noCacheTokens: prices fresh, reads and writes separately', () => {
			const cost = calcInputCost(
				makeUsage({
					inputTokens: 1_000_000,
					noCacheTokens: 500_000,
					cacheReadTokens: 300_000,
					cacheWriteTokens: 200_000,
				}),
				terra,
			);

			// 500_000 fresh @ $1/M + 300_000 read @ $0.05/M + 200_000 written @ $1.25/M
			expect(cost).toBeCloseTo(0.5 + 0.015 + 0.25, 10);
		});

		test('without noCacheTokens: fresh tokens subtract both cache counts', () => {
			const cost = calcInputCost(
				makeUsage({
					inputTokens: 1_000_000,
					cacheReadTokens: 300_000,
					cacheWriteTokens: 200_000,
				}),
				terra,
			);

			expect(cost).toBeCloseTo(0.5 + 0.015 + 0.25, 10);
		});

		test('cache writes with no cacheWrite price are charged at the input rate', () => {
			const cost = calcInputCost(
				makeUsage({
					inputTokens: 1_000_000,
					noCacheTokens: 500_000,
					cacheReadTokens: 300_000,
					cacheWriteTokens: 200_000,
				}),
				makePrice(1, 0.05),
			);

			// 200_000 written @ $1/M instead of $1.25/M
			expect(cost).toBeCloseTo(0.5 + 0.015 + 0.2, 10);
		});
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

const terraToml = `
schema = 2

[cost.text.input]
price = 1
cache = { read = 0.05, write = 1.25 }

[[cost.text.input.overrides]]
when = { context = { gt = 272_000 } }
price = 2
cache = { read = 0.1, write = 2.5 }

[cost.text.output]
price = 5

[[cost.text.output.overrides]]
when = { context = { gt = 272_000 } }
price = 7.5

[[cost.multipliers]]
when = { service_tier = { equals = "priority" } }
factor = { text = 2 }

[[cost.multipliers]]
when = { service_tier = { equals = "flex" } }
factor = { text = 0.5 }
`;

const solToml = `
schema = 2

[cost.text.input]
price = 2
cache = { read = 0.1, write = 2.5 }

[[cost.text.input.overrides]]
when = { context = { gt = 272_000 } }
price = 4
cache = { read = 0.2, write = 5 }

[cost.text.output]
price = 10

[[cost.text.output.overrides]]
when = { context = { gt = 272_000 } }
price = 15

[cost.web_search]
price = 10

[[cost.multipliers]]
when = { service_tier = { equals = "priority" } }
factor = { text = 2 }

[[cost.multipliers]]
when = { service_tier = { equals = "ultrafast" } }
factor = { text = 6 }

[[cost.multipliers]]
when = { service_tier = { equals = "flex" } }
factor = { text = 0.5 }
`;

async function costFor(
	source: string,
	usage: Ai.LanguageModelUsage,
	serviceTier?: string,
) {
	const data = await decode(source);
	const rates = resolveRates(data, {
		inputTokens: usage.inputTokens,
		serviceTier,
	});
	const output = ((usage.outputTokens ?? 0) * rates.output) / 1_000_000;
	return { input: calcInputCost(usage, rates), output };
}

// 100K input is under the 272K threshold, 300K is over it
const shortUsage = makeUsage({
	inputTokens: 100_000,
	noCacheTokens: 50_000,
	cacheReadTokens: 30_000,
	cacheWriteTokens: 20_000,
	outputTokens: 10_000,
});
const longUsage = makeUsage({
	inputTokens: 300_000,
	noCacheTokens: 150_000,
	cacheReadTokens: 100_000,
	cacheWriteTokens: 50_000,
	outputTokens: 20_000,
});

describe('decodeModelsDevData: overrides and multipliers', () => {
	test('merges input and output overrides sharing a threshold', async () => {
		const data = await decode(terraToml);

		expect(data.contextOver).toEqual([
			{ gt: 272_000, input: 2, cache_read: 0.1, cache_write: 2.5, output: 7.5 },
		]);
		expect(data.serviceTierMultipliers).toEqual({ priority: 2, flex: 0.5 });
	});

	test('keeps base rates and no extras for schemas without overrides', async () => {
		const data = await decode(`
[cost]
input = 3
output = 15
`);

		expect(data.contextOver).toBeUndefined();
		expect(data.serviceTierMultipliers).toBeUndefined();
	});

	test('output-only override leaves input fields absent', async () => {
		const data = await decode(`
schema = 2

[cost.text.input]
price = 2

[cost.text.output]
price = 10

[[cost.text.output.overrides]]
when = { context = { gt = 200_000 } }
price = 15
`);

		expect(data.contextOver).toEqual([{ gt: 200_000, output: 15 }]);
	});

	test('overrides with an unrecognised condition are skipped', async () => {
		const data = await decode(`
schema = 2

[cost.text.input]
price = 2

[[cost.text.input.overrides]]
when = { region = { equals = "eu" } }
price = 3

[[cost.text.input.overrides]]
when = { context = { gt = 100_000 }, region = { equals = "eu" } }
price = 3

[cost.text.output]
price = 10
`);

		expect(data.contextOver).toBeUndefined();
	});

	test('cache.write duration map in an override uses the "5m" entry', async () => {
		const data = await decode(`
schema = 2

[cost.text.input]
price = 2

[[cost.text.input.overrides]]
when = { context = { gt = 100_000 } }
price = 4
cache = { write = { "5m" = 5, "1h" = 8 } }

[cost.text.output]
price = 10
`);

		expect(data.contextOver).toEqual([
			{ gt: 100_000, input: 4, cache_write: 5 },
		]);
	});

	test('multipliers accept a plain number factor and skip entries without service_tier.equals', async () => {
		const data = await decode(`
schema = 2

[cost.text.input]
price = 2

[cost.text.output]
price = 10

[[cost.multipliers]]
when = { service_tier = { equals = "priority" } }
factor = 1.5

[[cost.multipliers]]
when = { region = { equals = "eu" } }
factor = { text = 3 }

[[cost.multipliers]]
when = { service_tier = { equals = "flex" } }
factor = { image = 3 }
`);

		expect(data.serviceTierMultipliers).toEqual({ priority: 1.5 });
	});
});

describe('resolveRates', () => {
	describe('GPT-6.1 terra', () => {
		test('at or below the threshold uses base rates', async () => {
			const cost = await costFor(terraToml, shortUsage);

			// 50K @ 1 + 30K @ 0.05 + 20K @ 1.25; 10K out @ 5
			expect(cost.input).toBeCloseTo(0.05 + 0.0015 + 0.025, 10);
			expect(cost.output).toBeCloseTo(0.05, 10);
		});

		test('exactly at the threshold is not over it', async () => {
			const data = await decode(terraToml);

			expect(resolveRates(data, { inputTokens: 272_000 }).input).toBe(1);
			expect(resolveRates(data, { inputTokens: 272_001 }).input).toBe(2);
		});

		test('above the threshold uses override rates for the whole request', async () => {
			const cost = await costFor(terraToml, longUsage);

			// 150K @ 2 + 100K @ 0.1 + 50K @ 2.5; 20K out @ 7.5
			expect(cost.input).toBeCloseTo(0.3 + 0.01 + 0.125, 10);
			expect(cost.output).toBeCloseTo(0.15, 10);
		});

		test('priority doubles input and output, flex halves them', async () => {
			const priority = await costFor(terraToml, shortUsage, 'priority');
			const flex = await costFor(terraToml, shortUsage, 'flex');

			expect(priority.input).toBeCloseTo(2 * 0.0765, 10);
			expect(priority.output).toBeCloseTo(2 * 0.05, 10);
			expect(flex.input).toBeCloseTo(0.5 * 0.0765, 10);
			expect(flex.output).toBeCloseTo(0.5 * 0.05, 10);
		});

		test('tier multiplier stacks with the long-context override', async () => {
			const cost = await costFor(terraToml, longUsage, 'priority');

			expect(cost.input).toBeCloseTo(2 * 0.435, 10);
			expect(cost.output).toBeCloseTo(2 * 0.15, 10);
		});

		test('tier without a multiplier entry costs the base rate', async () => {
			const cost = await costFor(terraToml, shortUsage, 'ultrafast');

			expect(cost.input).toBeCloseTo(0.0765, 10);
			expect(cost.output).toBeCloseTo(0.05, 10);
		});
	});

	describe('GPT-6.1 sol', () => {
		test.each([
			[undefined, 1],
			['default', 1],
			['auto', 1],
			['unknown-tier', 1],
			['priority', 2],
			['ultrafast', 6],
			['flex', 0.5],
		])('short context, tier %s -> x%d', async (tier, factor) => {
			const cost = await costFor(solToml, shortUsage, tier);

			// 50K @ 2 + 30K @ 0.1 + 20K @ 2.5; 10K out @ 10
			expect(cost.input).toBeCloseTo(factor * 0.153, 10);
			expect(cost.output).toBeCloseTo(factor * 0.1, 10);
		});

		test.each([
			[undefined, 1],
			['priority', 2],
			['ultrafast', 6],
			['flex', 0.5],
		])('long context, tier %s -> x%d', async (tier, factor) => {
			const cost = await costFor(solToml, longUsage, tier);

			// 150K @ 4 + 100K @ 0.2 + 50K @ 5; 20K out @ 15
			expect(cost.input).toBeCloseTo(factor * (0.6 + 0.02 + 0.25), 10);
			expect(cost.output).toBeCloseTo(factor * 0.3, 10);
		});
	});

	test('override that omits a field falls back to the base rate for it', async () => {
		const data = await decode(`
schema = 2

[cost.text.input]
price = 2
cache = { read = 0.1, write = 2.5 }

[[cost.text.input.overrides]]
when = { context = { gt = 100_000 } }
price = 4

[cost.text.output]
price = 10
`);

		const rates = resolveRates(data, { inputTokens: 150_000 });

		expect(rates).toEqual({
			input: 4,
			output: 10,
			cacheRead: 0.1,
			cacheWrite: 2.5,
		});
	});

	test('highest matching threshold wins', async () => {
		const data = await decode(`
schema = 2

[cost.text.input]
price = 1

[[cost.text.input.overrides]]
when = { context = { gt = 200_000 } }
price = 2

[[cost.text.input.overrides]]
when = { context = { gt = 500_000 } }
price = 3

[cost.text.output]
price = 5
`);

		expect(resolveRates(data, { inputTokens: 100_000 }).input).toBe(1);
		expect(resolveRates(data, { inputTokens: 300_000 }).input).toBe(2);
		expect(resolveRates(data, { inputTokens: 600_000 }).input).toBe(3);
	});

	test('missing inputTokens never matches an override', async () => {
		const data = await decode(terraToml);

		expect(resolveRates(data, { inputTokens: undefined }).input).toBe(1);
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
