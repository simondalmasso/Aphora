import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const mode = process.argv[2];
const ORDER = 'SOS-SF-AUD-FULL-CODEBASE-REVIEW-AND-END-TO-END-CLOSE-020';
const REPO = process.env.GITHUB_REPOSITORY || 'simonkey888/sos-sf';
const BRANCH = 'arq/visual-dashboard-v3';
const MAIN_SHA = '45047d1c1e16941ea37967d67307d0ab17e85fad';
const TAKE_SHA = '234bc1ce853c7c1acad93fc6c0bc1202f8cd11c8';
const URL = (process.env.DEPLOYMENT_URL || 'https://sos-sf.simondalmasso44.workers.dev').replace(/\/$/, '');
const EVIDENCE = process.env.EVIDENCE_DIR || 'artifacts/order-020-final';
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();

function run(command, args = [], options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: options.stdio || ['ignore', 'pipe', 'pipe'], ...options }).trim();
}
function git(...args) { return run('git', args); }
function gh(...args) { return run('gh', args); }
function out(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  execFileSync('bash', ['-lc', `printf '%s=%s\\n' "$1" "$2" >> "$GITHUB_OUTPUT"`, 'bash', name, String(value)], { stdio: 'inherit' });
}
async function jsonWrite(name, value) {
  await mkdir(EVIDENCE, { recursive: true });
  await writeFile(join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

async function productDigest() {
  const excludedPrefixes = ['.github/', 'artifacts/', 'dist/'];
  const excludedExact = new Set(['public/source-provenance.json']);
  const paths = git('ls-files', '-z').split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  let count = 0;
  for (const path of paths) {
    if (excludedExact.has(path) || excludedPrefixes.some((prefix) => path.startsWith(prefix))) continue;
    const bytes = await readFile(path);
    hash.update(path); hash.update('\0');
    const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(bytes.length)); hash.update(length);
    hash.update(bytes); count += 1;
  }
  return { productTreeSha256: hash.digest('hex'), includedFileCount: count, trackedFileCount: paths.length };
}

async function cf(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(40_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(`CLOUDFLARE_GET_FAILED:${path}:${response.status}:${JSON.stringify(payload.errors || [])}`);
  }
  return payload.result;
}
function arrayResult(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.result)) return value.result;
  return [];
}
async function cloudflareSnapshot() {
  const base = `/accounts/${encodeURIComponent(accountId)}`;
  const [d1Raw, kvRaw, settings, versionsRaw, secretsRaw] = await Promise.all([
    cf(`${base}/d1/database?per_page=100`),
    cf(`${base}/storage/kv/namespaces?per_page=100`),
    cf(`${base}/workers/scripts/sos-sf/settings`),
    cf(`${base}/workers/scripts/sos-sf/versions?per_page=20`),
    cf(`${base}/workers/scripts/sos-sf/secrets`),
  ]);
  const d1 = arrayResult(d1Raw);
  const kv = arrayResult(kvRaw);
  const versions = arrayResult(versionsRaw);
  const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
  const secrets = arrayResult(secretsRaw).map((item) => String(item?.name || '')).filter(Boolean).sort();
  const database = d1.find((item) => item?.name === 'sos-sf-private');
  const namespace = kv.find((item) => item?.title === 'sos-sf-private-reports');
  if (!database?.uuid) throw new Error('D1_FREE_RESOURCE_MISSING');
  if (!namespace?.id) throw new Error('KV_FREE_RESOURCE_MISSING');
  if (bindings.some((item) => /r2/i.test(String(item?.type || '')) || /R2/i.test(String(item?.name || '')))) {
    throw new Error('R2_BINDING_PRESENT');
  }
  return {
    d1DatabaseId: database.uuid,
    kvNamespaceId: namespace.id,
    bindings,
    secretNames: secrets,
