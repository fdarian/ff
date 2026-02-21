import { Effect, Layer, ManagedRuntime } from 'effect';

export type AsyncClient<T> = {
	[K in keyof T]: T[K] extends (...args: infer Args) => Effect.Effect<infer A, infer _E, infer _R>
		? (...args: Args) => Promise<A>
		: T[K] extends Record<string, unknown>
			? AsyncClient<T[K]>
			: T[K];
};

function wrapWithProxy<T extends Record<string, unknown>>(
	target: T,
	runtime: ManagedRuntime.ManagedRuntime<any, any>,
): AsyncClient<T> {
	const cache = new Map<string | symbol, unknown>();
	return new Proxy(target, {
		get(obj, prop) {
			if (prop === 'then') return undefined;
			if (cache.has(prop)) return cache.get(prop);

			const value = obj[prop as keyof T];
			if (typeof value === 'function') {
				const wrapped = (...args: Array<unknown>) =>
					runtime.runPromise(value(...args) as Effect.Effect<unknown, unknown, unknown>);
				cache.set(prop, wrapped);
				return wrapped;
			}
			if (value !== null && typeof value === 'object') {
				const wrapped = wrapWithProxy(
					value as Record<string, unknown>,
					runtime,
				);
				cache.set(prop, wrapped);
				return wrapped;
			}
			return value;
		},
	}) as AsyncClient<T>;
}

export async function asyncClient<A extends Record<string, unknown>, E, R, ER>(
	makeClient: Effect.Effect<A, E, R>,
	layer: Layer.Layer<R, ER, never>,
): Promise<AsyncClient<A> & { dispose: () => Promise<void> }> {
	const runtime = ManagedRuntime.make(layer);
	const client = await runtime.runPromise(makeClient);
	const proxied = wrapWithProxy(client, runtime);
	const result = Object.create(proxied) as AsyncClient<A> & {
		dispose: () => Promise<void>;
	};
	result.dispose = () => runtime.dispose();
	return result;
}

