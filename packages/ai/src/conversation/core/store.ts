import { Context, type Effect } from 'effect';
import type { StoreError } from '../../common/store.js';
import type { ConversationMessage } from './message.js';
import type { ThreadIdentifier } from './thread.js';

export class ConversationStore extends Context.Tag(
	'ff-ai/conversation/ConversationStore',
)<
	ConversationStore,
	{
		getMessages: (
			params: ThreadIdentifier & { windowSize?: number },
		) => Effect.Effect<Array<ConversationMessage.Type>, StoreError>;
		saveMessages: (
			params: ThreadIdentifier & {
				messages: Array<ConversationMessage.Type>;
			},
		) => Effect.Effect<void, StoreError>;
	}
>() {}
