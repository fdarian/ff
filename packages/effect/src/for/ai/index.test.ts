import * as Ai from 'ai';
import { Effect, Schema, type Scope } from 'effect';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { AiError, generateText, streamText, tool } from './index.js';
import { effectSchema } from './schema.js';

vi.mock('ai', async (importOriginal) => {
	const actual = await importOriginal<typeof Ai>();
	return {
		...actual,
		generateText: vi.fn(),
		streamText: vi.fn(),
	};
});

describe('generateText', () => {
	test('wraps promise and returns result', () => {
		const mockResult = { text: 'hello', finishReason: 'stop' };
		vi.mocked(Ai.generateText).mockResolvedValue(mockResult as never);

		return Effect.gen(function* () {
			const result = yield* generateText({
				model: {} as Ai.LanguageModel,
				prompt: 'test',
			});

			expect(result).toBe(mockResult);
			expect(Ai.generateText).toHaveBeenCalledWith(
				expect.objectContaining({ prompt: 'test' }),
			);
		}).pipe(Effect.runPromise);
	});

	test('surfaces errors as AiError', () =>
		Effect.gen(function* () {
			vi.mocked(Ai.generateText).mockRejectedValue(new Error('API error'));

			const result = yield* generateText({
				model: {} as Ai.LanguageModel,
				prompt: 'test',
			}).pipe(Effect.flip);

			expect(result).toBeInstanceOf(AiError);
			expect(result.message).toBe('generateText failed');
			expect(result.cause).toBeInstanceOf(Error);
			expect((result.cause as Error).message).toBe('API error');
		}).pipe(Effect.runPromise));

	test('wraps onStepFinish callback', () => {
		const stepResult = { text: 'step1' };
		vi.mocked(Ai.generateText).mockImplementation(
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			(async (params: any) => {
				if (params.onStepFinish) await params.onStepFinish(stepResult);
				return { text: 'done' };
			}) as never,
		);

		const onStepFinishSpy = vi.fn(() => Effect.void);

		return Effect.gen(function* () {
			yield* generateText({
				model: {} as Ai.LanguageModel,
				prompt: 'test',
				onStepFinish: onStepFinishSpy,
			});

			expect(onStepFinishSpy).toHaveBeenCalledWith(stepResult);
		}).pipe(Effect.runPromise);
	});

	test('wraps onFinish callback', () => {
		const finishEvent = { text: 'done', steps: [], totalUsage: {} };
		vi.mocked(Ai.generateText).mockImplementation(
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			(async (params: any) => {
				if (params.onFinish) await params.onFinish(finishEvent);
				return { text: 'done' };
			}) as never,
		);

		const onFinishSpy = vi.fn(() => Effect.void);

		return Effect.gen(function* () {
			yield* generateText({
				model: {} as Ai.LanguageModel,
				prompt: 'test',
				onFinish: onFinishSpy,
			});

			expect(onFinishSpy).toHaveBeenCalledWith(finishEvent);
		}).pipe(Effect.runPromise);
	});

	// v7 renamed onFinish -> onEnd and onStepFinish -> onStepEnd; both names
	// must be wrapped so callers on either name get Effect ergonomics.
	test('wraps onEnd callback (v7 rename of onFinish)', () => {
		const endEvent = { text: 'done', steps: [], totalUsage: {} };
		vi.mocked(Ai.generateText).mockImplementation(
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			(async (params: any) => {
				if (params.onEnd) await params.onEnd(endEvent);
				return { text: 'done' };
			}) as never,
		);

		const onEndSpy = vi.fn(() => Effect.void);

		return Effect.gen(function* () {
			yield* generateText({
				model: {} as Ai.LanguageModel,
				prompt: 'test',
				onEnd: onEndSpy,
			});

			expect(onEndSpy).toHaveBeenCalledWith(endEvent);
		}).pipe(Effect.runPromise);
	});

	test('wraps onStepEnd callback (v7 rename of onStepFinish)', () => {
		const stepResult = { text: 'step1' };
		vi.mocked(Ai.generateText).mockImplementation(
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			(async (params: any) => {
				if (params.onStepEnd) await params.onStepEnd(stepResult);
				return { text: 'done' };
			}) as never,
		);

		const onStepEndSpy = vi.fn(() => Effect.void);

		return Effect.gen(function* () {
			yield* generateText({
				model: {} as Ai.LanguageModel,
				prompt: 'test',
				onStepEnd: onStepEndSpy,
			});

			expect(onStepEndSpy).toHaveBeenCalledWith(stepResult);
		}).pipe(Effect.runPromise);
	});
});

