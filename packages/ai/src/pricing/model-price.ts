import type * as Ai from 'ai';
import { Effect, Schema } from 'effect';
import { HttpClient } from 'effect/http';
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

		// AI SDK ids are `<provider>[.<api>]` (xai.responses, anthropic.messages, google.generative-ai)
		const separator = model.provider.indexOf('.');
		return separator === -1
			? model.provider
			: model.provider.slice(0, separator);
	}

	export function getModelId(model: Type): string {
		if (typeof model === 'string') return model;
		return model.modelId;
	}
}
type ModelInput = ModelInput.Type;

export const getModelProvider = ModelInput.getProvider;

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
		context_over: Schema.optional(
			Schema.Array(
				Schema.Struct({
					gt: Schema.Number,
					input: Schema.optional(PricePerMillion),
					output: Schema.optional(PricePerMillion),
					cache_read: Schema.optional(PricePerMillion),
					cache_write: Schema.optional(PricePerMillion),
				}),
			),
		),
		service_tier_multipliers: Schema.optional(
			Schema.Record(Schema.String, Schema.Number),
		),
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

	get contextOver() {
		return this.cost.context_over;
	}

	get serviceTierMultipliers() {
		return this.cost.service_tier_multipliers;
	}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const definedEntries = (entries: Record<string, unknown>) =>
	Object.fromEntries(Object.entries(entries).filter((e) => e[1] !== undefined));

const hasOnlyKeys = (value: Record<string, unknown>, key: string) => {
	const keys = Object.keys(value);
	return keys.length === 1 && keys[0] === key;
};

/** The base rate is the "5m" entry when cache.write is a per-duration map */
const flattenCacheWrite = (write: unknown) =>
	isRecord(write) ? write['5m'] : write;

/**
 * Merges input and output overrides that share a `when.context.gt` threshold
 * into one entry. Overrides with any other condition are skipped, since
 * applying them unconditionally would misprice.
 */
const normalizeContextOverrides = (
	input: Record<string, unknown> | undefined,
	output: Record<string, unknown> | undefined,
) => {
	const byThreshold = new Map<number, Record<string, unknown>>();

	const collect = (
		side: Record<string, unknown> | undefined,
		toRates: (override: Record<string, unknown>) => Record<string, unknown>,
	) => {
		if (!Array.isArray(side?.overrides)) return;
		for (const override of side.overrides) {
			if (!isRecord(override) || !isRecord(override.when)) continue;
			if (!hasOnlyKeys(override.when, 'context')) continue;
			const context = override.when.context;
			if (!isRecord(context) || !hasOnlyKeys(context, 'gt')) continue;
			if (typeof context.gt !== 'number') continue;
			byThreshold.set(context.gt, {
				...byThreshold.get(context.gt),
				...definedEntries(toRates(override)),
			});
		}
	};

	collect(input, (override) => {
		const cache = isRecord(override.cache) ? override.cache : undefined;
		return {
			input: override.price,
			cache_read: cache?.read,
			cache_write: flattenCacheWrite(cache?.write),
		};
	});
	collect(output, (override) => ({ output: override.price }));

	return Array.from(byThreshold, (entry) => ({ gt: entry[0], ...entry[1] }));
};

/** Maps `service_tier` -> text factor, skipping entries that aren't a plain tier match */
const normalizeServiceTierMultipliers = (multipliers: unknown) => {
	if (!Array.isArray(multipliers)) return {};

	const byTier: Record<string, number> = {};
	for (const multiplier of multipliers) {
		if (!isRecord(multiplier) || !isRecord(multiplier.when)) continue;
		if (!hasOnlyKeys(multiplier.when, 'service_tier')) continue;
		const serviceTier = multiplier.when.service_tier;
		if (!isRecord(serviceTier) || typeof serviceTier.equals !== 'string') {
			continue;
		}
		const factor = isRecord(multiplier.factor)
			? multiplier.factor.text
			: multiplier.factor;
		if (typeof factor !== 'number') continue;
		byTier[serviceTier.equals] = factor;
	}
	return byTier;
};

/**
 * models.dev schema 2 nests base text rates under `cost.text`; flatten them to
 * the legacy `cost` shape. Long-context overrides (`when.context.gt`) become
 * `context_over` and `service_tier` multipliers become
 * `service_tier_multipliers`. Other modalities are ignored. Absent rates stay
 * absent so decoding still reports the missing key.
 */
