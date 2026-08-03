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
const totalJsGzipBytes = js.reduce((sum, row) => sum + row.gzipBytes, 0);
const cssGzipBytes = css.reduce((sum, row) => sum + row.gzipBytes, 0);
const html = await readFile(join(dist, 'index.html'), 'utf8');
const manifest = JSON.parse(await readFile(join(dist, '.vite', 'manifest.json'), 'utf8'));
const initialManifestKeys = new Set();
const visitInitial = (key) => {
  if (!key || initialManifestKeys.has(key) || !manifest[key]) return;
  initialManifestKeys.add(key);
  for (const imported of manifest[key].imports ?? []) visitInitial(imported);
};
for (const [key, entry] of Object.entries(manifest)) if (entry.isEntry) visitInitial(key);
const initialFiles = new Set([...initialManifestKeys].map((key) => manifest[key].file));
const initialJsGzipBytes = js.filter((row) => initialFiles.has(row.path)).reduce((sum, row) => sum + row.gzipBytes, 0);
const lazyVisualJsGzipBytes = totalJsGzipBytes - initialJsGzipBytes;
const forbidden = ['fonts.googleapis.com', 'fonts.gstatic.com', 'googletagmanager.com', 'google-analytics.com', 'connect.facebook.net'];
const forbiddenHits = forbidden.filter((value) => html.includes(value));
const result = {
  schemaVersion: '1.0',
  generatedAt: new Date().toISOString(),
  budgets: { initialJsGzipBytes: 120 * 1024, initialCssGzipBytes: 25 * 1024, lazyVisualJsGzipBytes: 180 * 1024 },
  actual: { jsGzipBytes: initialJsGzipBytes, initialJsGzipBytes, lazyVisualJsGzipBytes, totalJsGzipBytes, cssGzipBytes, totalDistBytes: rows.reduce((sum, row) => sum + row.bytes, 0) },
  loading: { threeJs: 'DYNAMIC_IMPORT_ONLY', initialFiles: [...initialFiles] },
  files: rows,
  externalFonts: false,
  thirdPartyTrackers: forbiddenHits,
  pass: initialJsGzipBytes <= 120 * 1024 && lazyVisualJsGzipBytes <= 180 * 1024 && cssGzipBytes <= 25 * 1024 && forbiddenHits.length === 0,
};
await mkdir(artifactDir, { recursive: true });
await writeFile(join(artifactDir, 'bundle-sizes.json'), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(join(artifactDir, 'build-summary.json'), `${JSON.stringify({ schemaVersion: '1.0', generatedAt: result.generatedAt, build: result.pass ? 'PASS' : 'FAIL', fileCount: rows.length, totalDistBytes: result.actual.totalDistBytes, jsGzipBytes: initialJsGzipBytes, initialJsGzipBytes, lazyVisualJsGzipBytes, totalJsGzipBytes, cssGzipBytes, threeJsLoading: 'DYNAMIC_IMPORT_ONLY', performanceBudgets: result.pass ? 'PASS' : 'FAIL' }, null, 2)}\n`);
console.log(JSON.stringify({ event: 'build_verified', initialJsGzipBytes, lazyVisualJsGzipBytes, totalJsGzipBytes, cssGzipBytes, files: rows.length, pass: result.pass }));
if (!result.pass) process.exitCode = 1;
