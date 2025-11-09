import type * as Ai from 'ai';
import {
	bigint,
	bigserial,
	jsonb,
	pgSchema,
	type ReferenceConfig,
	timestamp,
	unique,
	uuid,
} from 'drizzle-orm/pg-core';
import type * as v from 'valibot';
import type { ConversationMessage } from '../../conversation/core/message';
import type { ResourceId, ThreadId } from '../../conversation/core/thread';

export const schema = pgSchema('ff_ai');

type ThreadsPk = number & v.Brand<'ThreadsPk'>;
export const threads = schema.table(
	'threads',
	{
		// --
		id: bigserial({ mode: 'number' }).$type<ThreadsPk>().primaryKey(), // Internal primary key
		publicId: uuid().$type<ThreadId>().notNull(), // Public `threadId`
		// --
		resourceId: uuid().$type<ResourceId>().notNull(),
		createdAt: timestamp()
			.$defaultFn(() => new Date())
			.notNull(),
		updatedAt: timestamp()
			.$defaultFn(() => new Date())
			.notNull(),
	},
	(table) => ({
		uniqueResourcePublicId: unique().on(table.resourceId, table.publicId),
	}),
);
function threadId(config?: ReferenceConfig['actions']) {
	return bigint({ mode: 'number' })
		.$type<ThreadsPk>()
		.references(() => threads.id, config);
}

type MessagesPk = number & v.Brand<'MessagesPk'>;
export const messages = schema.table('messages', {
	// --
	id: bigserial({ mode: 'number' }).$type<MessagesPk>().primaryKey(), // Internal primary key
	uuid: uuid().notNull().$type<ConversationMessage.Id>().unique(), // Public `messageId`
	// --
	threadId: threadId({ onDelete: 'cascade' }).notNull(),
	aiSdkV5: jsonb().$type<Ai.ModelMessage>(),
	createdAt: timestamp()
		.$defaultFn(() => new Date())
		.notNull(),
});
