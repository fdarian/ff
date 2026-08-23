import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['cjs', 'esm'],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	outDir: 'dist',
	fixedExtension: false,
	external: [
		'@ai-sdk/valibot',
		'@ai-sdk/provider',
		'ai',
		'effect',
		'@effect/platform',
		'valibot',
	],
});
