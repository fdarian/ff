import * as Ai from 'ai';
import { Data, Effect, FiberSet, type Scope } from 'effect';

export { describe, effectSchema } from './schema';

export class AiError extends Data.TaggedError('ff-effect/AiError')<{
	message: string;
	cause?: unknown;
}> {}

// biome-ignore lint/suspicious/noExplicitAny: internal bridging helper, type safety enforced at public API boundary
function wrapCallback(runPromise: any, callback: any) {
	if (callback == null) return undefined;
	// biome-ignore lint/suspicious/noExplicitAny: internal bridging helper
	return (...args: any[]) => runPromise(callback(...args));
}

// biome-ignore lint/suspicious/noExplicitAny: internal bridging helper, type safety enforced at public API boundary
function wrapCallbacks(runPromise: any, params: any, keys: readonly string[]) {
	const wrapped: Record<string, unknown> = {};
	for (const key of keys) {
		wrapped[key] = wrapCallback(runPromise, params[key]);
	}
	return wrapped;
}

/**
 * v7 renamed several callbacks (e.g. onStepFinish -> onStepEnd, onFinish ->
 * onEnd, experimental_onStart -> onStart) and added onLanguageModelCallStart /
 * onLanguageModelCallEnd. Both the old and new names are listed here so
 * EffectifyCallbacks rewrites whichever one a caller uses — the SDK resolves
 * old/new pairs internally with `newName ?? oldName`, and an explicit
 * `undefined` for an unused key doesn't disturb that resolution.
 */
const GENERATE_TEXT_CALLBACK_KEYS = [
	'onStepFinish',
	'onStepEnd',
	'onFinish',
	'onEnd',
	'onStart',
	'experimental_onStart',
	'onStepStart',
	'experimental_onStepStart',
	'onToolExecutionStart',
	'experimental_onToolCallStart',
	'onToolExecutionEnd',
	'experimental_onToolCallFinish',
	'onLanguageModelCallStart',
	'experimental_onLanguageModelCallStart',
	'onLanguageModelCallEnd',
	'experimental_onLanguageModelCallEnd',
] as const;
type GenerateTextCallbackKeys = (typeof GENERATE_TEXT_CALLBACK_KEYS)[number];

const STREAM_TEXT_CALLBACK_KEYS = [
	...GENERATE_TEXT_CALLBACK_KEYS,
	'onChunk',
	'onError',
	'onAbort',
] as const;
type StreamTextCallbackKeys = (typeof STREAM_TEXT_CALLBACK_KEYS)[number];

type EffectifyCallbacks<T, Keys extends string, R> = Omit<T, Keys & keyof T> & {
	[K in Keys & keyof T]?: NonNullable<T[K]> extends (
		...args: infer A
	) => unknown
		? (...args: A) => Effect.Effect<void, never, R>
		: T[K];
};

type OriginalGenerateTextDef<
	TOOLS extends Ai.ToolSet,
	RUNTIME_CONTEXT extends Record<string, unknown>,
	OUTPUT extends Ai.Output.Output,
> = Parameters<typeof Ai.generateText<TOOLS, RUNTIME_CONTEXT, OUTPUT>>[0];

type GenerateTextResult<
	TOOLS extends Ai.ToolSet,
	RUNTIME_CONTEXT extends Record<string, unknown>,
	OUTPUT extends Ai.Output.Output,
> = Awaited<ReturnType<typeof Ai.generateText<TOOLS, RUNTIME_CONTEXT, OUTPUT>>>;

/**
 * `OriginalGenerateTextDef` stays deferred while TOOLS/RUNTIME_CONTEXT/OUTPUT
 * are still being inferred, so TS never walks into `output?: OUTPUT` to infer
 * it — of `ai`'s OUTPUT positions, that's the one bare (non-NoInfer) site.
 * Omit those three inference sites off it and intersect a plain, non-deferred
 * object type carrying them: TS merges inference candidates across
 * intersection constituents independently, so the params type callers see
 * restores inference. `OriginalGenerateTextDef` itself is left untouched (and
 * used as-is for the internal cast back into `ai.generateText`) because
 * flattening it here would collapse its `prompt`/`messages` discriminated
 * union and break that call.
 */
type EffectGenerateTextDef<
	TOOLS extends Ai.ToolSet,
	RUNTIME_CONTEXT extends Record<string, unknown>,
	OUTPUT extends Ai.Output.Output,
	R,
> = EffectifyCallbacks<
	Omit<
		OriginalGenerateTextDef<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
		'tools' | 'runtimeContext' | 'output'
	>,
	GenerateTextCallbackKeys,
	R
> & {
	tools?: TOOLS;
	runtimeContext?: RUNTIME_CONTEXT;
	output?: OUTPUT;
};

export function generateText<
	TOOLS extends Ai.ToolSet = Ai.ToolSet,
	RUNTIME_CONTEXT extends Record<string, unknown> = Record<string, unknown>,
	OUTPUT extends Ai.Output.Output = Ai.Output.Output<string, string>,
	R = never,
>(
	params: EffectGenerateTextDef<TOOLS, RUNTIME_CONTEXT, OUTPUT, R>,
): Effect.Effect<
	GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
	AiError,
	R
> {
	return Effect.gen(function* () {
		const runPromise = yield* FiberSet.makeRuntimePromise<R>();

		const originalParams = {
			...params,
			...wrapCallbacks(runPromise, params, GENERATE_TEXT_CALLBACK_KEYS),
		} as OriginalGenerateTextDef<TOOLS, RUNTIME_CONTEXT, OUTPUT>;

		return yield* Effect.tryPromise({
			try: () => Ai.generateText(originalParams),
			catch: (cause) => new AiError({ message: 'generateText failed', cause }),
		});
	}).pipe(Effect.scoped);
}

