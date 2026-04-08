import { Effect, Layer } from 'effect';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { asyncClient, type AsyncClient } from './async-client.js';

const TestLayer = Layer.empty;

type TestClient = {
	greet: (name: string) => Effect.Effect<string>;
	nested: {
		add: (a: number, b: number) => Effect.Effect<number>;
	};
	fail: () => Effect.Effect<never, Error>;
};

const testClientEffect = Effect.succeed({
	greet: (name: string) => Effect.succeed(`hello ${name}`),
	nested: {
		add: (a: number, b: number) => Effect.succeed(a + b),
	},
	fail: () => Effect.fail(new Error('test error')),
} satisfies TestClient);

describe('asyncClient', () => {
	test('wraps single-level methods', async () => {
		const client = await asyncClient(testClientEffect, TestLayer);
		const result = await client.greet('world');
		expect(result).toBe('hello world');
		await client.dispose();
	});

	test('wraps nested group methods', async () => {
		const client = await asyncClient(testClientEffect, TestLayer);
		const result = await client.nested.add(1, 2);
		expect(result).toBe(3);
		await client.dispose();
	});

	test('propagates errors as rejected promises', async () => {
		const client = await asyncClient(testClientEffect, TestLayer);
		await expect(client.fail()).rejects.toThrow('test error');
		await client.dispose();
	});

	test('dispose cleans up runtime', async () => {
		const client = await asyncClient(testClientEffect, TestLayer);
		await client.dispose();
	});

	test('type safety', () => {
		expectTypeOf<AsyncClient<TestClient>>().toEqualTypeOf<{
			greet: (name: string) => Promise<string>;
			nested: {
				add: (a: number, b: number) => Promise<number>;
			};
			fail: () => Promise<never>;
		}>();
	});
});
