import { Effect } from 'effect';

type Cause = unknown;
type Message = string;
function isMessage(x: unknown): x is Message {
	return typeof x === 'string';
}

export function wrapClient<CLIENT, ERROR extends Error>(opts: {
	client: CLIENT;
	error: (ctx: { cause: Cause; message?: Message }) => ERROR;
}) {
	return <OUTPUT, OVERRIDEN_ERROR>(
		func: (client: CLIENT) => Promise<OUTPUT>,
		overrides?: {
			errorHandler?: (cause: Cause) => OVERRIDEN_ERROR;
			errorMessage?: ((cause: Cause) => Message) | Message;
		},
	) =>
		Effect.tryPromise({
			try: () => func(opts.client),
			catch: (cause) => {
				if (overrides?.errorHandler) {
					return overrides.errorHandler(cause);
				}

				const message =
					overrides?.errorMessage != null
						? isMessage(overrides.errorMessage)
							? overrides.errorMessage
							: overrides.errorMessage(cause)
						: undefined;
				return opts.error({
					cause,
					...(message != null && { message }),
				});
			},
		}) as Effect.Effect<
			OUTPUT,
			unknown extends OVERRIDEN_ERROR ? ERROR : OVERRIDEN_ERROR
		>;
}