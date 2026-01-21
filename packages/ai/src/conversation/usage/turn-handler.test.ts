import { describe, expect, mock, test } from 'bun:test';
import { valibotSchema } from '@ai-sdk/valibot';
import * as Ai from 'ai';
import { generateText } from 'ai';
import * as AiTest from 'ai/test';
import { Effect, Layer } from 'effect';
import { v7 as createUuid } from 'uuid';
import * as v from 'valibot';
import { ConversationMessage } from '../core/message.js';
import { ConversationStore } from '../core/store.js';
import type { ThreadIdentifier } from '../core/thread.js';
import { createTurnHandler } from './turn-handler.js';

function createMockStore() {
	function getKey(identifier: ThreadIdentifier) {
		return `${identifier.resourceId}:${identifier.threadId}`;
	}
	const savedMessages = new Map<string, Array<ConversationMessage.Type>>();

	const mocks = {
		getMessages: mock<ConversationStore['Type']['getMessages']>((params) =>
			Effect.succeed(savedMessages.get(getKey(params)) ?? []),
		),
		saveMessages: mock<ConversationStore['Type']['saveMessages']>((params) => {
			const arr = savedMessages.get(getKey(params)) ?? [];
			arr.push(...params.messages);
			savedMessages.set(getKey(params), arr);
			return Effect.succeed(void 0);
		}),
	};

	return {
		savedMessages,
		mocks,
		layer: Layer.succeed(ConversationStore, {
			getMessages: mocks.getMessages,
			saveMessages: mocks.saveMessages,
		}),
	};
}

function createMockAgentMessage(content: string): ConversationMessage.Type {
	return {
		id: createUuid() as any,
		role: 'user',
		content,
		createdAt: new Date(),
	};
}

describe('saveMessage', () => {
	type UserStep = {
		request: Exclude<Ai.UserContent, string>;
		response: Exclude<Ai.AssistantContent, string>;
	};
	type SubsequentStep = {
		request: Ai.ToolContent;
		response: Exclude<Ai.AssistantContent, string>;
	};

	const MockStore = createMockStore();
	const TestLayer = MockStore.layer;

	const run = (params: {
		steps: [UserStep, ...Array<SubsequentStep>];
		tools?: Ai.ToolSet;
	}) =>
		Effect.gen(function* () {
			const identifier: ThreadIdentifier = {
				resourceId: 'resource-1',
				threadId: 'thread-1',
			};
			const handler = yield* createTurnHandler({ identifier });
			// --

			const userMessage = ConversationMessage.fromModelMessage({
				role: 'user',
				content: params.steps[0].request,
			});
			const store = yield* ConversationStore;
			yield* handler.saveUserMessage(userMessage);
			let stepNumber = 0;
			yield* Effect.tryPromise(() =>
				generateText({
					tools: params.tools,
					model: new AiTest.MockLanguageModelV3({
						// @ts-expect-error
						doGenerate: async ({ prompt }) => {
							const step = params.steps[stepNumber++];
							if (step == null) {
								throw new Error(
									`Missing step for ${JSON.stringify(prompt, null, 2)}

Step number: ${stepNumber}
Available steps: ${JSON.stringify(params.steps, null, 2)}`,
								);
							}
							return {
								content: [...step.response],
								finishReason: '',
								usage: { inputTokens: 99, outputTokens: 99, totalTokens: 99 },
								warnings: [],
							};
						},
					}),
					system: 'You are a helpful assistant',
					stopWhen: Ai.stepCountIs(99),
					messages: [userMessage],
					onStepFinish: async (step) =>
						handler.onStep(step).pipe(Effect.runPromise),
				}),
			);

			expect(
				(yield* store.getMessages(identifier)).map(
					({ id, createdAt, ...m }) => ({
						...m,
					}),
				),
			).toMatchSnapshot();
		}).pipe(Effect.provide(TestLayer), (e) => Effect.runPromise(e));

	test('simple one step', async () =>
		run({
			steps: [
				{
					request: [{ type: 'text', text: 'Hello' }],
					response: [{ type: 'text', text: 'Hi' }],
				},
			],
		}));

	test('multi turn tool call', async () =>
		run({
			tools: {
				one: Ai.tool({
					inputSchema: valibotSchema(
						v.object({
							query: v.string(),
						}),
					),
					execute: (params) => params,
				}),
				two: Ai.tool({
					inputSchema: valibotSchema(
						v.object({
							another: v.string(),
						}),
					),
					execute: (params) => params,
				}),
			},
			steps: [
				{
					request: [{ type: 'text', text: 'Hello' }],
					response: [
						{
							type: 'tool-call',
							input: JSON.stringify({ query: 'any' }),
							toolName: 'one',
							toolCallId: 'tool-1-call-1',
						},
						{
							type: 'tool-call',
							input: JSON.stringify({ another: 'any' }),
							toolName: 'two',
							toolCallId: 'tool-2-call-1',
						},
					],
				},
				{
					request: [
						{
							type: 'tool-result',
							output: { type: 'json', value: { query: 'any' } },
							toolName: 'one',
							toolCallId: 'tool-1-call-1',
						},
						{
							type: 'tool-result',
							output: { type: 'json', value: { another: 'any' } },
							toolName: 'two',
							toolCallId: 'tool-2-call-1',
						},
					],
					response: [{ type: 'text', text: 'all good' }],
				},
			],
		}));
});

