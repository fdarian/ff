import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts', 'src/for/**/index.ts'],
	format: ['cjs', 'esm'],
	dts: true,
	splitting: false,
	sourcemap: true,
	clean: true,
	outDir: 'dist',
	fixedExtension: false,
	external: ['effect', '@effect/platform', 'ai', 'inngest', 'inngest/bun'],
});
