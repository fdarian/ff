import { Cause, Effect, Option } from 'effect';

type TaggedError = { readonly _tag: string };

/** Tags carry a module namespace (`modules/scout.EditFailure`); handlers key off the bare name. */
type ShortTag<Tag extends string> = Tag extends `${string}.${infer Short}`
	? Short
	: Tag;

type ErrorWithShortTag<E extends TaggedError, Short extends string> = Extract<
	E,
	{ readonly _tag: Short | `${string}.${Short}` }
>;

type Handlers<E extends TaggedError> = {
	readonly [Short in ShortTag<E['_tag']>]?: (
		error: ErrorWithShortTag<E, Short>,
	) => string;
};

function shortTag(tag: string): string {
	const separator = tag.indexOf('.');
	return separator === -1 ? tag : tag.slice(separator + 1);
}

/**
 * Re-fails a caught `Cause` as the plain string an AI tool hands back to the
 * model, for the errors named in `handlers`. Anything else — a defect, an
 * error with no handler — succeeds with void, so the caller's catch-all still
 * gets to log it and answer with its own generic message.
 */
export function rethrowErrors<E extends TaggedError>(
	cause: Cause.Cause<E>,
	handlers: Handlers<E>,
): Effect.Effect<void, string> {
	const error = Cause.findErrorOption(cause);
	if (Option.isNone(error)) return Effect.void;

	const byShortTag = handlers as Record<
		string,
		((error: E) => string) | undefined
	>;
	const handle = byShortTag[shortTag(error.value._tag)];
	return handle ? Effect.fail(handle(error.value)) : Effect.void;
}