const normalizeModelsDevCost = (
	parsed: Record<string, unknown>,
): Record<string, unknown> => {
	const cost = parsed.cost;
	if (!isRecord(cost) || !isRecord(cost.text)) return parsed;

	const input = isRecord(cost.text.input) ? cost.text.input : undefined;
	const output = isRecord(cost.text.output) ? cost.text.output : undefined;
	const cache = isRecord(input?.cache) ? input.cache : undefined;

	const contextOver = normalizeContextOverrides(input, output);
	const serviceTierMultipliers = normalizeServiceTierMultipliers(
		cost.multipliers,
	);

	return {
		...parsed,
		cost: definedEntries({
			input: input?.price,
			output: output?.price,
			cache_read: cache?.read,
			cache_write: flattenCacheWrite(cache?.write),
			context_over: contextOver.length > 0 ? contextOver : undefined,
			service_tier_multipliers:
				Object.keys(serviceTierMultipliers).length > 0
					? serviceTierMultipliers
					: undefined,
		}),
	};
};

export const decodeModelsDevData = (parsed: Record<string, unknown>) =>
	Schema.decodeUnknownEffect(ModelsDevData)(normalizeModelsDevCost(parsed));

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
		return yield* decodeModelsDevData(parsed);
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
 * Bills every input token exactly once: fresh tokens at the input rate, cache
 * reads at the cacheRead rate and cache writes at the cacheWrite rate. A cache
 * category with no rate falls back to the input rate rather than being
 * dropped. Fresh tokens are the SDK-supplied noCacheTokens when present,
 * otherwise inputTokens minus whichever cache counts the provider reported (so
 * with no cache detail at all the full total is billed at the input rate).
 */
export function calcInputCost(
	usage: Ai.LanguageModelUsage,
	price: {
		input: PricePerMillion;
		cacheRead?: PricePerMillion;
		cacheWrite?: PricePerMillion;
	},
): Usd {
	if (usage.inputTokens == null) return Usd.make(0);

	const cacheReadTokens = usage.inputTokenDetails.cacheReadTokens;
	const cacheWriteTokens = usage.inputTokenDetails.cacheWriteTokens;
	const freshInputTokens =
		usage.inputTokenDetails.noCacheTokens ??
		usage.inputTokens - (cacheReadTokens ?? 0) - (cacheWriteTokens ?? 0);

	const cacheReadCost =
		cacheReadTokens == null
			? 0
			: calcCost(cacheReadTokens, price.cacheRead ?? price.input);
	const cacheWriteCost =
		cacheWriteTokens == null
			? 0
			: calcCost(cacheWriteTokens, price.cacheWrite ?? price.input);

	return Usd.make(
		calcCost(freshInputTokens, price.input) + cacheReadCost + cacheWriteCost,
	);
}

const serviceTierFactor = (
	multipliers: Readonly<Record<string, number>> | undefined,
	serviceTier: string | undefined,
) => {
	if (
		serviceTier == null ||
		serviceTier === 'default' ||
		serviceTier === 'auto'
	) {
		return 1;
	}
	if (multipliers == null || !Object.hasOwn(multipliers, serviceTier)) return 1;
	return multipliers[serviceTier] ?? 1;
};

type ResolvedRates = {
	input: PricePerMillion;
	output: PricePerMillion;
	cacheRead?: PricePerMillion;
	cacheWrite?: PricePerMillion;
};

/**
 * Picks the rates for one request. The highest-threshold context override that
 * `inputTokens` exceeds replaces the base rates for the whole request (fields
 * it omits keep the base rate), then the service tier factor scales them all.
 */
export function resolveRates(
	price: ModelsDevData,
	params: { inputTokens: number | undefined; serviceTier?: string },
): ResolvedRates {
	const inputTokens = params.inputTokens;
	const override = (price.contextOver ?? [])
		.filter((candidate) => inputTokens != null && inputTokens > candidate.gt)
		.reduce<NonNullable<typeof price.contextOver>[number] | undefined>(
			(best, candidate) =>
				best == null || candidate.gt > best.gt ? candidate : best,
			undefined,
		);

	const factor = serviceTierFactor(
		price.serviceTierMultipliers,
		params.serviceTier,
	);
	const scale = (rate: PricePerMillion) => PricePerMillion.make(rate * factor);
	const scaleOptional = (rate: PricePerMillion | undefined) =>
		rate == null ? undefined : scale(rate);

	return {
		input: scale(override?.input ?? price.input),
		output: scale(override?.output ?? price.output),
		cacheRead: scaleOptional(override?.cache_read ?? price.cacheRead),
		cacheWrite: scaleOptional(override?.cache_write ?? price.cacheWrite),
	};
}

export const getModelUsageCost = Effect.fn(function* (params: {
	model: ModelInput;
	usage: Ai.LanguageModelUsage;
	serviceTier?: string;
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

	const rates = resolveRates(price, {
		inputTokens: usage.inputTokens,
		serviceTier: params.serviceTier,
	});

	const inputCost = calcInputCost(usage, rates);

	const outputCost = (() => {
		if (usage.outputTokens == null) return Usd.make(0);
		return calcCost(usage.outputTokens, rates.output);
	})();

	const cost: UsageCost = {
		input: inputCost,
		output: outputCost,
		total: Usd.make(inputCost + outputCost),
	};

	return cost;
});
