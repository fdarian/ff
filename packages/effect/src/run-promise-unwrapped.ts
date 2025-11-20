import { Cause, Effect, Exit } from "effect";

/**
 * A simple wrapper around Effect.runPromiseExit that throws the error if it's a failure
 **/
export async function runPromiseUnwrapped<A, E>(
	effect: Effect.Effect<A, E, never>
) {
	const exit = await Effect.runPromiseExit(effect);
	return Exit.match(exit, {
		onSuccess: (value) => value,
		onFailure: (cause) => {
			throw Cause.isFailType(cause) ? cause.error : cause;
		},
	});
}
