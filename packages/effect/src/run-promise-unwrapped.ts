import { Cause, Effect, Exit, Option } from 'effect';

/**
 * A simple wrapper around Effect.runPromiseExit that throws the error if it's a failure
 **/
export async function runPromiseUnwrapped<A, E>(
	effect: Effect.Effect<A, E, never>,
) {
	const exit = await Effect.runPromiseExit(effect);
	return Exit.match(exit, {
		onSuccess: (value) => value,
		onFailure: (cause) => {
			throw Option.getOrElse(Cause.findErrorOption(cause), () => cause);
		},
	});
}
