import { Cause, Data, Effect } from 'effect';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { rethrowErrors } from './rethrow-errors.js';

class EditFailure extends Data.TaggedError('modules/scout.EditFailure')<{
	reason: string;
}> {}

class OtherFailure extends Data.TaggedError('OtherFailure')<
	Record<string, never>
> {}

/** Same short tag (`EditFailure`) as the class above, but a different namespace. */
class OtherModuleEditFailure extends Data.TaggedError(
	'modules/other.EditFailure',
)<{
	reason: string;
}> {}

class NestedEditFailure extends Data.TaggedError('app.modules.EditFailure')<{
	reason: string;
}> {}

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

test('rethrows the first error of a combined cause when it has a handler', () =>
	Effect.gen(function* () {
		const cause = Cause.combine(
			Cause.fail(new EditFailure({ reason: 'bad edit' })),
			Cause.fail(new OtherFailure({})),
		);

		const result = yield* Effect.flip(
			rethrowErrors(cause, {
				EditFailure: (error) => `edit failed: ${error.reason}`,
				OtherFailure: () => 'other failed',
			}),
		);

		expect(result).toBe('edit failed: bad edit');
	}).pipe(Effect.runPromise));

/**
 * `Cause.findErrorOption` only ever looks at the first error in the cause, so
 * a handler for a later error never runs. This documents that current
 * behavior rather than asserting it's the ideal one.
 */
test('succeeds with void when only a later error in a combined cause has a handler', () =>
	Effect.gen(function* () {
		const cause = Cause.combine(
			Cause.fail(new EditFailure({ reason: 'bad edit' })),
			Cause.fail(new OtherFailure({})),
		);

		const result = yield* rethrowErrors(cause, {
			OtherFailure: () => 'other failed',
		});

		expect(result).toBeUndefined();
	}).pipe(Effect.runPromise));

test('a handler is shared by same-named errors from different namespaces', () =>
	Effect.gen(function* () {
		const handlers = {
			EditFailure: (error: EditFailure | OtherModuleEditFailure) =>
				`edit failed: ${error.reason}`,
		};

		const scoutResult = yield* Effect.flip(
			rethrowErrors(Cause.fail(new EditFailure({ reason: 'scout' })), handlers),
		);
		const otherResult = yield* Effect.flip(
			rethrowErrors(
				Cause.fail(new OtherModuleEditFailure({ reason: 'other' })),
				handlers,
			),
		);

		expect(scoutResult).toBe('edit failed: scout');
		expect(otherResult).toBe('edit failed: other');
	}).pipe(Effect.runPromise));

test('splits the tag on the first dot only, keeping the rest of the namespace in the short tag', () =>
	Effect.gen(function* () {
		const cause = Cause.fail(new NestedEditFailure({ reason: 'nested' }));

		const result = yield* Effect.flip(
			rethrowErrors(cause, {
				'modules.EditFailure': (error) => {
					expectTypeOf(error).toEqualTypeOf<NestedEditFailure>();
					return `edit failed: ${error.reason}`;
				},
			}),
		);

		expect(result).toBe('edit failed: nested');
	}).pipe(Effect.runPromise));

// The cast to `E` inside `rethrowErrors` means these types are the only thing
// keeping handler arguments honest — a `tsc`-only regression here wouldn't
// throw at runtime, so `check:type` is what would catch it.
describe('type-level checks', () => {
	test('narrows the handler argument to the matching union member, not the whole union', () => {
		const cause = Cause.fail(new EditFailure({ reason: 'x' })) as Cause.Cause<
			EditFailure | OtherFailure
		>;

		rethrowErrors(cause, {
			EditFailure: (error) => {
				expectTypeOf(error).toEqualTypeOf<EditFailure>();
				return error.reason;
			},
			OtherFailure: (error) => {
				expectTypeOf(error).toEqualTypeOf<OtherFailure>();
				return 'other failed';
			},
		});
	});

	test('rejects a handler key that is not a short tag of the error union', () => {
		const cause = Cause.fail(new EditFailure({ reason: 'x' })) as Cause.Cause<
			EditFailure | OtherFailure
		>;

		rethrowErrors(cause, {
			// @ts-expect-error 'NotATag' is not a short tag of EditFailure | OtherFailure
			NotATag: () => 'nope',
		});
	});
});
