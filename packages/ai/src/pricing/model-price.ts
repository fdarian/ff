import { HttpClient } from '@effect/platform';
import type * as Ai from 'ai';
import { Effect, Schema } from 'effect';
import * as toml from 'smol-toml';

const PricePerMillion = Schema.Number.pipe(
	Schema.brand('ff-ai/PricePerMillion'),
);
type PricePerMillion = typeof PricePerMillion.Type;

const Usd = Schema.Number.pipe(Schema.brand('ff-ai/Usd'));
type Usd = typeof Usd.Type;

export type UsageCost = {
	input: Usd;
	output: Usd;
	total: Usd;
};

const priceCache = new Map<string, ModelsDevData>();

namespace ModelInput {
	export type Type = Ai.LanguageModel | string;

	export function getProvider(model: Type): string {
		if (typeof model === 'string') return 'vercel';

		if (model.provider === 'google.generative-ai') {
			return 'google';
		}
		return model.provider.replaceAll('.chat', '');
	}

	export function getModelId(model: Type): string {
		if (typeof model === 'string') return model;
		return model.modelId;
	}
}
type ModelInput = ModelInput.Type;

class TomlParseError extends Schema.TaggedError<TomlParseError>()(
	'ff-ai/TomlParseError',
	{
		input: Schema.String,
		error: Schema.Defect,
	},
) {}

class ModelsDevData extends Schema.Class<ModelsDevData>('ff-ai/ModelsDevData')({
	cost: Schema.Struct({
		input: PricePerMillion,
		output: PricePerMillion,
		cache_read: Schema.optional(PricePerMillion),
		cache_write: Schema.optional(PricePerMillion),
	}),
}) {
	get input() {
		return this.cost.input;
	}

	get output() {
		return this.cost.output;
	}

	get cacheRead() {
		return this.cost.cache_read;
	}

	get cacheWrite() {
		return this.cost.cache_write;
	}
}

const fetchModelsDev = (model: ModelInput) =>
	Effect.gen(function* () {
		const url = `https://raw.githubusercontent.com/sst/models.dev/refs/heads/dev/providers\
/${ModelInput.getProvider(model)}/\
models/${ModelInput.getModelId(model)}.toml`;
		const response = yield* HttpClient.get(url);
		const text = yield* response.text;
		if (response.status === 404) {
			yield* Effect.logDebug(`${url} not found`);
			return null;
		}

		const parsed = yield* Effect.try({
			try: () => toml.parse(text),
			catch: (error) =>
				TomlParseError.make({
					input: text,
					error: error,
				}),
		});
		return yield* Schema.decodeUnknown(ModelsDevData)(parsed);
	});

const calcCost = (token: number, pricePerMillion: PricePerMillion) =>
	Usd.make((token * pricePerMillion) / 1_000_000);

export const getModelUsageCost = Effect.fn(function* (params: {
	model: ModelInput;
	usage: Ai.LanguageModelUsage;
}) {
	const cacheKey = `${ModelInput.getProvider(params.model)}/${ModelInput.getModelId(params.model)}`;

	const price =
		priceCache.get(cacheKey) ??
		(yield* Effect.gen(function* () {
			const result = yield* fetchModelsDev(params.model);

			if (result == null) return null;
			priceCache.set(cacheKey, result);
			return result;
		}));
	if (price == null) return null;

	const usage = params.usage;

	const inputCost = (() => {
		if (usage.inputTokens == null) return Usd.make(0);
		if (price.cacheRead != null && usage.cachedInputTokens != null) {
			const freshInputTokens = usage.inputTokens - usage.cachedInputTokens;
			return Usd.make(
				calcCost(usage.cachedInputTokens, price.cacheRead) +
					calcCost(freshInputTokens, price.input),
			);
		}
		return calcCost(usage.inputTokens, price.input);
	})();

	const outputCost = (() => {
		if (usage.outputTokens == null) return Usd.make(0);
		return calcCost(usage.outputTokens, price.output);
	})();

	const cost: UsageCost = {
		input: inputCost,
		output: outputCost,
		total: Usd.make(inputCost + outputCost),
	};

	return cost;
});
