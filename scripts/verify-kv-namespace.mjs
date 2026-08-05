import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN ?? '').trim();
const namespaceId = String(process.env.KV_NAMESPACE_ID ?? '').trim();
const evidenceDir = process.env.EVIDENCE_DIR ?? 'artifacts/current-run';
if (!accountId || !token || !namespaceId) throw new Error('KV_PROBE_CONFIGURATION_REQUIRED');

const key = `__v3_014_probe/${String(process.env.GITHUB_RUN_ID ?? crypto.randomUUID())}`;
const bytes = new Uint8Array([0, 1, 2, 3, 127, 128, 254, 255]);
const metadata = { purpose: 'zero-cost-kv-binary-proof', reportId: 'probe', expiresAt: new Date(Date.now() + 60_000).toISOString() };
const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}`;
const auth = { Authorization: `Bearer ${token}` };

async function jsonRequest(path, init) {
  const response = await fetch(`${base}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const errors = Array.isArray(payload.errors) ? payload.errors.map((item) => ({ code: item?.code ?? null, message: String(item?.message ?? '').slice(0, 240) })) : [];
    const error = new Error(`KV_PROBE_API_FAILED:${response.status}`);
    error.status = response.status;
    error.details = errors;
    throw error;
  }
  return payload.result;
}

let deleteState = 'NOT_ATTEMPTED';
try {
  const written = await jsonRequest('/bulk', {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify([{
      key,
      value: Buffer.from(bytes).toString('base64'),
      base64: true,
      expiration_ttl: 60,
      metadata,
    }]),
  });
  if (written && Array.isArray(written.unsuccessful_keys) && written.unsuccessful_keys.length) throw new Error('KV_PROBE_BULK_WRITE_UNSUCCESSFUL');

  const valueResponse = await fetch(`${base}/values/${encodeURIComponent(key)}`, { headers: auth });
  if (!valueResponse.ok) throw new Error(`KV_PROBE_VALUE_READ_FAILED:${valueResponse.status}`);
  const received = new Uint8Array(await valueResponse.arrayBuffer());
  if (received.length !== bytes.length || !received.every((value, index) => value === bytes[index])) throw new Error('KV_PROBE_BINARY_MISMATCH');

  const receivedMetadata = await jsonRequest(`/metadata/${encodeURIComponent(key)}`, { headers: auth });
  const expectedMetadataEntries = Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right));
  const receivedMetadataEntries = Object.entries(receivedMetadata ?? {}).sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(receivedMetadataEntries) !== JSON.stringify(expectedMetadataEntries)) {
    throw new Error('KV_PROBE_METADATA_MISMATCH');
  }

  await jsonRequest(`/values/${encodeURIComponent(key)}`, { method: 'DELETE', headers: auth });
  deleteState = 'PASS';
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(join(evidenceDir, 'kv-binary-object-test.json'), `${JSON.stringify({
    schemaVersion: 1,
    binaryBytes: bytes.length,
    metadataRoundTrip: true,
    expirationTtlSeconds: 60,
    deleteState,
    result: 'PASS',
    valuesExposed: false,
  }, null, 2)}\n`);
} catch (error) {
  if (deleteState !== 'PASS') {
    try {
      await jsonRequest(`/values/${encodeURIComponent(key)}`, { method: 'DELETE', headers: auth });
      deleteState = 'BEST_EFFORT_PASS';
    } catch {
      deleteState = 'BEST_EFFORT_FAILED';
    }
  }
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(join(evidenceDir, 'kv-binary-object-test.json'), `${JSON.stringify({
    schemaVersion: 1,
    deleteState,
    result: 'FAIL_CLOSED',
    error: error instanceof Error ? error.message : String(error),
    status: error?.status ?? null,
    details: error?.details ?? [],
    valuesExposed: false,
  }, null, 2)}\n`);
  throw error;
}
