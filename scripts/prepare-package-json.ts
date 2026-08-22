const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const pkgPath = `${root}/package.json`;
const pkg = await Bun.file(pkgPath).json();

// npm validates devEngines.runtime on *every* command, and it always reports
// itself as "node" — so `changeset publish` dies with EBADDEVENGINES when it
// shells out to `npm info <pkg>` from the repo root. Strip it before publish.
if (pkg.devEngines) {
	delete pkg.devEngines;
	await Bun.write(pkgPath, `${JSON.stringify(pkg, null, '\t')}\n`);
	console.log(`Stripped devEngines: ${pkg.name} (${pkgPath})`);
}
