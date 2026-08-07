import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const E = process.env.EVIDENCE_DIR || 'artifacts/order-020b-final-truth';
const gateNames = ['dependency-audit','typecheck','lint','unit','contract','build','worker','e2e','accessibility','offline','source-runtime','predeploy-consistency','production-validation'];
for (const name of gateNames) {
  const gate = JSON.parse(await readFile(join(E, 'gates', `${name}.json`), 'utf8'));
  if (gate.exitCode !== 0) throw new Error(`GATE_NOT_PASS:${name}`);
}
const production = JSON.parse(await readFile(join(E, 'production-blackbox.json'), 'utf8'));
if (production.productionApiUiConsistency !== 'PASS' || production.primaryHydrometricSourceE2E !== 'PASS' || production.snapshotValidation !== 'PASS' || production.optionalUrlContract !== 'PASS') throw new Error('PRODUCTION_TRUTH_NOT_PASS');
const controlled = JSON.parse(await readFile(join(E, 'state-screenshot-manifest.json'), 'utf8'));
const required = {
  'state-live': 'LIVE_VALUE_AND_CHART',
  'state-stale': 'STALE_VALUE_AND_CHART_PRESERVED',
  'state-active-alert': 'VERIFIED_ACTIVE_ALERT_BAND',
  'state-alerts-unverified': 'HEADER_BADGE_ONLY',
  'state-offline': 'OFFLINE_CACHED_HYDROMETRY',
};
for (const [name, semantic] of Object.entries(required)) if (controlled[name]?.semantic !== semantic) throw new Error(`CONTROLLED_SEMANTIC_MISSING:${name}`);
const collisionSet = ['state-stale','state-active-alert','state-alerts-unverified'].map((name) => controlled[name].sha256);
if (new Set(collisionSet).size !== collisionSet.length) throw new Error('CONTROLLED_SCREENSHOT_HASH_COLLISION');
const entries = Object.entries(required).map(([name, semantic]) => ({ name: `${name}.png`, semantic, sha256: controlled[name].sha256, kind: 'CONTROLLED_TEST_STATE' }));
for (const name of ['production-live-390x844.png','production-live-768x1024.png','production-live-1440x900.png']) {
  const bytes = await readFile(join(E, 'screenshots', name));
  entries.push({ name, semantic: 'REAL_PRODUCTION_HYDROMETRY_VALIDATED', sha256: createHash('sha256').update(bytes).digest('hex'), kind: 'REAL_PRODUCTION' });
}
await writeFile(join(E, 'screenshot-manifest-final.json'), `${JSON.stringify({ setComplete: true, hashGate: 'PASS', semanticGate: 'PASS', entries }, null, 2)}\n`);
await writeFile(join(E, 'final-truth-precleanup.json'), `${JSON.stringify({
  status: 'READY_FOR_TERMINAL_DISARM',
  productionApiUiConsistency: 'PASS',
  primaryHydrometricSourceE2E: 'PASS',
  snapshotValidation: 'PASS',
  optionalUrlContract: 'PASS',
  screenshotSetComplete: 'PASS',
  screenshotHashGate: 'PASS',
  screenshotSemanticGate: 'PASS',
  correctedOverstrictVerifier: 'DEGRADED_CLASS_PRESENCE_NOT_REQUIRED',
  supersededBlockerCommentId: 5213426119,
}, null, 2)}\n`);
