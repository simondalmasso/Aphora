import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO = process.env.GITHUB_REPOSITORY || 'simonkey888/sos-sf';
const EVIDENCE = process.env.EVIDENCE_DIR || 'artifacts/order-020b-terminal-blocked';
const summary = JSON.parse(await readFile(join(EVIDENCE, 'terminal-blocked-summary.json'), 'utf8'));
const findings = JSON.parse(await readFile(join(EVIDENCE, 'findings-matrix.json'), 'utf8'));
if (summary.STATUS !== 'BLOCKED_MATERIAL_AUTHORITY_LIMIT') throw new Error('BLOCKER_STATUS_NOT_DERIVED');
if (summary.DEPLOY_COMMAND_COUNT !== 1 || summary.CLOUDFLARE_MUTATION_COUNT !== 1) throw new Error('DEPLOY_COUNT_INVARIANT_FAILED');
if (summary.HIGH_FINDINGS_OPEN < 1 || summary.PRODUCTION_API_UI_CONSISTENCY !== 'FAIL' || summary.PRIMARY_HYDROMETRIC_SOURCE_E2E !== 'FAIL') throw new Error('MATERIAL_BLOCKER_NOT_PRESENT');
if (summary.ACTIVE_MUTATION_WORKFLOWS !== 0 || summary.RERUNNABLE_HISTORICAL_PRODUCTION_MUTATION_PATHS !== 0) throw new Error('GLOBAL_DISARM_NOT_COMPLETE');
const blockerFinding = findings.find((item) => item.FINDING_ID === '020B-002');
if (blockerFinding?.FINAL_STATE !== 'OPEN_BLOCKED_BY_EXPLICIT_DEPLOY_LIMIT') throw new Error('020B_002_NOT_PROVEN');
const artifactDigest = String(process.env.EVIDENCE_ARTIFACT_SHA256 || '').replace(/^sha256:/, '');
const lines = [
  `STATUS=${summary.STATUS}`,
  `ORDER=${summary.ORDER}`,
  `SUBORDER=${summary.SUBORDER}`,
  `REMOTE_HEAD_BEFORE=${summary.REMOTE_HEAD_BEFORE}`,
  `REMOTE_HEAD_AFTER=${summary.REMOTE_HEAD_AFTER}`,
  `PRODUCT_COMMIT_SHA=${summary.PRODUCT_COMMIT_SHA}`,
  `DEPLOY_COMMAND_COUNT=${summary.DEPLOY_COMMAND_COUNT}`,
  `DEPLOYMENT_RUN_ID=${summary.DEPLOYMENT_RUN_ID}`,
  `DEPLOYMENT_VERSION_ID=${summary.DEPLOYMENT_VERSION_ID}`,
  `CLOUDFLARE_MUTATION_COUNT=${summary.CLOUDFLARE_MUTATION_COUNT}`,
  `CODE_REVIEW_MANIFEST_COUNT=${summary.CODE_REVIEW_MANIFEST_COUNT}`,
  `CODE_REVIEW_MANIFEST_COMPLETE=${summary.CODE_REVIEW_MANIFEST_COMPLETE}`,
  `TEST_EVIDENCE_DERIVED_NOT_HARDCODED=${summary.TEST_EVIDENCE_DERIVED_NOT_HARDCODED}`,
  `MATERIAL_FINDINGS_OPEN=${summary.MATERIAL_FINDINGS_OPEN}`,
  `CRITICAL_FINDINGS_OPEN=${summary.CRITICAL_FINDINGS_OPEN}`,
  `HIGH_FINDINGS_OPEN=${summary.HIGH_FINDINGS_OPEN}`,
  `PRODUCTION_API_UI_CONSISTENCY=${summary.PRODUCTION_API_UI_CONSISTENCY}`,
  `PRIMARY_HYDROMETRIC_SOURCE_E2E=${summary.PRIMARY_HYDROMETRIC_SOURCE_E2E}`,
  `SOURCE_STATUS_TAXONOMY=${summary.SOURCE_STATUS_TAXONOMY}`,
  `SOURCE_PROVIDERS_OPERATIONAL_NOW=${summary.SOURCE_PROVIDERS_OPERATIONAL_NOW.join(',') || 'NONE'}`,
  `SOURCE_PROVIDERS_UNAVAILABLE_NOW=${summary.SOURCE_PROVIDERS_UNAVAILABLE_NOW.join(',') || 'NONE'}`,
  `SCREENSHOT_SET_COMPLETE=${summary.SCREENSHOT_SET_COMPLETE}`,
  `SCREENSHOT_HASH_GATE=${summary.SCREENSHOT_HASH_GATE}`,
  `SCREENSHOT_SEMANTIC_GATE=${summary.SCREENSHOT_SEMANTIC_GATE}`,
  `TYPECHECK=${summary.TYPECHECK}`,
  `LINT=${summary.LINT}`,
  `DEPENDENCY_AUDIT=${summary.DEPENDENCY_AUDIT}`,
  `UNIT=${summary.UNIT}`,
  `CONTRACT=${summary.CONTRACT}`,
  `BUILD=${summary.BUILD}`,
  `WORKER=${summary.WORKER}`,
  `E2E=${summary.E2E}`,
  `FLAKY_TEST_COUNT=${summary.FLAKY_TEST_COUNT}`,
  `ACCESSIBILITY=${summary.ACCESSIBILITY}`,
  `OFFLINE=${summary.OFFLINE}`,
  `VIEWPORT_BUDGETS=${summary.VIEWPORT_BUDGETS}`,
  `HORIZONTAL_OVERFLOW=${summary.HORIZONTAL_OVERFLOW}`,
  `SCREENSHOT_ARTIFACT_ID=${process.env.SCREENSHOT_ARTIFACT_ID}`,
  `EVIDENCE_ARTIFACT_ID=${process.env.EVIDENCE_ARTIFACT_ID}`,
  `EVIDENCE_ARTIFACT_SHA256=${artifactDigest}`,
  `TEMP_WORKFLOW_ID=${summary.TEMP_WORKFLOW_ID}`,
  `TEMP_WORKFLOW_STATE=${summary.TEMP_WORKFLOW_STATE}`,
  `ACTIVE_MUTATION_WORKFLOWS=${summary.ACTIVE_MUTATION_WORKFLOWS}`,
  `RERUNNABLE_HISTORICAL_PRODUCTION_MUTATION_PATHS=${summary.RERUNNABLE_HISTORICAL_PRODUCTION_MUTATION_PATHS}`,
  `CLOUDFLARE_GITHUB_DRIFT=${summary.CLOUDFLARE_GITHUB_DRIFT}`,
  `D1_FREE=${summary.D1_FREE}`,
  `KV_FREE=${summary.KV_FREE}`,
  `R2=${summary.R2}`,
  `USD_BUDGET=${summary.USD_BUDGET}`,
  `MAIN_SHA=${summary.MAIN_SHA}`,
  `BLOCKER=${summary.BLOCKER}`,
  'BLOCKER_ROOT_CAUSE=EMPTY_OPTIONAL_SOURCE_URL_BINDINGS_CAUSE_CLIENT_SNAPSHOT_VALIDATION_REJECTION',
  'REQUIRED_REMEDIATION=RUNTIME_SERVED_CORRECTION_AND_SECOND_CLOUDFLARE_DEPLOY',
  'SECOND_DEPLOY_PERFORMED=NO',
  `AUD_HOLD=${summary.AUD_HOLD}`,
  `NEXT_ORDER=${summary.NEXT_ORDER}`,
].join('\n');
const comments = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/issues/14/comments?per_page=100`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
if (comments.some((comment) => String(comment.body || '').includes('STATUS=BLOCKED_MATERIAL_AUTHORITY_LIMIT') && String(comment.body || '').includes('SUBORDER=020-B-MASTER-TERMINAL-EXECUTION'))) throw new Error('TERMINAL_BLOCKER_ALREADY_PUBLISHED');
execFileSync('gh', ['api','-X','POST',`repos/${REPO}/issues/14/comments`,'-f',`body=${lines}`], { stdio: 'inherit' });
await writeFile(join(EVIDENCE, 'terminal-comment.txt'), `${lines}\n`);
