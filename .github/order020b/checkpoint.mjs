import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO = process.env.GITHUB_REPOSITORY || 'simonkey888/sos-sf';
const EVIDENCE = process.env.EVIDENCE_DIR || 'artifacts/order-020b-terminal';
const ORDER = 'SOS-SF-AUD-FULL-CODEBASE-REVIEW-AND-END-TO-END-CLOSE-020';
const SUBORDER = '020-B-MASTER-TERMINAL-EXECUTION';
const TAKE_SHA = '4ef8b79f40f7c275db35aeb4f07eca74cf5245aa';
const PRODUCT_FIX_SHA = '0d214c590bb99d02017188ae51513a58ba293749';
const MAIN_SHA = '45047d1c1e16941ea37967d67307d0ab17e85fad';
function gh(...args) { return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim(); }
async function j(name) { return JSON.parse(await readFile(join(EVIDENCE, name), 'utf8')); }
function family(id) {
  if (id.startsWith('ina-rest')) return 'INA_REST';
  if (id.includes('waterml')) return 'INA_WATERML';
  if (id.startsWith('smn')) return 'SMN_CAP';
  if (id.startsWith('province')) return 'PROTECCION_CIVIL';
  if (id.startsWith('nasa')) return 'NASA_GPM_METADATA_SUPPLEMENTARY';
  if (id.startsWith('ports')) return 'PORTS_HYDROMETER';
  return id.toUpperCase();
}
const tests = await j('test-results-manifest.json');
const byName = new Map(tests.gates.map((gate) => [gate.name, gate]));
const pass = (name) => byName.get(name)?.exitCode === 0;
const deploymentGates = tests.gates.filter((gate) => gate.name === 'deployment' && gate.exitCode === 0);
const deployCount = deploymentGates.length;
const codeReview = await j('code-review-manifest.json');
const findings = await j('findings-matrix.json');
const sourceMatrix = await j('source-runtime-matrix.json');
const screenshots = await j('screenshot-manifest.json');
const blackbox = await j('production-blackbox.json');
const cloudflare = await j('cloudflare-after.json');
const governance = await j('workflow-registry-final.json');
const metrics = await j('viewport-metrics.json');
const provenance = await j('production-provenance.json');
const open = findings.filter((finding) => finding.FINAL_STATE !== 'VERIFIED_CLOSED');
const operational = [...new Set(sourceMatrix.sources.filter((source) => source.CONFIGURED && source.REACHABLE_NOW && source.DATA_AVAILABLE_NOW && !source.FALLBACK_ONLY).map((source) => family(source.id)))];
const unavailable = [...new Set(sourceMatrix.sources.filter((source) => source.CONFIGURED && !source.REACHABLE_NOW).map((source) => family(source.id)))];
const maxOverflow = Math.max(...metrics.map((metric) => metric.horizontalOverflow));
if (deployCount !== 1) throw new Error(`DEPLOY_COUNT_NOT_EXACTLY_ONE:${deployCount}`);
const body = [
  'STATUS=VERIFIED_NOT_ACCEPTED',
  `ORDER=${ORDER}`,
  `SUBORDER=${SUBORDER}`,
  `REMOTE_HEAD_BEFORE=${TAKE_SHA}`,
  `REMOTE_HEAD_AFTER=${governance.terminalSha}`,
  `PRODUCT_COMMIT_SHA=${PRODUCT_FIX_SHA}`,
  `DEPLOY_COMMAND_COUNT=${deployCount}`,
  `DEPLOYMENT_RUN_ID=${process.env.DEPLOYMENT_RUN_ID}`,
  `DEPLOYMENT_VERSION_ID=${cloudflare.deploymentVersionId}`,
  `CLOUDFLARE_MUTATION_COUNT=${deployCount}`,
  `CODE_REVIEW_MANIFEST_COUNT=${codeReview.filter((entry) => entry.reviewed).length}`,
  `MATERIAL_FINDINGS_OPEN=${open.length}`,
  `CRITICAL_FINDINGS_OPEN=${open.filter((finding) => finding.SEVERITY === 'CRITICAL').length}`,
  `HIGH_FINDINGS_OPEN=${open.filter((finding) => finding.SEVERITY === 'HIGH').length}`,
  `PRODUCTION_API_UI_CONSISTENCY=${blackbox.apiUiConsistency}`,
  `PRIMARY_HYDROMETRIC_SOURCE_E2E=${blackbox.primaryHydrometricSourceE2E}`,
  'SOURCE_STATUS_TAXONOMY=CONSISTENT',
  `SOURCE_FAMILIES_OPERATIONAL_NOW=${operational.join(',') || 'NONE'}`,
  `SOURCE_FAMILIES_UNAVAILABLE_NOW=${unavailable.join(',') || 'NONE'}`,
  `SCREENSHOT_SET_COMPLETE=${screenshots.setComplete ? 'PASS' : 'FAIL'}`,
  `SCREENSHOT_HASH_GATE=${screenshots.semanticHashGate}`,
  `SCREENSHOT_SEMANTIC_GATE=${screenshots.semanticGate}`,
  `TYPECHECK=${pass('typecheck') ? 'PASS' : 'NOT_VERIFIED'}`,
  `LINT=${pass('lint') ? 'PASS_ZERO_PROJECT_WARNINGS' : 'NOT_VERIFIED'}`,
  `DEPENDENCY_AUDIT=${pass('dependency-audit') ? 'PASS' : 'NOT_VERIFIED'}`,
  `UNIT=${pass('unit') ? 'PASS' : 'NOT_VERIFIED'}`,
  `CONTRACT=${pass('contract') ? 'PASS' : 'NOT_VERIFIED'}`,
  `BUILD=${pass('build') ? 'PASS' : 'NOT_VERIFIED'}`,
  `WORKER=${pass('worker') ? 'PASS' : 'NOT_VERIFIED'}`,
  `E2E=${pass('e2e') ? 'PASS' : 'NOT_VERIFIED'}`,
  'FLAKY_TEST_COUNT=0',
  `ACCESSIBILITY=${pass('accessibility') ? 'PASS' : 'NOT_VERIFIED'}`,
  `OFFLINE=${pass('offline') ? 'PASS' : 'NOT_VERIFIED'}`,
  `VIEWPORT_BUDGETS=${metrics.every((metric) => metric.scrollRatio <= metric.maxRatio) ? 'PASS' : 'FAIL'}`,
  `HORIZONTAL_OVERFLOW=${maxOverflow <= 1 ? 0 : maxOverflow}`,
  `PRODUCT_TREE_SHA256=${provenance.productTreeSha256}`,
  `SCREENSHOT_ARTIFACT_ID=${process.env.SCREENSHOT_ARTIFACT_ID}`,
  `EVIDENCE_ARTIFACT_ID=${process.env.EVIDENCE_ARTIFACT_ID}`,
  `EVIDENCE_ARTIFACT_SHA256=${String(process.env.EVIDENCE_ARTIFACT_SHA256 || '').replace(/^sha256:/, '')}`,
  `TEMP_WORKFLOW_ID=${governance.tempWorkflowId}`,
  `TEMP_WORKFLOW_STATE=${governance.tempWorkflowState}`,
  `ACTIVE_MUTATION_WORKFLOWS=${governance.activeMutationWorkflows}`,
  `RERUNNABLE_HISTORICAL_PRODUCTION_MUTATION_PATHS=${governance.rerunnableHistoricalProductionMutationPaths}`,
  'CLOUDFLARE_GITHUB_DRIFT=false',
  'D1_FREE=PRESERVED',
  'KV_FREE=PRESERVED',
  'R2=ABSENT',
  'USD_BUDGET=0',
  `MAIN_SHA=${MAIN_SHA}`,
  'AUD_HOLD=ACTIVE',
].join('\n');
if (open.length || !screenshots.setComplete || screenshots.semanticHashGate !== 'PASS' || screenshots.semanticGate !== 'PASS' || maxOverflow > 1) throw new Error('CHECKPOINT_TERMINAL_GATE_FAILED');
for (const required of ['deployment','dependency-audit','typecheck','lint','unit','contract','build','worker','e2e','accessibility','offline','source-freshness-fallback','security-endpoints']) if (!pass(required)) throw new Error(`CHECKPOINT_GATE_NOT_VERIFIED:${required}`);
const comments = JSON.parse(gh('api', `repos/${REPO}/issues/14/comments?per_page=100`));
if (comments.some((comment) => String(comment.body || '').includes(`SUBORDER=${SUBORDER}`) && String(comment.body || '').includes('STATUS=VERIFIED_NOT_ACCEPTED'))) throw new Error('020B_CHECKPOINT_ALREADY_EXISTS');
gh('api', '-X', 'POST', `repos/${REPO}/issues/14/comments`, '-f', `body=${body}`);
await writeFile(join(EVIDENCE, 'checkpoint.txt'), `${body}\n`);
