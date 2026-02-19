import { existsSync } from 'node:fs';
import { Glob } from 'bun';

const glob = new Glob('*/package.json');

const workspaceDirs = ['apps', 'packages', 'internals'];

function toDistExport(srcPath: string): {
	types: string;
	import: string;
	require: string;
} {
	const stripped = srcPath.replace(/^\.\/src\//, '').replace(/\.ts$/, '');
	return {
		types: `./dist/${stripped}.d.ts`,
		import: `./dist/${stripped}.js`,
		require: `./dist/${stripped}.cjs`,
	};
}

function patchExports(exports: Record<string, unknown>): {
	patched: Record<string, unknown>;
	changed: boolean;
} {
	const patched: Record<string, unknown> = {};
	let changed = false;

	for (const key of Object.keys(exports)) {
		const value = exports[key];
		if (
			typeof value === 'string' &&
			value.startsWith('./src/') &&
			value.endsWith('.ts')
		) {
			patched[key] = toDistExport(value);
			changed = true;
		} else {
			patched[key] = value;
		}
	}

	return { patched, changed };
}

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

for (const dir of workspaceDirs) {
	const dirPath = `${root}/${dir}`;
	if (!existsSync(dirPath)) continue;

	for await (const match of glob.scan(dirPath)) {
		const pkgPath = `${dirPath}/${match}`;
		const pkg = await Bun.file(pkgPath).json();

		if (pkg.publishConfig?.access !== 'public') continue;
		if (!pkg.exports || typeof pkg.exports !== 'object') continue;

		const result = patchExports(pkg.exports as Record<string, unknown>);
		if (!result.changed) continue;

		pkg.exports = result.patched;
		await Bun.write(pkgPath, `${JSON.stringify(pkg, null, '\t')}\n`);
		console.log(`Patched: ${pkg.name} (${pkgPath})`);
	}
}
