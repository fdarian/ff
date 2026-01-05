import { Data, Effect } from 'effect';
import { describe, expect, test } from 'vitest';
import { wrapClient } from './wrap-client.js';

class TestError extends Error {
	constructor(
		public _cause: unknown,
		public _message?: string,
	) {
		super('error');
	}
}

type TestClient = {
	value: string;
};

test('resolves successfully', () =>
	Effect.gen(function* () {
		const client: TestClient = { value: 'test-value' };
		const wrap = wrapClient({
			client,
			error: ({ cause, message }) => new TestError(cause, message),
		});

		const result = yield* wrap((c) => Promise.resolve(c.value));

		expect(result).toBe('test-value');
	}).pipe(Effect.runPromise));

describe('rejects', () => {
	test('default - rejects without message when no overrides provided', () =>
		Effect.gen(function* () {
			const client: TestClient = { value: 'test-value' };
			const wrap = wrapClient({
				client,
				error: ({ cause, message }) => new TestError(cause, message),
			});

			const causedBy = new Error('original error');
			const effect = wrap(() => Promise.reject(causedBy));

			const result = yield* Effect.flip(effect);

			expect(result).toBeInstanceOf(TestError);
			expect(result._cause).toBe(causedBy);
			expect(result._message).toBeUndefined();
		}).pipe(Effect.runPromise));

	test('errorHandler override', () =>
		Effect.gen(function* () {
			class CustomError extends Data.TaggedError('CustomError')<{
				cause: unknown;
			}> {}

			const client: TestClient = { value: 'test-value' };
			const wrap = wrapClient({
				client,
				error: ({ cause, message }) => new TestError(cause, message),
			});

			const causedBy = new Error('original error');
			const effect = wrap(() => Promise.reject(causedBy), {
				errorHandler: (cause) => new CustomError({ cause }),
			});

			const result = yield* Effect.flip(effect);

			expect(result).toBeInstanceOf(CustomError);
			expect(result.cause).toBe(causedBy);
		}).pipe(Effect.runPromise));

	describe('errorMessage override', () => {
		test('string', () =>
			Effect.gen(function* () {
				const client: TestClient = { value: 'test-value' };
				const wrap = wrapClient({
					client,
					error: ({ cause, message }) => new TestError(cause, message),
				});

				const causedBy = new Error('original error');
				const effect = wrap(() => Promise.reject(causedBy), {
					errorMessage: 'custom message',
				});

				const result = yield* Effect.flip(effect);

				expect(result).toBeInstanceOf(TestError);
				expect(result._cause).toBe(causedBy);
				expect(result._message).toBe('custom message');
			}).pipe(Effect.runPromise));

		test('handler', () =>
			Effect.gen(function* () {
				const client: TestClient = { value: 'test-value' };
				const wrap = wrapClient({
					client,
					error: ({ cause, message }) => new TestError(cause, message),
				});

				const causedBy = new Error('original error');
				const effect = wrap(() => Promise.reject(causedBy), {
					errorMessage: (cause) => `Error: ${(cause as Error).message}`,
				});

				const result = yield* Effect.flip(effect);

				expect(result).toBeInstanceOf(TestError);
				expect(result._cause).toBe(causedBy);
				expect(result._message).toBe('Error: original error');
			}).pipe(Effect.runPromise));
	});
});
