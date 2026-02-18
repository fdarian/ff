import * as NodeSdk from '@effect/opentelemetry/NodeSdk';
import {
	BatchSpanProcessor,
	ConsoleSpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { Effect, Layer } from 'effect';
import { extract } from 'ff-effect';
import { Logger } from 'ff-serv';
import { runTester } from '../utils/run-tester';

export class Service extends Effect.Service<Service>()('service', {
	effect: Effect.gen(function* () {
		return {
			method: yield* extract(
				Effect.fn('method')(
					function* () {
						yield* Logger.debug('Debug');
						yield* Logger.info({ one: { two: 22 }, three: 3 }, 'Info');
						yield* Logger.warn('Warn');
						yield* Logger.error('Error');

						yield* Effect.gen(function* () {
							const syncLogger = yield* Logger.sync();
							yield* Logger.info('Nested');
							syncLogger.info('Sync still work');
						}).pipe(Logger.replaceChild({}, { msgPrefix: '[Nested] ' }));
					},
					Logger.replaceChild({}, { msgPrefix: '[Method] ' }),
				),
			),
		};
	}),
}) {}

const NodeSdkLive = NodeSdk.layer(() => ({
	resource: { serviceName: 'example' },
	spanProcessor: new BatchSpanProcessor(new ConsoleSpanExporter()),
}));

runTester({
	dependencies: Layer.provideMerge(
		Service.Default,
		Layer.mergeAll(Logger.Default, NodeSdkLive),
	),
	effect: Effect.gen(function* () {
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
