import * as Ai from 'ai';
import { Data, Effect, FiberSet, type Scope } from 'effect';

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

type GenerateTextCallbackKeys =
	| 'onStepFinish'
	| 'onFinish'
	| 'experimental_onStart'
	| 'experimental_onStepStart'
	| 'experimental_onToolCallStart'
	| 'experimental_onToolCallFinish';

type StreamTextCallbackKeys =
	| 'onChunk'
	| 'onError'
	| 'onFinish'
	| 'onAbort'
	| 'onStepFinish'
	| 'experimental_onStart'
	| 'experimental_onStepStart'
	| 'experimental_onToolCallStart'
	| 'experimental_onToolCallFinish';

type EffectifyCallbacks<T, Keys extends string, R> = Omit<T, Keys & keyof T> & {
	[K in Keys & keyof T]?: NonNullable<T[K]> extends (
		...args: infer A
	) => unknown
		? (...args: A) => Effect.Effect<void, never, R>
		: T[K];
};

type GenerateTextOriginalParams = Parameters<typeof Ai.generateText>[0];
type GenerateTextReturn = Awaited<ReturnType<typeof Ai.generateText>>;

export function generateText<R = never>(
	params: EffectifyCallbacks<
		GenerateTextOriginalParams,
		GenerateTextCallbackKeys,
		R
	>,
): Effect.Effect<GenerateTextReturn, AiError, R> {
	return Effect.gen(function* () {
		const runPromise = yield* FiberSet.makeRuntimePromise<R>();

		const originalParams = {
			...params,
			onStepFinish: wrapCallback(runPromise, params.onStepFinish),
			onFinish: wrapCallback(runPromise, params.onFinish),
			experimental_onStart: wrapCallback(
				runPromise,
				params.experimental_onStart,
			),
			experimental_onStepStart: wrapCallback(
				runPromise,
				params.experimental_onStepStart,
			),
			experimental_onToolCallStart: wrapCallback(
				runPromise,
				params.experimental_onToolCallStart,
			),
			experimental_onToolCallFinish: wrapCallback(
				runPromise,
				params.experimental_onToolCallFinish,
			),
		} as GenerateTextOriginalParams;

		return yield* Effect.tryPromise({
			try: () => Ai.generateText(originalParams),
			catch: (cause) => new AiError({ message: 'generateText failed', cause }),
		});
	}).pipe(Effect.scoped);
}

type StreamTextOriginalParams = Parameters<typeof Ai.streamText>[0];
type StreamTextReturn = ReturnType<typeof Ai.streamText>;

export function streamText<R = never>(
	params: EffectifyCallbacks<
		StreamTextOriginalParams,
		StreamTextCallbackKeys,
		R
	>,
): Effect.Effect<StreamTextReturn, AiError, R | Scope.Scope> {
	return Effect.gen(function* () {
		const runPromise = yield* FiberSet.makeRuntimePromise<R>();

		const originalParams = {
			...params,
			onChunk: wrapCallback(runPromise, params.onChunk),
			onError: wrapCallback(runPromise, params.onError),
			onFinish: wrapCallback(runPromise, params.onFinish),
			onAbort: wrapCallback(runPromise, params.onAbort),
			onStepFinish: wrapCallback(runPromise, params.onStepFinish),
			experimental_onStart: wrapCallback(
				runPromise,
				params.experimental_onStart,
			),
			experimental_onStepStart: wrapCallback(
				runPromise,
				params.experimental_onStepStart,
			),
			experimental_onToolCallStart: wrapCallback(
				runPromise,
				params.experimental_onToolCallStart,
			),
			experimental_onToolCallFinish: wrapCallback(
				runPromise,
				params.experimental_onToolCallFinish,
			),
		} as StreamTextOriginalParams;

		try {
			return Ai.streamText(originalParams);
		} catch (cause) {
			return yield* Effect.fail(
				new AiError({ message: 'streamText failed', cause }),
			);
		}
	});
}

type OriginalToolDef<INPUT, OUTPUT> = Parameters<
	typeof Ai.tool<INPUT, OUTPUT>
>[0];

type ToolModelOutput = Awaited<
	ReturnType<NonNullable<Ai.Tool<unknown, unknown>['toModelOutput']>>
>;

type EffectToolDef<INPUT, OUTPUT, R> = Omit<
	OriginalToolDef<INPUT, OUTPUT>,
	| 'execute'
	| 'onInputStart'
	| 'onInputDelta'
	| 'onInputAvailable'
	| 'toModelOutput'
> & {
	execute?: (
		input: INPUT,
		options: Ai.ToolExecutionOptions,
	) => Effect.Effect<OUTPUT, unknown, R>;
	onInputStart?: (
		options: Ai.ToolExecutionOptions,
	) => Effect.Effect<void, never, R>;
	onInputDelta?: (
		options: { inputTextDelta: string } & Ai.ToolExecutionOptions,
	) => Effect.Effect<void, never, R>;
	onInputAvailable?: (
		options: { input: INPUT } & Ai.ToolExecutionOptions,
	) => Effect.Effect<void, never, R>;
	toModelOutput?: (options: {
		toolCallId: string;
		input: INPUT;
		output: OUTPUT;
	}) => Effect.Effect<ToolModelOutput, never, R>;
};

export function tool<INPUT, OUTPUT, R = never>(
	params: EffectToolDef<INPUT, OUTPUT, R>,
): Effect.Effect<Ai.Tool<INPUT, OUTPUT>, never, R | Scope.Scope> {
	return Effect.gen(function* () {
		const runPromise = yield* FiberSet.makeRuntimePromise<R>();

		const originalParams = {
			...params,
			...(params.execute && {
				execute: (input: INPUT, options: Ai.ToolExecutionOptions) =>
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
		} as OriginalToolDef<INPUT, OUTPUT>;

		return Ai.tool(originalParams);
	});
}
