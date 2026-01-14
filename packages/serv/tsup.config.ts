import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/exports/orpc.ts'],
	format: ['cjs', 'esm'],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	external: ['effect', '@effect/opentelemetry', 'get-port', '@orpc/server'],
});