describe('streamText', () => {
	test('wraps synchronous return', () => {
		const mockResult = { textStream: 'mock-stream' };
		vi.mocked(Ai.streamText).mockReturnValue(mockResult as never);

		return Effect.gen(function* () {
			const result = yield* streamText({
				model: {} as Ai.LanguageModel,
				prompt: 'test',
			});

			expect(result).toBe(mockResult);
			expect(Ai.streamText).toHaveBeenCalledWith(
				expect.objectContaining({ prompt: 'test' }),
			);
		}).pipe(Effect.scoped, Effect.runPromise);
	});

	test('surfaces thrown errors as AiError', () => {
		vi.mocked(Ai.streamText).mockImplementation(() => {
			throw new Error('stream error');
		});

		return Effect.gen(function* () {
			const result = yield* streamText({
				model: {} as Ai.LanguageModel,
				prompt: 'test',
			}).pipe(Effect.flip);

			expect(result).toBeInstanceOf(AiError);
			expect(result.message).toBe('streamText failed');
			expect(result.cause).toBeInstanceOf(Error);
			expect((result.cause as Error).message).toBe('stream error');
		}).pipe(Effect.scoped, Effect.runPromise);
	});

	test('wraps onFinish callback', () => {
		const finishEvent = { text: 'done', steps: [], totalUsage: {} };
		vi.mocked(Ai.streamText).mockImplementation(
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			((params: any) => {
				if (params.onFinish) params.onFinish(finishEvent);
				return { textStream: 'mock' };
			}) as never,
		);

		const onFinishSpy = vi.fn(() => Effect.void);

		return Effect.gen(function* () {
			yield* streamText({
				model: {} as Ai.LanguageModel,
				prompt: 'test',
				onFinish: onFinishSpy,
			});

			expect(onFinishSpy).toHaveBeenCalledWith(finishEvent);
		}).pipe(Effect.scoped, Effect.runPromise);
	});

	// v7 renamed onFinish -> onEnd; both names must be wrapped so callers on
	// either name get Effect ergonomics (same event, one calling convention).
	test('wraps onEnd callback (v7 rename of onFinish)', () => {
		const endEvent = { text: 'done', steps: [], totalUsage: {} };
		vi.mocked(Ai.streamText).mockImplementation(
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			((params: any) => {
				if (params.onEnd) params.onEnd(endEvent);
				return { textStream: 'mock' };
			}) as never,
		);

		const onEndSpy = vi.fn(() => Effect.void);

		return Effect.gen(function* () {
			yield* streamText({
				model: {} as Ai.LanguageModel,
				prompt: 'test',
				onEnd: onEndSpy,
			});

			expect(onEndSpy).toHaveBeenCalledWith(endEvent);
		}).pipe(Effect.scoped, Effect.runPromise);
	});
});

