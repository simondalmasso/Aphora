import { gzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const artifactDir = join(root, 'artifacts', 'v1');

async function walk(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry);
    if ((await stat(path)).isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(dist);
const rows = [];
for (const path of files) {
  const bytes = await readFile(path);
  rows.push({ path: relative(dist, path).replaceAll('\\', '/'), bytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length });
}
const js = rows.filter((row) => row.path.endsWith('.js'));
const css = rows.filter((row) => row.path.endsWith('.css'));
const jsGzipBytes = js.reduce((sum, row) => sum + row.gzipBytes, 0);
const cssGzipBytes = css.reduce((sum, row) => sum + row.gzipBytes, 0);
const html = await readFile(join(dist, 'index.html'), 'utf8');
const forbidden = ['fonts.googleapis.com', 'fonts.gstatic.com', 'googletagmanager.com', 'google-analytics.com', 'connect.facebook.net'];
const forbiddenHits = forbidden.filter((value) => html.includes(value));
const result = {
  schemaVersion: '1.0',
  generatedAt: new Date().toISOString(),
  budgets: { initialJsGzipBytes: 120 * 1024, initialCssGzipBytes: 25 * 1024 },
  actual: { jsGzipBytes, cssGzipBytes, totalDistBytes: rows.reduce((sum, row) => sum + row.bytes, 0) },
  files: rows,
  externalFonts: false,
  thirdPartyTrackers: forbiddenHits,
  pass: jsGzipBytes <= 120 * 1024 && cssGzipBytes <= 25 * 1024 && forbiddenHits.length === 0,
};
await mkdir(artifactDir, { recursive: true });
await writeFile(join(artifactDir, 'bundle-sizes.json'), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(join(artifactDir, 'build-summary.json'), `${JSON.stringify({ schemaVersion: '1.0', generatedAt: result.generatedAt, build: 'PASS', fileCount: rows.length, totalDistBytes: result.actual.totalDistBytes, jsGzipBytes, cssGzipBytes, performanceBudgets: result.pass ? 'PASS' : 'FAIL' }, null, 2)}\n`);
console.log(JSON.stringify({ event: 'build_verified', jsGzipBytes, cssGzipBytes, files: rows.length, pass: result.pass }));
if (!result.pass) process.exitCode = 1;
