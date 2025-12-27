import * as NodeSdk from '@effect/opentelemetry/NodeSdk';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
	BatchSpanProcessor,
	ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { Effect, Logger as EffectLogger, Layer, LogLevel } from 'effect';
import { extract } from 'ff-effect';
import { Logger } from 'ff-serv';
import { runTester } from '../utils/run-tester';

const anotherFn = Effect.fn(function* () {
	yield* Logger.info("This won't get logged since there's no otel span");
});

const alsoAnotherFn = () =>
	Effect.gen(function* () {
		yield* Logger.info('This is logged');
	});

export class Service extends Effect.Service<Service>()('service', {
	effect: Effect.gen(function* () {
		return {
			method: yield* extract(
				Effect.fn('method')(
					function* () {
						yield* Logger.info({ one: { two: 22 }, three: 3 }, 'Hello world!');

						yield* Effect.gen(function* () {
							yield* Logger.info('Nested');
						}).pipe(Logger.replaceChild({}, { msgPrefix: '[Nested] ' }));

						yield* Logger.info('Ending');
						yield* anotherFn();
						yield* alsoAnotherFn();
					},
					Logger.replaceChild({}, { msgPrefix: '[Method] ' }),
				),
			),
		};
	}),
}) {}

const NodeSdkLive = NodeSdk.layer(() => ({
	resource: { serviceName: 'example' },
	spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
}));

runTester({
	dependencies: Layer.provideMerge(
		Service.Default,
		Layer.mergeAll(Logger.Default, NodeSdkLive),
	),
	effect: Effect.gen(function* () {
		yield* Logger.info('Starting main');
		const svc = yield* Service;
		yield* svc.method();
	}).pipe(
		// Interop with effect logger
		Effect.annotateLogs('service', 'main'),
		Effect.withSpan('main'),

		// Interop with Effect log level management
		// EffectLogger.withMinimumLogLevel(LogLevel.Debug),
	),
});
