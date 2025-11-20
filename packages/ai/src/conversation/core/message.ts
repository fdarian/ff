import type * as Ai from 'ai';
import { v7 as createUuid } from 'uuid';
import * as v from 'valibot';

export namespace ConversationMessage {
	const idSchema = v.pipe(
		v.string(),
		v.uuid(),
		v.brand('ff-ai/ConversationMessageId'),
	);
	export type Id = v.InferOutput<typeof idSchema>;

	export type Type = Ai.ModelMessage & {
		id: Id;
		createdAt: Date;
	};

	export function fromModelMessage(message: Ai.ModelMessage): Type {
		return {
			...message,
			id: createUuid() as Id,
			createdAt: new Date(),
		};
	}
}

export function convertToUIMessage(
	message: ConversationMessage.Type,
): Ai.UIMessage {
	const parts: Array<Ai.UIMessagePart<Ai.UIDataTypes, Ai.UITools>> = [];

	if (typeof message.content === 'string') {
		parts.push({ type: 'text', text: message.content });
	} else {
		for (const part of message.content) {
			if (part.type === 'text' && part.text) {
				parts.push({ type: 'text', text: part.text });
			}
		}
	}

	const role = message.role === 'tool' ? 'assistant' : message.role;

	return {
		id: message.id,
		role,
		parts,
	};
}
