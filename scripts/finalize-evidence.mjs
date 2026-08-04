import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

const evidenceDir = resolve(process.env.EVIDENCE_DIR ?? 'artifacts/current-run');
const repoRoot = resolve(process.cwd());
if (!evidenceDir.startsWith(`${repoRoot}/artifacts/`)) throw new Error('EVIDENCE_DIR_OUTSIDE_ARTIFACTS');
await mkdir(evidenceDir, { recursive: true });

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.name !== 'evidence-manifest.json') files.push(path);
  }
  return files;
}

const files = (await walk(evidenceDir)).sort();
const rows = [];
for (const path of files) {
  const bytes = await readFile(path);
  const info = await stat(path);
  rows.push({
    path: relative(evidenceDir, path).replaceAll('\\', '/'),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

const forbidden = rows.filter((row) => /(^|\/)(v1|pulso)(-|_|\.|\/)|(^|\/)old[-_]/i.test(row.path));
if (forbidden.length) throw new Error(`STALE_EVIDENCE_PATHS:${forbidden.map((row) => row.path).join(',')}`);

const screenshots = rows.filter((row) => row.path.startsWith('screenshots/'));
const expectedScreenshots = [360, 390, 768, 1024, 1440].map((width) => `screenshots/dashboard-live-${width}.png`);
for (const expected of expectedScreenshots) {
  if (!screenshots.some((row) => row.path === expected)) throw new Error(`SCREENSHOT_MISSING:${expected}`);
}
if (screenshots.some((row) => !expectedScreenshots.includes(row.path))) {
  throw new Error(`UNEXPECTED_SCREENSHOT:${screenshots.filter((row) => !expectedScreenshots.includes(row.path)).map((row) => row.path).join(',')}`);
}

const proofPath = join(evidenceDir, 'deployment-proof.json');
if (files.includes(proofPath)) {
  const proof = JSON.parse(await readFile(proofPath, 'utf8'));
  if (proof.source_commit !== process.env.GITHUB_SHA) throw new Error('DEPLOYMENT_PROOF_SHA_MISMATCH');
}

const manifest = {
  schemaVersion: '1.0',
  decisionId: 'SOS-SF-AUD-V3-EVIDENCE-009',
  audHold: 'ACTIVE',
  runId: process.env.GITHUB_RUN_ID ?? null,
  sha: process.env.GITHUB_SHA ?? null,
  generatedAt: new Date().toISOString(),
  root: basename(evidenceDir),
  fileCount: rows.length,
  totalBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
  files: rows,
};
await writeFile(join(evidenceDir, 'evidence-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ event: 'evidence_finalized', fileCount: manifest.fileCount, totalBytes: manifest.totalBytes, sha: manifest.sha }));
