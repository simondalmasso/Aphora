import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL = 'https://sos-sf.simondalmasso44.workers.dev';
const EVIDENCE = process.env.EVIDENCE_DIR || 'artifacts/order-020b-terminal';
const checks = [];
async function request(path, options = {}) {
  const response = await fetch(`${URL}${path}${path.includes('?') ? '&' : '?'}security=${Date.now()}`, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(30_000), ...options });
  const text = await response.text();
  let body = text; try { body = JSON.parse(text); } catch {}
  return { status: response.status, headers: Object.fromEntries(response.headers), body };
}
const root = await request('/');
const snapshot = await request('/api/snapshot');
const privateMessages = await request('/api/private/messages');
const session = await request('/api/session');
const sw = await request('/service-worker.js');

function expect(name, condition, evidence) {
  checks.push({ name, pass: Boolean(condition), evidence });
  if (!condition) throw new Error(`SECURITY_GATE_FAILED:${name}`);
}
expect('HTTPS_HSTS', /max-age=/i.test(root.headers['strict-transport-security'] || ''), root.headers['strict-transport-security']);
expect('CSP_PRESENT', Boolean(root.headers['content-security-policy']), root.headers['content-security-policy']);
expect('NOSNIFF', (root.headers['x-content-type-options'] || '').toLowerCase() === 'nosniff', root.headers['x-content-type-options']);
expect('REFERRER_POLICY', Boolean(root.headers['referrer-policy']), root.headers['referrer-policy']);
expect('PUBLIC_SNAPSHOT_NO_STORE', /no-store/i.test(snapshot.headers['cache-control'] || ''), snapshot.headers['cache-control']);
expect('PRIVATE_MESSAGES_AUTH_REQUIRED', [401,403,503].includes(privateMessages.status), privateMessages.status);
expect('SESSION_NO_STORE', /no-store/i.test(session.headers['cache-control'] || ''), session.headers['cache-control']);
expect('NO_WILDCARD_CREDENTIAL_CORS', !(root.headers['access-control-allow-origin'] === '*' && root.headers['access-control-allow-credentials'] === 'true'), { origin: root.headers['access-control-allow-origin'], credentials: root.headers['access-control-allow-credentials'] });
expect('SERVICE_WORKER_PUBLIC_API_ALLOWLIST', typeof sw.body === 'string' && sw.body.includes('PUBLIC_API_ALLOWLIST'), sw.status);
await mkdir(EVIDENCE, { recursive: true });
await writeFile(join(EVIDENCE, 'security-headers-endpoints.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(), checks, rootStatus: root.status, snapshotStatus: snapshot.status, privateMessagesStatus: privateMessages.status, sessionStatus: session.status }, null, 2)}\n`);
