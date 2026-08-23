import type * as Ai from 'ai';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import type { ConversationMessage } from '../../conversation/core/message';
import { ConversationStore } from '../../conversation/core/store';
import type { ThreadIdentifier } from '../../conversation/core/thread';
import * as tables from './schema';
import { createCaller, StoreDrizzle } from './store.js';

export const ConversationStoreLayer = Layer.effect(
	ConversationStore,
	Effect.gen(function* () {
		const db = yield* StoreDrizzle;

		const getMessages: ConversationStore['Type']['getMessages'] = Effect.fn(
			function* (params) {
				const windowSize = params.windowSize ?? 10;

				if (windowSize === 0) {
					return [];
				}

				// First get the thread ID
				const [thread] = yield* db.call((drizzle) =>
					drizzle
						.select({ id: tables.threads.id })
						.from(tables.threads)
						.where(eqThread(params))
						.limit(1),
				);

				if (!thread) {
					return [];
				}

				// Get user messages with limit to find the cutoff point
				// We order by DESC to get the most recent ones, then limit by windowSize
				const recentUserMessages = yield* db.call((drizzle) =>
					drizzle
						.select({
							id: tables.messages.id,
							createdAt: tables.messages.createdAt,
						})
						.from(tables.messages)
						.where(
							and(
								eq(tables.messages.threadId, thread.id),
								sql`${tables.messages.aiSdkV5}->>'role' = 'user'`,
							),
						)
						.orderBy(desc(tables.messages.createdAt), desc(tables.messages.id))
						.limit(windowSize),
				);

				if (recentUserMessages.length === 0) {
					return [];
				}

				// Get the oldest user message from our window (it's the last one since we ordered DESC)
				const oldestUserMessage =
					recentUserMessages[recentUserMessages.length - 1];
				if (!oldestUserMessage) {
					return [];
				}

				// Now get all messages from that user message onward
				const messages = yield* db.call((drizzle) =>
					drizzle
						.select({
							id: tables.messages.uuid,
							aiSdkV5: tables.messages.aiSdkV5,
							createdAt: tables.messages.createdAt,
						})
						.from(tables.messages)
						.innerJoin(
							tables.threads,
							eq(tables.messages.threadId, tables.threads.id),
						)
						.where(
							and(
								eq(tables.messages.threadId, thread.id),
								gte(tables.messages.id, oldestUserMessage.id),
							),
						)
						.orderBy(asc(tables.messages.createdAt), asc(tables.messages.id)),
				);

				return messages.map((msg): ConversationMessage.Type => {
					if (!msg.aiSdkV5) {
						throw new Error('Message has null aiSdkV5 after migration');
					}
					return {
						id: msg.id,
						createdAt: msg.createdAt,
						...msg.aiSdkV5,
					};
				});
			},
		);

		const saveMessages: ConversationStore['Type']['saveMessages'] = Effect.fn(
			function* (params) {
				const main = Effect.gen(function* () {
					const db = yield* StoreDrizzle;

					const [thread] = yield* db.call((drizzle) =>
						drizzle
							.insert(tables.threads)
							.values({
								publicId: params.threadId,
								resourceId: params.resourceId,
								updatedAt: new Date(),
							})
							.onConflictDoUpdate({
								target: [tables.threads.resourceId, tables.threads.publicId],
								set: {
									updatedAt: new Date(),
								},
							})
							.returning({ id: tables.threads.id }),
					);
					if (thread == null) {
						throw new Error('No thread inserted/updated');
					}

					// Insert new messages only if there are any
					if (params.messages.length > 0) {
						yield* db.call((drizzle) =>
							drizzle.insert(tables.messages).values(
								params.messages.map(
									(message): typeof tables.messages.$inferInsert => {
										const { id, createdAt, ...aiSdkV5 } = message;
										return {
											uuid: id,
											aiSdkV5: aiSdkV5 as Ai.ModelMessage,
											createdAt,
											threadId: thread.id,
										};
									},
								),
							),
						);
					}
				});

				yield* db.call((drizzle) =>
					drizzle.transaction(async (tx) =>
						main.pipe(
							Effect.provideService(StoreDrizzle, {
								call: createCaller(tx),
							}),
							(e) => Effect.runPromise(e),
						),
					),
				);
			},
		);

		return {
			getMessages,
			saveMessages,
		};
	}),
);

function eqThread(params: ThreadIdentifier) {
	return and(
		eq(tables.threads.resourceId, params.resourceId),
		eq(tables.threads.publicId, params.threadId),
	);
}
