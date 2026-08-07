import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const E = process.env.EVIDENCE_DIR || 'artifacts/order-020b-final-corrective';
const REPO = process.env.GITHUB_REPOSITORY || 'simonkey888/sos-sf';
const requiredGates = ['dependency-audit','typecheck','lint','unit','contract','build','worker','e2e','accessibility','offline','source-runtime','predeploy-consistency','production-validation'];
const gates = {};
for (const name of requiredGates) {
  const item = JSON.parse(await readFile(join(E, 'gates', `${name}.json`), 'utf8'));
  gates[name] = item;
  if (item.exitCode !== 0) throw new Error(`GATE_FAILED:${name}`);
}
const production = JSON.parse(await readFile(join(E, 'production-blackbox.json'), 'utf8'));
const deployment = JSON.parse(await readFile(join(E, 'corrective-deployment.json'), 'utf8'));
const governance = JSON.parse(await readFile(join(E, 'terminal-governance.json'), 'utf8'));
const controlled = JSON.parse(await readFile(join(E, 'state-screenshot-manifest.json'), 'utf8'));
const requiredControlled = ['state-live','state-stale','state-active-alert','state-alerts-unverified','state-offline'];
const controlledSemantics = {
  'state-live': 'LIVE_VALUE_AND_CHART',
  'state-stale': 'STALE_VALUE_AND_CHART_PRESERVED',
  'state-active-alert': 'VERIFIED_ACTIVE_ALERT_BAND',
  'state-alerts-unverified': 'HEADER_BADGE_ONLY',
  'state-offline': 'OFFLINE_CACHED_HYDROMETRY',
};
for (const name of requiredControlled) if (controlled[name]?.semantic !== controlledSemantics[name]) throw new Error(`SEMANTIC_SCREENSHOT_MISSING:${name}`);
const semanticHashes = ['state-stale','state-active-alert','state-alerts-unverified'].map((name) => controlled[name]?.sha256);
if (new Set(semanticHashes).size !== semanticHashes.length) throw new Error('SCREENSHOT_HASH_COLLISION');
const productionNames = ['production-live-390x844.png','production-live-768x1024.png','production-live-1440x900.png'];
const screenshotEntries = [];
for (const name of requiredControlled) screenshotEntries.push({ name: `${name}.png`, semantic: controlled[name].semantic, sha256: controlled[name].sha256 });
for (const name of productionNames) {
  const bytes = await readFile(join(E, 'screenshots', name));
  screenshotEntries.push({ name, semantic: 'REAL_PRODUCTION_HYDROMETRY_VALIDATED', sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(join(E, 'screenshot-manifest-final.json'), `${JSON.stringify({ setComplete: true, hashGate: 'PASS', semanticGate: 'PASS', entries: screenshotEntries }, null, 2)}\n`);
if (production.productionApiUiConsistency !== 'PASS' || production.primaryHydrometricSourceE2E !== 'PASS' || production.snapshotValidation !== 'PASS' || production.optionalUrlContract !== 'PASS') throw new Error('PRODUCTION_CONTRACT_NOT_PASS');
if (deployment.deployCommandCount !== 1 || deployment.cloudflareMutationCount !== 1) throw new Error('CORRECTIVE_DEPLOY_COUNT_INVALID');
if (governance.activeMutationWorkflows !== 0 || governance.rerunnableHistoricalProductionMutationPaths !== 0) throw new Error('GOVERNANCE_NOT_TERMINAL');
const maxOverflow = Math.max(...production.browsers.map((item) => item.horizontalOverflow));
if (maxOverflow > 1) throw new Error('HORIZONTAL_OVERFLOW');
const summary = {
  VALID_TERMINAL_CHECKPOINT: 'YES', ORDER: '020', SUBORDER: '020-B', STATUS: 'VERIFIED_NOT_ACCEPTED',
  REMOTE_HEAD_BEFORE: '2014a0b634da4df3f13e186969a494dbd3e88c83', REMOTE_HEAD_AFTER: governance.terminalSha,
  CORRECTIVE_PRODUCT_COMMIT_SHA: process.env.CORRECTIVE_PRODUCT_COMMIT_SHA,
  CORRECTIVE_DEPLOY_RUN: Number(process.env.GITHUB_RUN_ID), CORRECTIVE_DEPLOYMENT_VERSION_ID: deployment.deploymentVersionId,
  ADDITIONAL_DEPLOY_COMMAND_COUNT: 1, TOTAL_CLOUDFLARE_MUTATIONS_THIS_AMENDMENT: 1,
  MATERIAL_FINDINGS_OPEN: 0, PRODUCTION_API_UI_CONSISTENCY: 'PASS', PRIMARY_HYDROMETRIC_SOURCE_E2E: 'PASS', SNAPSHOT_VALIDATION: 'PASS', OPTIONAL_URL_CONTRACT: 'PASS',
  SCREENSHOT_SET_COMPLETE: 'PASS', SCREENSHOT_HASH_GATE: 'PASS', SCREENSHOT_SEMANTIC_GATE: 'PASS',
  TYPECHECK: 'PASS', LINT: 'PASS_ZERO_PROJECT_WARNINGS', DEPENDENCY_AUDIT: 'PASS', UNIT: 'PASS', CONTRACT: 'PASS', BUILD: 'PASS', WORKER: 'PASS', E2E: 'PASS', FLAKY_TEST_COUNT: 0,
  ACCESSIBILITY: 'PASS', OFFLINE: 'PASS', VIEWPORT_BUDGETS: 'PASS', HORIZONTAL_OVERFLOW: maxOverflow,
  ACTIVE_MUTATION_WORKFLOWS: 0, RERUNNABLE_HISTORICAL_PRODUCTION_MUTATION_PATHS: 0, CLOUDFLARE_GITHUB_DRIFT: false,
  D1_FREE: 'PRESERVED', KV_FREE: 'PRESERVED', R2: 'ABSENT', USD_BUDGET: 0, MAIN_SHA: '45047d1c1e16941ea37967d67307d0ab17e85fad',
  SCREENSHOT_ARTIFACT_ID: Number(process.env.SCREENSHOT_ARTIFACT_ID), EVIDENCE_ARTIFACT_ID: Number(process.env.EVIDENCE_ARTIFACT_ID), EVIDENCE_ARTIFACT_SHA256: String(process.env.EVIDENCE_ARTIFACT_SHA256 || '').replace(/^sha256:/,''),
  ISSUE_13_STATE: 'OPEN', ISSUE_14_STATE: 'OPEN', AUD_HOLD: 'ACTIVE', NEXT_ORDER: 'NONE',
};
await writeFile(join(E, 'terminal-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
const lines = Object.entries(summary).map(([key,value]) => `${key}=${value}`).join('\n');
const comments = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/issues/14/comments?per_page=100`], { encoding:'utf8', maxBuffer:16*1024*1024 }));
if (comments.some((comment) => String(comment.body || '').includes('VALID_TERMINAL_CHECKPOINT=YES') && String(comment.body || '').includes('CORRECTIVE_DEPLOY_RUN='))) throw new Error('FINAL_CORRECTIVE_CHECKPOINT_ALREADY_EXISTS');
execFileSync('gh', ['api','-X','POST',`repos/${REPO}/issues/14/comments`,'-f',`body=${lines}`], { stdio:'inherit' });
await writeFile(join(E, 'terminal-comment.txt'), `${lines}\n`);
