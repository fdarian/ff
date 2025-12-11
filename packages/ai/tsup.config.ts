import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/providers/drizzle/index.ts'],
	format: ['cjs', 'esm'],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	external: [
		'@ai-sdk/valibot',
		'@ai-sdk/provider',
		'ai',
		'drizzle-orm',
		'effect',
		'@effect/platform',
		'postgres',
		'valibot',
	],
});
