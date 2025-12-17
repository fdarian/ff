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
	return <OUTPUT>(
		func: (client: CLIENT) => Promise<OUTPUT>,
		overrides?: { error?: ((cause: Cause) => Message) | Message },
	) =>
		Effect.tryPromise({
			try: () => func(opts.client),
			catch: (cause) => {
				const message =
					overrides?.error != null
						? isMessage(overrides.error)
							? overrides.error
							: overrides.error(cause)
						: undefined;
				return opts.error({
					cause,
					...(message != null && { message }),
				});
			},
		});
}
