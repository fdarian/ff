import type * as Ai from 'ai';
import { Effect, Schema } from 'effect';
import { HttpClient } from 'effect/unstable/http';
import * as toml from 'smol-toml';

const PricePerMillion = Schema.Number.pipe(
	Schema.brand('ff-ai/PricePerMillion'),
);
export type PricePerMillion = typeof PricePerMillion.Type;

const Usd = Schema.Number.pipe(Schema.brand('ff-ai/Usd'));
export type Usd = typeof Usd.Type;

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
		error: Schema.Defect(),
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

const modelsDevUrl = (provider: string, modelId: string) =>
	`https://raw.githubusercontent.com/sst/models.dev/refs/heads/dev/providers/${provider}/models/${modelId}.toml`;

const fetchModelsDevByUrl = (url: string) =>
	Effect.gen(function* () {
		const response = yield* HttpClient.get(url);
		const text = yield* response.text;
		if (response.status === 404) {
			yield* Effect.logDebug(`${url} not found`);
			return null;
		}

		const parsed = yield* Effect.try({
			try: () => toml.parse(text),
			catch: (error) =>
				new TomlParseError({
					input: text,
					error: error,
				}),
		});
		return yield* Schema.decodeUnknownEffect(ModelsDevData)(parsed);
	});

/** models.dev treats reasoning as default (no suffix), so retry without it on 404 */
const fetchModelsDev = (model: ModelInput) =>
	Effect.gen(function* () {
		const provider = ModelInput.getProvider(model);
		const modelId = ModelInput.getModelId(model);
		const result = yield* fetchModelsDevByUrl(modelsDevUrl(provider, modelId));
		if (result != null) return result;

		if (modelId.endsWith('-reasoning')) {
			const stripped = modelId.replace(/-reasoning$/, '');
			return yield* fetchModelsDevByUrl(modelsDevUrl(provider, stripped));
		}
		return null;
	});

const calcCost = (token: number, pricePerMillion: PricePerMillion) =>
	Usd.make((token * pricePerMillion) / 1_000_000);

/**
 * Prices input tokens, degrading gracefully as the provider's usage detail
 * gets sparser: the SDK-supplied noCacheTokens split when present, a
 * cacheReadTokens/inputTokens derivation for providers that only report a
 * cached count and a total (the v6 usage shape), and a flat rate over the
 * full total when there is no cache detail at all.
 */
export function calcInputCost(
	usage: Ai.LanguageModelUsage,
	price: { input: PricePerMillion; cacheRead?: PricePerMillion },
): Usd {
	if (usage.inputTokens == null) return Usd.make(0);

	const noCacheTokens = usage.inputTokenDetails.noCacheTokens;
	const cacheReadTokens = usage.inputTokenDetails.cacheReadTokens;

	if (price.cacheRead != null && cacheReadTokens != null) {
		const freshInputTokens =
			noCacheTokens ?? usage.inputTokens - cacheReadTokens;
		return Usd.make(
			calcCost(cacheReadTokens, price.cacheRead) +
				calcCost(freshInputTokens, price.input),
		);
	}

	return calcCost(usage.inputTokens, price.input);
}

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

	const inputCost = calcInputCost(usage, {
		input: price.input,
		cacheRead: price.cacheRead,
	});

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
