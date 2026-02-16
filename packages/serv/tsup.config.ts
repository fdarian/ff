import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/exports/orpc.ts', 'src/exports/cache.ts', 'src/exports/cache-ioredis.ts', 'src/exports/cache-bun-redis.ts'],
	format: ['cjs', 'esm'],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	external: ['effect', '@effect/opentelemetry', 'get-port', '@orpc/server', 'ioredis'],
});
