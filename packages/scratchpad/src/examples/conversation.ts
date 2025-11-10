import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { Console, Effect } from 'effect';
import { ConversationStore, createTurnHandler } from 'ff-ai';

const identifier = {
	resourceId: '1',
	threadId: '1',
};

export const ask = Effect.gen(function* () {
	const handler = yield* createTurnHandler({ identifier });

	const messages = yield* handler.getHistory();

	yield* Console.log('Generating');
	const message = {
		role: 'user',
		content: 'What date is it?',
	} as const;
	yield* handler.saveUserMessage(message);
	yield* Effect.tryPromise(() =>
		generateText({
			model: xai('grok-4-fast-non-reasoning'),
			messages: [...messages, message],
			onStepFinish: async (step) =>
				handler.onStep(step).pipe(Effect.runPromise),
		}),
	);
	yield* Console.log('Done');
});

export const query = Effect.gen(function* () {
	const store = yield* ConversationStore;
	const messages = yield* store.getMessages(identifier);
	yield* Console.dir(messages, { depth: null });
});