describe('getHistory', () => {
	test('getHistory returns messages from store', async () => {
		const mockMessages = [
			createMockAgentMessage('Previous message 1'),
			createMockAgentMessage('Previous message 2'),
		];

		const store = createMockStore();
		store.mocks.getMessages.mockReturnValue(Effect.succeed(mockMessages));

		const identifier: ThreadIdentifier = {
			resourceId: 'resource-6',
			threadId: 'thread-6',
		};

		const history = await Effect.gen(function* () {
			const handler = yield* createTurnHandler({ identifier });
			return yield* handler.getHistory();
		}).pipe(Effect.provide(store.layer), Effect.runPromise);

		expect(store.mocks.getMessages).toHaveBeenCalledWith({
			resourceId: 'resource-6',
			threadId: 'thread-6',
			windowSize: 10,
		});
		expect(history).toEqual(mockMessages);
	});

	test('getHistory respects default window size of 10', async () => {
		const mockMessages = Array.from({ length: 15 }, (_, i) =>
			createMockAgentMessage(`Message ${i + 1}`),
		);

		const store = createMockStore();
		store.mocks.getMessages.mockReturnValue(Effect.succeed(mockMessages));

		const identifier: ThreadIdentifier = {
			resourceId: 'resource-7',
			threadId: 'thread-7',
		};

		const history = await Effect.gen(function* () {
			const handler = yield* createTurnHandler({ identifier });
			return yield* handler.getHistory();
		}).pipe(Effect.provide(store.layer), Effect.runPromise);

		expect(store.mocks.getMessages).toHaveBeenCalledWith({
			resourceId: 'resource-7',
			threadId: 'thread-7',
			windowSize: 10,
		});
		expect(history).toHaveLength(15);
	});

	test('getHistory respects custom window size', async () => {
		const mockMessages = Array.from({ length: 20 }, (_, i) =>
			createMockAgentMessage(`Message ${i + 1}`),
		);

		const store = createMockStore();
		store.mocks.getMessages.mockReturnValue(Effect.succeed(mockMessages));

		const identifier: ThreadIdentifier = {
			resourceId: 'resource-8',
			threadId: 'thread-8',
		};

		const history = await Effect.gen(function* () {
			const handler = yield* createTurnHandler({ identifier });
			return yield* handler.getHistory({ windowSize: 5 });
		}).pipe(Effect.provide(store.layer), Effect.runPromise);

		expect(store.mocks.getMessages).toHaveBeenCalledWith({
			resourceId: 'resource-8',
			threadId: 'thread-8',
			windowSize: 5,
		});
		expect(history).toHaveLength(20);
	});

	test('getHistory handles window size larger than available messages', async () => {
		const mockMessages = [
			createMockAgentMessage('Message 1'),
			createMockAgentMessage('Message 2'),
			createMockAgentMessage('Message 3'),
		];

		const store = createMockStore();
		store.mocks.getMessages.mockReturnValue(Effect.succeed(mockMessages));

		const identifier: ThreadIdentifier = {
			resourceId: 'resource-9',
			threadId: 'thread-9',
		};

		const history = await Effect.gen(function* () {
			const handler = yield* createTurnHandler({ identifier });
			return yield* handler.getHistory({ windowSize: 20 });
		}).pipe(Effect.provide(store.layer), Effect.runPromise);

		expect(store.mocks.getMessages).toHaveBeenCalledWith({
			resourceId: 'resource-9',
			threadId: 'thread-9',
			windowSize: 20,
		});
		expect(history).toHaveLength(3);
		expect(history).toEqual(mockMessages);
	});
});
