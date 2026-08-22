import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['cjs', 'esm'],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	external: [
		'@ai-sdk/valibot',
		'@ai-sdk/provider',
		'ai',
		'effect',
		'@effect/platform',
		'valibot',
	],
});