describe('tool', () => {
	test('wraps execute with Effect -> Promise bridging', () =>
		Effect.gen(function* () {
			const myTool = yield* tool({
				description: 'test tool',
				inputSchema: { type: 'object' } as unknown as Ai.FlexibleSchema<{
					city: string;
				}>,
				execute: (input) => Effect.succeed(`Weather in ${input.city}: sunny`),
			});

			expect(myTool.description).toBe('test tool');
			expect(myTool.execute).toBeDefined();

			// biome-ignore lint/style/noNonNullAssertion: asserted above
			const execute = myTool.execute!;
			const result = yield* Effect.promise(() =>
				Promise.resolve(
					execute(
						{ city: 'London' },
						{
							toolCallId: 'test-id',
							messages: [],
							context: {},
						},
					),
				),
			);
			expect(result).toBe('Weather in London: sunny');
		}).pipe(Effect.scoped, Effect.runPromise));

	test('passes through non-callback properties', () =>
		Effect.gen(function* () {
			const myTool = yield* tool({
				description: 'my tool',
				title: 'My Tool',
				inputSchema: { type: 'object' } as unknown as Ai.FlexibleSchema<{
					x: number;
				}>,
				strict: true,
			});

			expect(myTool.description).toBe('my tool');
			expect(myTool.title).toBe('My Tool');
			expect(myTool.strict).toBe(true);
		}).pipe(Effect.scoped, Effect.runPromise));

	test('execute handler can access Effect services', () => {
		class WeatherService extends Effect.Service<WeatherService>()(
			'WeatherService',
			{
				succeed: {
					getWeather: (city: string) => `${city}: rainy`,
				},
			},
		) {}

		return Effect.gen(function* () {
			const myTool = yield* tool({
				description: 'weather',
				inputSchema: { type: 'object' } as unknown as Ai.FlexibleSchema<{
					city: string;
				}>,
				execute: (input) =>
					Effect.gen(function* () {
						const weather = yield* WeatherService;
						return weather.getWeather(input.city);
					}),
			});

			// biome-ignore lint/style/noNonNullAssertion: test assertion
			const execute = myTool.execute!;
			const result = yield* Effect.promise(() =>
				Promise.resolve(
					execute(
						{ city: 'Paris' },
						{
							toolCallId: 'test-id',
							messages: [],
							context: {},
						},
					),
				),
			);
			expect(result).toBe('Paris: rainy');
		}).pipe(
			Effect.scoped,
			Effect.provide(WeatherService.Default),
			Effect.runPromise,
		);
	});
});

// These are compile-time-only checks: a tsc-only regression (like OUTPUT
// silently falling back to its default, or a swapped generic position) never
// throws at runtime, so it can't be caught by `expect()` assertions above —
// `check:tsc` is what would fail if any of these mismatched.
describe('type-level regressions', () => {
	const TestSchema = Schema.Struct({ foo: Schema.String });

	test('generateText infers OUTPUT from the `output` param instead of defaulting', () => {
		const program = generateText({
			model: {} as Ai.LanguageModel,
			prompt: 'hi',
			output: Ai.Output.object({ schema: effectSchema(TestSchema) }),
		});
		type Output = Effect.Effect.Success<typeof program>['output'];
		expectTypeOf<Output>().toEqualTypeOf<{ readonly foo: string }>();
	});

	test('streamText infers OUTPUT from the `output` param instead of defaulting', () => {
		const program = streamText({
			model: {} as Ai.LanguageModel,
			prompt: 'hi',
			output: Ai.Output.object({ schema: effectSchema(TestSchema) }),
		});
		type StreamResult = Effect.Effect.Success<typeof program>;
		expectTypeOf<StreamResult['output']>().toEqualTypeOf<
			PromiseLike<{ readonly foo: string }>
		>();
	});

	test('tool<INPUT, OUTPUT, R> binds R to Effect requirements, not CONTEXT (0.0.14 call shape)', () => {
		class CommandExecutor extends Effect.Service<CommandExecutor>()(
			'CommandExecutor',
			{ succeed: { run: (cmd: string) => cmd } },
		) {}

		const program = tool<{ command: string }, string, CommandExecutor>({
			description: 'runs a command',
			inputSchema: {} as Ai.FlexibleSchema<{ command: string }>,
			execute: (input) =>
				Effect.gen(function* () {
					const executor = yield* CommandExecutor;
					return executor.run(input.command);
				}),
		});
		expectTypeOf<Effect.Effect.Context<typeof program>>().toEqualTypeOf<
			CommandExecutor | Scope.Scope
		>();
	});

	test('tool contextSchema infers CONTEXT instead of defaulting to Record<string, unknown>', () => {
		const program = tool({
			description: 'ctx',
			inputSchema: {} as Ai.FlexibleSchema<{ x: number }>,
			contextSchema: {} as Ai.FlexibleSchema<{ userId: string }>,
			execute: (_input, options) => Effect.succeed(options.context.userId),
		});
		type ToolType = Effect.Effect.Success<typeof program>;
		expectTypeOf<ToolType>().toEqualTypeOf<
			Ai.Tool<{ x: number }, string, { userId: string }>
		>();
	});
});
