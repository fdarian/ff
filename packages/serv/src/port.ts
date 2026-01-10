import { Effect } from 'effect';
import * as GetPort from 'get-port';

export const getPort = (options?: GetPort.Options) =>
	Effect.tryPromise(() => GetPort.default(options));
