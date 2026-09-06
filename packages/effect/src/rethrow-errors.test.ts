import { Cause, Data, Effect } from 'effect';
import { expect, test } from 'vitest';
import { rethrowErrors } from './rethrow-errors.js';

class EditFailure extends Data.TaggedError('modules/scout.EditFailure')<{
	reason: string;
}> {}

class OtherFailure extends Data.TaggedError('OtherFailure')<
	Record<string, never>
> {}

test('rethrows using the bare tag for a namespaced error', () =>
	Effect.gen(function* () {
		const cause = Cause.fail(new EditFailure({ reason: 'bad edit' }));

		const result = yield* Effect.flip(
			rethrowErrors(cause, {
				EditFailure: (error) => `edit failed: ${error.reason}`,
			}),
		);

		expect(result).toBe('edit failed: bad edit');
	}).pipe(Effect.runPromise));

test('rethrows using a bare tag directly', () =>
	Effect.gen(function* () {
		const cause = Cause.fail(new OtherFailure({}));

		const result = yield* Effect.flip(
			rethrowErrors(cause, {
				OtherFailure: () => 'other failed',
			}),
		);

		expect(result).toBe('other failed');
	}).pipe(Effect.runPromise));

test('succeeds with void when no handler matches the tag', () =>
	Effect.gen(function* () {
		const cause = Cause.fail(new OtherFailure({}));

		const result = yield* rethrowErrors(cause, {});

		expect(result).toBeUndefined();
	}).pipe(Effect.runPromise));

test('succeeds with void when the cause has no error (e.g. only a defect)', () =>
	Effect.gen(function* () {
		const cause = Cause.die('boom');

		const result = yield* rethrowErrors(cause, {
			OtherFailure: () => 'other failed',
		});

		expect(result).toBeUndefined();
	}).pipe(Effect.runPromise));
