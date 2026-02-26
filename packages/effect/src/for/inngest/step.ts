import { Duration, Effect } from 'effect';
import { runPromiseUnwrapped } from '../../run-promise-unwrapped';
import { InngestError } from './index';

type OriginalStep = {
	run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
	sleep: (id: string, time: number | string) => Promise<void>;
	sleepUntil: (id: string, time: Date | string) => Promise<void>;
	invoke: (id: string, opts: unknown) => Promise<unknown>;
	waitForEvent: (id: string, opts: unknown) => Promise<unknown>;
	sendEvent: (id: string, payload: unknown) => Promise<unknown>;
};

export type WrappedStep<TStep> = ReturnType<typeof wrapStep<TStep>>;

export function wrapStep<TStep>(step: TStep) {
	const s = step as unknown as OriginalStep;

	return {
		run: <A, E>(id: string, fn: () => Effect.Effect<A, E, never>) =>
			Effect.tryPromise({
				try: () => s.run(id, () => runPromiseUnwrapped(fn())),
				catch: (cause) =>
					new InngestError({ message: `Step "${id}" failed`, cause }),
			}) as Effect.Effect<A, InngestError>,

		sleep: (id: string, duration: Duration.DurationInput) =>
			Effect.tryPromise({
				try: () => s.sleep(id, Duration.toMillis(Duration.decode(duration))),
				catch: (cause) =>
					new InngestError({
						message: `Step sleep "${id}" failed`,
						cause,
					}),
			}),

		sleepUntil: (id: string, time: Date | string) =>
			Effect.tryPromise({
				try: () => s.sleepUntil(id, time),
				catch: (cause) =>
					new InngestError({
						message: `Step sleepUntil "${id}" failed`,
						cause,
					}),
			}),

		invoke: <TResult = unknown>(id: string, opts: unknown) =>
			Effect.tryPromise({
				try: () => s.invoke(id, opts),
				catch: (cause) =>
					new InngestError({
						message: `Step invoke "${id}" failed`,
						cause,
					}),
			}) as Effect.Effect<TResult, InngestError>,

		waitForEvent: <TEvent = unknown>(id: string, opts: unknown) =>
			Effect.tryPromise({
				try: () => s.waitForEvent(id, opts),
				catch: (cause) =>
					new InngestError({
						message: `Step waitForEvent "${id}" failed`,
						cause,
					}),
			}) as Effect.Effect<TEvent | null, InngestError>,

		sendEvent: (id: string, payload: unknown) =>
			Effect.tryPromise({
				try: () => s.sendEvent(id, payload),
				catch: (cause) =>
					new InngestError({
						message: `Step sendEvent "${id}" failed`,
						cause,
					}),
			}) as Effect.Effect<{ ids: string[] }, InngestError>,
	};
}
