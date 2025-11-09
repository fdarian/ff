import type * as Ai from 'ai';
import { Effect } from 'effect';
import { ConversationMessage } from '../core/message.js';
import { ConversationStore } from '../core/store.js';
import type { ThreadIdentifier } from '../core/thread.js';

export const createTurnHandler = Effect.fn(function* (ctx: {
	identifier: ThreadIdentifier;
}) {
	const store = yield* ConversationStore;
	let lastIndex = 0;
	return {
		getHistory: Effect.fn(function* (params?: { windowSize?: number }) {
			const windowSize = params?.windowSize ?? 10;
			const messages = yield* store.getMessages({
				resourceId: ctx.identifier.resourceId,
				threadId: ctx.identifier.threadId,
				windowSize,
			});
			return messages;
		}),
		saveUserMessage: Effect.fn(function* (message: ConversationMessage.Type) {
			yield* store.saveMessages({
				resourceId: ctx.identifier.resourceId,
				threadId: ctx.identifier.threadId,
				messages: [message],
			});
		}),
		onStep: Effect.fn(function* <TOOLS extends Ai.ToolSet>(
			step: Ai.StepResult<TOOLS>,
		) {
			const newMessages = step.response.messages.slice(lastIndex);
			lastIndex = step.response.messages.length;

			yield* store.saveMessages({
				resourceId: ctx.identifier.resourceId,
				threadId: ctx.identifier.threadId,
				messages: newMessages.map(ConversationMessage.fromModelMessage),
			});
		}),
	};
});
