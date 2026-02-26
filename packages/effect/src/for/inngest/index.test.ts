import { Cron, Duration, Effect } from 'effect';
import { EventSchemas, Inngest } from 'inngest';
import { describe, expect, expectTypeOf, test, vi } from 'vitest';
import { cronToString } from './cron';
import { createInngest } from './index';
import { wrapStep } from './step';

describe('cronToString', () => {
	test('converts simple cron', () => {
		const cron = Cron.unsafeParse('5 4 * * *');
		expect(cronToString(cron)).toBe('5 4 * * *');
	});

	test('converts cron with all fields', () => {
		const cron = Cron.unsafeParse('0 12 1 6 3');
		expect(cronToString(cron)).toBe('0 12 1 6 3');
	});

	test('converts every-minute cron', () => {
		const cron = Cron.unsafeParse('* * * * *');
		expect(cronToString(cron)).toBe('* * * * *');
	});

	test('converts cron with multiple values', () => {
		const cron = Cron.unsafeParse('0,30 * * * *');
		expect(cronToString(cron)).toBe('0,30 * * * *');
	});
});

describe('wrapStep', () => {
	const mockStep = {
		run: vi.fn(),
		sleep: vi.fn(),
		sleepUntil: vi.fn(),
		invoke: vi.fn(),
		waitForEvent: vi.fn(),
		sendEvent: vi.fn(),
	};

	test('step.run executes Effect callback', async () => {
		mockStep.run.mockImplementation((_id: string, fn: () => Promise<unknown>) =>
			fn(),
		);

		const wrapped = wrapStep(mockStep);
		const result = await Effect.runPromise(
			wrapped.run('test', () => Effect.succeed(42)),
		);
		expect(result).toBe(42);
		expect(mockStep.run).toHaveBeenCalledWith('test', expect.any(Function));
	});

	test('step.run wraps errors in InngestError', async () => {
		mockStep.run.mockRejectedValue(new Error('boom'));

		const wrapped = wrapStep(mockStep);
		const exit = await Effect.runPromiseExit(
			wrapped.run('fail', () => Effect.succeed(1)),
		);
		expect(exit._tag).toBe('Failure');
	});

	test('step.sleep converts Duration to ms', async () => {
		mockStep.sleep.mockResolvedValue(undefined);

		const wrapped = wrapStep(mockStep);
		await Effect.runPromise(wrapped.sleep('wait', Duration.hours(1)));
		expect(mockStep.sleep).toHaveBeenCalledWith('wait', 3600000);
	});

	test('step.sleepUntil passes through', async () => {
		mockStep.sleepUntil.mockResolvedValue(undefined);

		const wrapped = wrapStep(mockStep);
		const date = new Date('2024-01-01');
		await Effect.runPromise(wrapped.sleepUntil('until', date));
		expect(mockStep.sleepUntil).toHaveBeenCalledWith('until', date);
	});

	test('step.sendEvent returns ids', async () => {
		mockStep.sendEvent.mockResolvedValue({ ids: ['id1'] });

		const wrapped = wrapStep(mockStep);
		const result = await Effect.runPromise(
			wrapped.sendEvent('send', { name: 'test', data: {} }),
		);
		expect(result).toEqual({ ids: ['id1'] });
	});
});

describe('createInngest', () => {
	test('creates builder with Tag and layer', () => {
		const client = new Inngest({ id: 'test' });
		const ig = createInngest(client);

		expect(ig.Tag).toBeDefined();
		expect(ig.client).toBe(client);
		expect(ig.layer).toBeDefined();
	});

	test('custom tagId', () => {
		const client = new Inngest({ id: 'test' });
		const ig = createInngest(client, { tagId: 'MyInngest' });

		expect(ig.Tag).toBeDefined();
	});

	test('createFunction returns an Effect', async () => {
		const client = new Inngest({ id: 'test' });
		const ig = createInngest(client);

		const fnEffect = ig.createFunction(
			{ id: 'my-fn' },
			{ event: 'test/event' },
			({ step }) =>
				Effect.gen(function* () {
					return 'done';
				}),
		);

		const fn = await Effect.runPromise(fnEffect.pipe(Effect.scoped));
		expect(fn).toBeDefined();
	});

	test('httpHandler returns a fetch handler', () => {
		const client = new Inngest({ id: 'test' });
		const ig = createInngest(client);

		const handler = ig.fetchHandler({ functions: [] });
		expect(typeof handler).toBe('function');
	});

	test('httpHandler returns an Effect HttpApp', () => {
		const client = new Inngest({ id: 'test' });
		const ig = createInngest(client);

		const app = ig.httpHandler({ functions: [] });
		expect(Effect.isEffect(app)).toBe(true);
	});

	test('event schema types flow through', async () => {
		type Data = { email: string };

		const client = new Inngest({
			id: 'typed',
			schemas: new EventSchemas().fromRecord<{
				'user.signup': { data: Data };
			}>(),
		});
		const ig = createInngest(client);

		const fnEffect = ig.createFunction(
			{ id: 'on-signup' },
			{ event: 'user.signup' },
			({ event }) =>
				Effect.gen(function* () {
					expectTypeOf(event).toHaveProperty('name');
					expectTypeOf(event).toHaveProperty('data');
					expectTypeOf(event.data).toEqualTypeOf<Data>();
					const email: string = event.data.email;
					return email;
				}),
		);

		const fn = await Effect.runPromise(fnEffect.pipe(Effect.scoped));
		expect(fn).toBeDefined();
	});
});
