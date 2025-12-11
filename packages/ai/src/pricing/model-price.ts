import type * as AiProvider from '@ai-sdk/provider';
import type * as Ai from 'ai';
import { Effect } from 'effect';
import * as toml from 'smol-toml';

type ModelPrice = {
	input: number;
	output: number;
	cacheRead?: number;
	cacheWrite?: number;
};

export type UsageCost = {
	input: number;
	output: number;
	cacheRead?: number;
	cacheWrite?: number;
	total: number;
} | null;

const priceCache = new Map<string, ModelPrice>();

namespace ModelInput {
	export type Type = AiProvider.LanguageModelV2 | string;

	export function getProvider(model: Type): string {
		if (typeof model === 'string') return 'vercel';
		return model.provider;
	}

	export function getModelId(model: Type): string {
		if (typeof model === 'string') return model;
		return model.modelId;
	}
}
type ModelInput = ModelInput.Type;

export const getModelUsageCost = Effect.fn(function* (params: {
	model: ModelInput;
	usage: Ai.LanguageModelUsage;
}) {
	const cacheKey = `${ModelInput.getProvider(params.model)}/${ModelInput.getModelId(params.model)}`;

	let price = priceCache.get(cacheKey);
	if (!price) {
		const url = `https://raw.githubusercontent.com/sst/models.dev/refs/heads/dev/providers\
/${ModelInput.getProvider(params.model)}/\
models/${ModelInput.getModelId(params.model)}.toml`;

		const result = yield* Effect.tryPromise({
			try: async () => {
				const response = await fetch(url);
				if (!response.ok) return null;
				const text = await response.text();
				const data = toml.parse(text) as {
					cost: {
						input: number;
						output: number;
						cache_read?: number;
						cache_write?: number;
					};
				};
				return {
					input: data.cost.input,
					output: data.cost.output,
					cacheRead: data.cost.cache_read,
					cacheWrite: data.cost.cache_write,
				};
			},
			catch: () => null,
		});

		if (result == null) return null;
		price = result;
		priceCache.set(cacheKey, price);
	}

	const usage = params.usage;
	const inputTokens = usage.inputTokens ?? 0;
	const outputTokens = usage.outputTokens ?? 0;
	const inputCost = (inputTokens / 1_000_000) * price.input;
	const outputCost = (outputTokens / 1_000_000) * price.output;

	const cost: Exclude<UsageCost, null> = {
		input: inputCost,
		output: outputCost,
		total: inputCost + outputCost,
	};

	if (price.cacheRead != null) {
		const cacheReadTokens = (usage as any).cacheReadTokens;
		if (cacheReadTokens != null) {
			cost.cacheRead = (cacheReadTokens / 1_000_000) * price.cacheRead;
			cost.total += cost.cacheRead;
		}
	}

	if (price.cacheWrite != null) {
		const cacheWriteTokens = (usage as any).cacheCreationInputTokens;
		if (cacheWriteTokens != null) {
			cost.cacheWrite = (cacheWriteTokens / 1_000_000) * price.cacheWrite;
			cost.total += cost.cacheWrite;
		}
	}

	return cost;
});
