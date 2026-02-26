import { HttpApp } from '@effect/platform';
import { type Cron, Data, Effect, FiberSet, Layer } from 'effect';
import * as Context from 'effect/Context';
import * as Inspectable from 'effect/Inspectable';
import type { GetEvents, GetFunctionInput, Inngest } from 'inngest';
import { serve } from 'inngest/bun';
import { extract } from '../../extract';
import { cronToString } from './cron';
import { wrapStep } from './step';

export const TagTypeId = Context.TagTypeId;
export const NodeInspectSymbol = Inspectable.NodeInspectSymbol;

export class InngestError extends Data.TaggedError('ff-effect/InngestError')<{
	message: string;
	cause?: unknown;
}> {}

declare const InngestFunctionBrand: unique symbol;

/** Opaque wrapper around inngest's InngestFunction to avoid leaking internal types */
export type InngestFunction = { readonly [InngestFunctionBrand]: true };

// biome-ignore lint/suspicious/noExplicitAny: matches Inngest.Any
type AnyInngest = Inngest<any>;

type CreateFunctionParams<TClient extends AnyInngest> = Parameters<
	TClient['createFunction']
>;

type FunctionConfig<TClient extends AnyInngest> =
	CreateFunctionParams<TClient>[0];

type FunctionTrigger<TClient extends AnyInngest> =
	CreateFunctionParams<TClient>[1];

type TriggerInput<TClient extends AnyInngest> =
	| FunctionTrigger<TClient>
	| CronTrigger;

type ExtractTriggerName<TClient extends AnyInngest, T> = T extends {
	event: infer E extends keyof GetEvents<TClient, true> & string;
}
	? E
	: keyof GetEvents<TClient, true> & string;

type CronTrigger = { cron: Cron.Cron };

function isCronTrigger(trigger: unknown): trigger is CronTrigger {
	return (
		typeof trigger === 'object' &&
		trigger !== null &&
		'cron' in trigger &&
		typeof (trigger as CronTrigger).cron === 'object' &&
		(trigger as CronTrigger).cron !== null &&
		'minutes' in (trigger as CronTrigger).cron
	);
}

function resolveTrigger<TClient extends AnyInngest>(
	trigger: TriggerInput<TClient>,
): FunctionTrigger<TClient> {
	if (Array.isArray(trigger)) {
		return trigger.map((t) =>
			resolveTrigger<TClient>(t),
		) as FunctionTrigger<TClient>;
	}
	if (isCronTrigger(trigger)) {
		return { cron: cronToString(trigger.cron) } as FunctionTrigger<TClient>;
	}
	return trigger as FunctionTrigger<TClient>;
}

type EffectHandlerCtx<
	TClient extends AnyInngest,
	TTriggerName extends keyof GetEvents<TClient, true> &
		string = keyof GetEvents<TClient, true> & string,
> = Omit<GetFunctionInput<TClient, TTriggerName>, 'step'> & {
	step: ReturnType<typeof wrapStep<unknown>>;
};

const defaultPrefix = '@ff-effect/Inngest' as const;

export function createInngest<
	TClient extends AnyInngest,
	E,
	R,
	T extends string = typeof defaultPrefix,
>(createClient: Effect.Effect<TClient, E, R>, opts?: { tagId?: T }) {
	const tagId = (opts?.tagId ?? defaultPrefix) as T;

	type Tag = typeof tagId;
	const Tag = Context.Tag(tagId)<Tag, TClient>();

	const send = (
		payload: Parameters<TClient['send']>[0],
	): Effect.Effect<{ ids: string[] }, InngestError, Tag> =>
		Effect.gen(function* () {
			const c = yield* Tag;
			return yield* Effect.tryPromise({
				// @ts-expect-error inngest generic variance issue between constrained and inferred client types
				try: () => c.send(payload) as Promise<{ ids: string[] }>,
				catch: (cause) =>
					new InngestError({ message: 'Failed to send event', cause }),
			});
		});

	const createFunction = <TTrigger extends TriggerInput<TClient>, A, EH, RH>(
		config: FunctionConfig<TClient>,
		trigger: TTrigger,
		handler: (
			ctx: EffectHandlerCtx<TClient, ExtractTriggerName<TClient, TTrigger>>,
		) => Effect.Effect<A, EH, RH>,
	) =>
		Effect.gen(function* () {
			const c = yield* Tag;
			const ext_handler = yield* extract(handler);
			const resolvedTrigger = resolveTrigger<TClient>(trigger);
			const runPromise = yield* FiberSet.makeRuntimePromise();

			return c.createFunction(
				config,
				resolvedTrigger,
				// biome-ignore lint/suspicious/noExplicitAny: inngest middleware produces unresolvable context type
				async (ctx: any) => {
					const effectStep = wrapStep(ctx.step);
					return runPromise(
						ext_handler({
							...ctx,
							step: effectStep,
						} as unknown as EffectHandlerCtx<
							TClient,
							ExtractTriggerName<TClient, TTrigger>
						>),
					);
				},
			) as unknown as InngestFunction;
		});

	type ServeOpts = {
		functions: InngestFunction[];
		servePath?: string;
		signingKey?: string;
		signingKeyFallback?: string;
		logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'silent';
		streaming?: 'allow' | 'force' | false;
	};

	function buildServe(client: TClient, httpOpts: ServeOpts) {
		return serve({
			client,
			functions: httpOpts.functions as unknown as Parameters<
				typeof serve
			>[0]['functions'],
			...(httpOpts.servePath != null && { servePath: httpOpts.servePath }),
			...(httpOpts.signingKey != null && {
				signingKey: httpOpts.signingKey,
			}),
			...(httpOpts.signingKeyFallback != null && {
				signingKeyFallback: httpOpts.signingKeyFallback,
			}),
			...(httpOpts.logLevel != null && { logLevel: httpOpts.logLevel }),
			...(httpOpts.streaming != null && { streaming: httpOpts.streaming }),
		});
	}

	const fetchHandler = (httpOpts: ServeOpts) =>
		Effect.gen(function* () {
			const c = yield* Tag;
			return buildServe(c, httpOpts);
		});

	const httpHandler = (httpOpts: ServeOpts) =>
		Effect.gen(function* () {
			const c = yield* Tag;
			return HttpApp.fromWebHandler(buildServe(c, httpOpts));
		});

	return {
		Tag,
		layer: Layer.effect(Tag, createClient),
		createFunction,
		send,
		fetchHandler,
		httpHandler,
	};
}
