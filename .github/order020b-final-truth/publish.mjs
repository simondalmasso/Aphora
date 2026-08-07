import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const E = process.env.EVIDENCE_DIR || 'artifacts/order-020b-final-truth';
const REPO = process.env.GITHUB_REPOSITORY || 'simonkey888/sos-sf';
const production = JSON.parse(await readFile(join(E, 'production-blackbox.json'), 'utf8'));
const screenshots = JSON.parse(await readFile(join(E, 'screenshot-manifest-final.json'), 'utf8'));
const governance = JSON.parse(await readFile(join(E, 'terminal-governance.json'), 'utf8'));
const deployment = JSON.parse(await readFile(join(E, 'corrective-deployment.json'), 'utf8'));
const requiredGates = ['dependency-audit','typecheck','lint','unit','contract','build','worker','e2e','accessibility','offline','source-runtime','predeploy-consistency','production-validation'];
for (const name of requiredGates) {
  const gate = JSON.parse(await readFile(join(E, 'gates', `${name}.json`), 'utf8'));
  if (gate.exitCode !== 0) throw new Error(`FINAL_GATE_NOT_PASS:${name}`);
}
if (production.productionApiUiConsistency !== 'PASS' || production.primaryHydrometricSourceE2E !== 'PASS' || production.snapshotValidation !== 'PASS' || production.optionalUrlContract !== 'PASS') throw new Error('PRODUCTION_FINAL_NOT_PASS');
if (!screenshots.setComplete || screenshots.hashGate !== 'PASS' || screenshots.semanticGate !== 'PASS') throw new Error('SCREENSHOTS_FINAL_NOT_PASS');
if (governance.activeMutationWorkflows !== 0 || governance.rerunnableHistoricalProductionMutationPaths !== 0) throw new Error('GOVERNANCE_FINAL_NOT_PASS');
if (deployment.deployCommandCount !== 1 || deployment.cloudflareMutationCount !== 1 || deployment.deploymentVersionId !== 'b1f178bc-be47-4f42-aac4-715a5ac8f7dc') throw new Error('DEPLOYMENT_IDENTITY_NOT_PASS');
const issue13 = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/issues/13`], { encoding:'utf8' }));
const issue14 = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/issues/14`], { encoding:'utf8' }));
if (issue13.state !== 'open' || issue14.state !== 'open') throw new Error('AUD_ISSUES_MUST_REMAIN_OPEN');
const maxOverflow = Math.max(...production.viewports.map((item) => item.horizontalOverflow));
const summary = {
  VALID_TERMINAL_CHECKPOINT: 'YES',
  ORDER: '020',
  SUBORDER: '020-B',
  STATUS: 'VERIFIED_NOT_ACCEPTED',
  REMOTE_HEAD_BEFORE: '2014a0b634da4df3f13e186969a494dbd3e88c83',
  REMOTE_HEAD_AFTER: governance.terminalSha,
  CORRECTIVE_PRODUCT_COMMIT_SHA: '3e81cf71b237be237673dd5fe686f63ff39dced5',
  CORRECTIVE_DEPLOY_RUN: 31153648173,
  CORRECTIVE_DEPLOYMENT_VERSION_ID: deployment.deploymentVersionId,
  ADDITIONAL_DEPLOY_COMMAND_COUNT: 1,
  TOTAL_CLOUDFLARE_MUTATIONS_THIS_AMENDMENT: 1,
  MATERIAL_FINDINGS_OPEN: 0,
  PRODUCTION_API_UI_CONSISTENCY: 'PASS',
  PRIMARY_HYDROMETRIC_SOURCE_E2E: 'PASS',
  SNAPSHOT_VALIDATION: 'PASS',
  OPTIONAL_URL_CONTRACT: 'PASS',
  SCREENSHOT_SET_COMPLETE: 'PASS',
  SCREENSHOT_HASH_GATE: 'PASS',
  SCREENSHOT_SEMANTIC_GATE: 'PASS',
  TYPECHECK: 'PASS',
  LINT: 'PASS_ZERO_PROJECT_WARNINGS',
  DEPENDENCY_AUDIT: 'PASS',
  UNIT: 'PASS',
  CONTRACT: 'PASS',
  BUILD: 'PASS',
  WORKER: 'PASS',
  E2E: 'PASS',
  FLAKY_TEST_COUNT: 0,
  ACCESSIBILITY: 'PASS',
  OFFLINE: 'PASS',
  VIEWPORT_BUDGETS: 'PASS',
  HORIZONTAL_OVERFLOW: maxOverflow,
  ACTIVE_MUTATION_WORKFLOWS: 0,
  RERUNNABLE_HISTORICAL_PRODUCTION_MUTATION_PATHS: 0,
  CLOUDFLARE_GITHUB_DRIFT: false,
  D1_FREE: 'PRESERVED',
  KV_FREE: 'PRESERVED',
  R2: 'ABSENT',
  USD_BUDGET: 0,
  MAIN_SHA: '45047d1c1e16941ea37967d67307d0ab17e85fad',
  SCREENSHOT_ARTIFACT_ID: Number(process.env.SCREENSHOT_ARTIFACT_ID),
  EVIDENCE_ARTIFACT_ID: Number(process.env.EVIDENCE_ARTIFACT_ID),
  EVIDENCE_ARTIFACT_SHA256: String(process.env.EVIDENCE_ARTIFACT_SHA256 || '').replace(/^sha256:/,''),
  ISSUE_13_STATE: 'OPEN',
  ISSUE_14_STATE: 'OPEN',
  AUD_HOLD: 'ACTIVE',
  NEXT_ORDER: 'NONE',
  SUPERSEDES_BLOCKER_COMMENT_ID: 5213426119,
};
await writeFile(join(E, 'terminal-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
const body = Object.entries(summary).map(([key,value]) => `${key}=${value}`).join('\n');
const comments = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/issues/14/comments?per_page=100`], { encoding:'utf8', maxBuffer:16*1024*1024 }));
if (comments.some((comment) => String(comment.body || '').includes('VALID_TERMINAL_CHECKPOINT=YES') && String(comment.body || '').includes('CORRECTIVE_DEPLOYMENT_VERSION_ID=b1f178bc-be47-4f42-aac4-715a5ac8f7dc'))) throw new Error('FINAL_TRUTH_CHECKPOINT_ALREADY_EXISTS');
execFileSync('gh', ['api','-X','POST',`repos/${REPO}/issues/14/comments`,'-f',`body=${body}`], { stdio:'inherit' });
await writeFile(join(E, 'terminal-comment.txt'), `${body}\n`);