type OriginalStreamTextDef<
	TOOLS extends Ai.ToolSet,
	RUNTIME_CONTEXT extends Record<string, unknown>,
	OUTPUT extends Ai.Output.Output,
> = Parameters<typeof Ai.streamText<TOOLS, RUNTIME_CONTEXT, OUTPUT>>[0];

type StreamTextResult<
	TOOLS extends Ai.ToolSet,
	RUNTIME_CONTEXT extends Record<string, unknown>,
	OUTPUT extends Ai.Output.Output,
> = ReturnType<typeof Ai.streamText<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;

/** Same deferred-`Parameters` inference problem as {@link EffectGenerateTextDef}. */
type EffectStreamTextDef<
	TOOLS extends Ai.ToolSet,
	RUNTIME_CONTEXT extends Record<string, unknown>,
	OUTPUT extends Ai.Output.Output,
	R,
> = EffectifyCallbacks<
	Omit<
		OriginalStreamTextDef<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
		'tools' | 'runtimeContext' | 'output'
	>,
	StreamTextCallbackKeys,
	R
> & {
	tools?: TOOLS;
	runtimeContext?: RUNTIME_CONTEXT;
	output?: OUTPUT;
};

export function streamText<
	TOOLS extends Ai.ToolSet = Ai.ToolSet,
	RUNTIME_CONTEXT extends Record<string, unknown> = Record<string, unknown>,
	OUTPUT extends Ai.Output.Output = Ai.Output.Output<string, string, never>,
	R = never,
>(
	params: EffectStreamTextDef<TOOLS, RUNTIME_CONTEXT, OUTPUT, R>,
): Effect.Effect<
	StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>,
	AiError,
	R | Scope.Scope
> {
	return Effect.gen(function* () {
		const runPromise = yield* FiberSet.makeRuntimePromise<R>();

		const originalParams = {
			...params,
			...wrapCallbacks(runPromise, params, STREAM_TEXT_CALLBACK_KEYS),
		} as OriginalStreamTextDef<TOOLS, RUNTIME_CONTEXT, OUTPUT>;

		try {
			return Ai.streamText(originalParams);
		} catch (cause) {
			return yield* Effect.fail(
				new AiError({ message: 'streamText failed', cause }),
			);
		}
	});
}

type OriginalToolDef<
	INPUT,
	OUTPUT,
	CONTEXT extends Record<string, unknown>,
> = Parameters<typeof Ai.tool<INPUT, OUTPUT, CONTEXT>>[0];

type ToolModelOutput = Awaited<
	ReturnType<NonNullable<Ai.Tool<unknown, unknown>['toModelOutput']>>
>;

type EffectToolDef<
	INPUT,
	OUTPUT,
	CONTEXT extends Record<string, unknown>,
	R,
> = Omit<
	OriginalToolDef<INPUT, OUTPUT, CONTEXT>,
	| 'execute'
	| 'onInputStart'
	| 'onInputDelta'
	| 'onInputAvailable'
	| 'toModelOutput'
> & {
	execute?: (
		input: INPUT,
		options: Ai.ToolExecutionOptions<CONTEXT>,
	) => Effect.Effect<OUTPUT, unknown, R>;
	onInputStart?: (
		options: Ai.ToolExecutionOptions<CONTEXT>,
	) => Effect.Effect<void, never, R>;
	onInputDelta?: (
		options: { inputTextDelta: string } & Ai.ToolExecutionOptions<CONTEXT>,
	) => Effect.Effect<void, never, R>;
	onInputAvailable?: (
		options: { input: INPUT } & Ai.ToolExecutionOptions<CONTEXT>,
	) => Effect.Effect<void, never, R>;
	toModelOutput?: (options: {
		toolCallId: string;
		input: INPUT;
		output: OUTPUT;
	}) => Effect.Effect<ToolModelOutput, never, R>;
};

export function tool<
	INPUT,
	OUTPUT,
	CONTEXT extends Record<string, unknown> = Record<string, unknown>,
	R = never,
>(
	params: EffectToolDef<INPUT, OUTPUT, CONTEXT, R>,
): Effect.Effect<Ai.Tool<INPUT, OUTPUT, CONTEXT>, never, R | Scope.Scope> {
	return Effect.gen(function* () {
		const runPromise = yield* FiberSet.makeRuntimePromise<R>();

		const originalParams = {
			...params,
			...(params.execute && {
				execute: (input: INPUT, options: Ai.ToolExecutionOptions<CONTEXT>) =>
					// biome-ignore lint/style/noNonNullAssertion: guarded by truthiness check
					runPromise(params.execute!(input, options)),
			}),
			onInputStart: wrapCallback(runPromise, params.onInputStart),
			onInputDelta: wrapCallback(runPromise, params.onInputDelta),
			onInputAvailable: wrapCallback(runPromise, params.onInputAvailable),
			...(params.toModelOutput && {
				toModelOutput: (options: {
					toolCallId: string;
					input: INPUT;
					output: OUTPUT;
				}) =>
					// biome-ignore lint/style/noNonNullAssertion: guarded by truthiness check
					runPromise(params.toModelOutput!(options)),
			}),
		} as OriginalToolDef<INPUT, OUTPUT, CONTEXT>;

		return Ai.tool(originalParams);
	});
}
