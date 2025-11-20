import { describe, expect, test } from 'bun:test';
import { v7 as createUuid } from 'uuid';
import { convertToUIMessage, ConversationMessage } from './message.js';

function createTestMessage(
	overrides: Partial<ConversationMessage.Type> = {},
): ConversationMessage.Type {
	return {
		id: createUuid() as ConversationMessage.Id,
		role: 'user',
		content: 'Hello',
		createdAt: new Date(),
		...overrides,
	} as ConversationMessage.Type;
}

describe('convertToUIMessage', () => {
	describe('content handling', () => {
		test('converts string content to text part', () => {
			const message = createTestMessage({ content: 'Hello, world!' });
			const result = convertToUIMessage(message);

			expect(result.parts).toEqual([{ type: 'text', text: 'Hello, world!' }]);
		});

		test('converts array content with text parts', () => {
			const message = createTestMessage({
				content: [
					{ type: 'text', text: 'Hello' },
					{ type: 'text', text: 'World' },
				],
			});
			const result = convertToUIMessage(message);

			expect(result.parts).toEqual([
				{ type: 'text', text: 'Hello' },
				{ type: 'text', text: 'World' },
			]);
		});

		test('filters out empty text parts', () => {
			const message = createTestMessage({
				content: [
					{ type: 'text', text: 'Hello' },
					{ type: 'text', text: '' },
					{ type: 'text', text: 'World' },
				],
			});
			const result = convertToUIMessage(message);

			expect(result.parts).toEqual([
				{ type: 'text', text: 'Hello' },
				{ type: 'text', text: 'World' },
			]);
		});

		test('filters out non-text parts', () => {
			const message = createTestMessage({
				content: [
					{ type: 'text', text: 'Hello' },
					{ type: 'image', image: new Uint8Array() },
					{ type: 'text', text: 'World' },
				],
			});
			const result = convertToUIMessage(message);

			expect(result.parts).toEqual([
				{ type: 'text', text: 'Hello' },
				{ type: 'text', text: 'World' },
			]);
		});

		test('returns empty parts for array with no valid text parts', () => {
			const message = createTestMessage({
				content: [
					{ type: 'image', image: new Uint8Array() },
					{ type: 'text', text: '' },
				],
			});
			const result = convertToUIMessage(message);

			expect(result.parts).toEqual([]);
		});
	});

	describe('role mapping', () => {
		test('preserves user role', () => {
			const message = createTestMessage({ role: 'user' });
			const result = convertToUIMessage(message);

			expect(result.role).toBe('user');
		});

		test('preserves assistant role', () => {
			const message = createTestMessage({ role: 'assistant' });
			const result = convertToUIMessage(message);

			expect(result.role).toBe('assistant');
		});

		test('preserves system role', () => {
			const message = createTestMessage({ role: 'system' });
			const result = convertToUIMessage(message);

			expect(result.role).toBe('system');
		});

		test('converts tool role to assistant', () => {
			const message = createTestMessage({ role: 'tool' });
			const result = convertToUIMessage(message);

			expect(result.role).toBe('assistant');
		});
	});

	describe('id preservation', () => {
		test('preserves message id', () => {
			const id = createUuid() as ConversationMessage.Id;
			const message = createTestMessage({ id });
			const result = convertToUIMessage(message);

			expect(result.id).toBe(id);
		});
	});
});
