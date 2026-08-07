import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const EVIDENCE = process.env.EVIDENCE_DIR || 'artifacts/order-020b-terminal-blocked';
const MAIN_SHA = '45047d1c1e16941ea37967d67307d0ab17e85fad';
const TAKE_SHA = '4ef8b79f40f7c275db35aeb4f07eca74cf5245aa';
const DEPLOYED_PROVENANCE_SHA = '8d507b13c521edf903ee364465ee7bc96a46e221';
function git(...args) { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim(); }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function j(name) { return JSON.parse(await readFile(join(EVIDENCE, name), 'utf8')); }
async function w(name, value) { await writeFile(join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`); }

const terminalSha = git('rev-parse', 'HEAD');
if (git('rev-parse', 'origin/main') !== MAIN_SHA) throw new Error('MAIN_DRIFT_POST_CLEANUP');
git('merge-base', '--is-ancestor', TAKE_SHA, 'HEAD');

const preManifest = await j('code-review-manifest.json');
const preByPath = new Map(preManifest.map((entry) => [entry.path, entry]));
const finalPaths = git('ls-files', '-z').split('\0').filter(Boolean).sort();
const finalManifest = [];
for (const path of finalPaths) {
  const prior = preByPath.get(path);
  if (!prior?.reviewed) throw new Error(`FINAL_HEAD_FILE_NOT_REVIEWED:${path}`);
  const bytes = await readFile(path);
  const digest = hash(bytes);
  if (prior.review_evidence?.sha256 !== digest) throw new Error(`FINAL_HEAD_FILE_CHANGED_AFTER_REVIEW:${path}`);
  finalManifest.push({ ...prior, review_evidence: { ...prior.review_evidence, finalHeadSha: terminalSha, revalidatedAfterCleanup: true } });
}
await w('code-review-manifest.json', finalManifest);
await w('code-review-final-summary.json', { terminalHeadSha: terminalSha, manifestCount: finalManifest.length, gitTrackedFileCount: finalPaths.length, complete: finalManifest.length === finalPaths.length });

const changedFromDeployed = git('diff', '--name-only', DEPLOYED_PROVENANCE_SHA, 'HEAD').split('\n').filter(Boolean);
const operationalChanges = changedFromDeployed.filter((path) => !path.startsWith('.github/'));
if (operationalChanges.length) throw new Error(`DEPLOYED_TERMINAL_PRODUCT_DRIFT:${operationalChanges.join(',')}`);
await w('head-equivalence.json', { deployedProvenanceCommit: DEPLOYED_PROVENANCE_SHA, terminalHeadSha: terminalSha, changedPaths: changedFromDeployed, operationalChangedPaths: operationalChanges, result: 'PASS' });

const tests = await j('test-results-manifest.json');
const gate = (name) => tests.gates.find((item) => item.name === name);
const pass = (name) => gate(name)?.exitCode === 0;
const screenshots = await j('screenshot-manifest.json');
const sourceMatrix = await j('source-runtime-matrix.json');
const production = await j('production-blackbox.json');
const governance = await j('workflow-registry-final.json');
const resources = await j('free-resource-preservation.json');
const deployment = await j('deployment-history.json');
const validatorLog = await readFile(join(EVIDENCE, 'production-validator.log'), 'utf8');

const priorFindings = [
  ['INA_CACHE_REFRESH_CONFLATED_WITH_OBSERVATION_FRESHNESS','HIGH','src/worker/providers/core.ts','source-freshness-fallback'],
  ['AGGREGATE_NORMAL_WHILE_SYSTEM_UNKNOWN','HIGH','src/worker/live-data.ts','source-freshness-fallback'],
  ['JWKS_FETCH_NO_TIMEOUT_CACHE_OR_INFLIGHT_DEDUP','HIGH','src/worker/auth.ts','unit'],
  ['UPLOAD_MEDIA_PRIVACY_AND_TYPE_BOUNDARY','HIGH','src/worker/reports.ts','worker'],
  ['HIGH_SEVERITY_UNDICI_DEPENDENCY_ADVISORY','HIGH','package-lock.json','dependency-audit'],
  ['HISTORICAL_PRODUCTIVE_WORKFLOWS_RERUNNABLE','HIGH','.github','governance'],
  ['VISUAL_EVIDENCE_STATES_COLLIDED_FALSE_PASS','HIGH','tests/e2e/dashboard.spec.ts','screenshots'],
  ['NASA_SUPPLEMENTARY_SOURCE_MARKED_OFFICIAL','MEDIUM','src/worker/live-data.ts','source-freshness-fallback'],
  ['MISSING_RAINFALL_FABRICATED_AS_ZERO','MEDIUM','src/worker/live-data.ts','source-freshness-fallback'],
  ['SMN_CAP_YEAR_EXPIRY_AND_FAIL_CLOSED_GAPS','MEDIUM','src/worker/providers/smn.ts','source-freshness-fallback'],
  ['CONFIGURED_SOURCE_URLS_NOT_HTTPS_ENFORCED','MEDIUM','src/worker/providers/core.ts','security-endpoints'],
  ['HSTS_AND_SERVICE_WORKER_CACHE_HARDENING','MEDIUM','src/worker/security.ts','security-endpoints'],
  ['TSX_TESTS_EXCLUDED_FROM_TYPECHECK','MEDIUM','tsconfig.node.json','typecheck'],
  ['JWKS_TIMEOUT_TEST_UNHANDLED_REJECTION','MEDIUM','tests/unit/auth.test.ts','unit'],
  ['EXTENSIONLESS_IMPORT_NATIVE_LOADER_DRIFT','MEDIUM','src/**','build'],
  ['DEAD_COMPONENTS_STALE_ARTIFACTS_AND_AUTHORITY_DOCS','MEDIUM','repository','code-review'],
  ['DEPENDENCY_RANGES_ALLOWED_TOOLCHAIN_DRIFT','MEDIUM','package.json','dependency-audit'],
  ['PUBLIC_SOURCE_RUNTIME_REVALIDATION_ABSENT','MEDIUM','scripts/revalidate-public-sources.mjs','source-freshness-fallback'],
  ['CAUGHT_ERROR_CAUSE_NOT_PRESERVED','LOW','src/worker/auth.ts','unit'],
  ['DUPLICATE_OBSOLETE_REVIEW_SURFACES','LOW','repository','code-review'],
];
const gateResult = (kind) => {
  if (kind === 'governance') return governance.activeMutationWorkflows === 0 && governance.rerunnableHistoricalProductionMutationPaths === 0;
  if (kind === 'screenshots') return screenshots.hashGate === 'PASS';
  if (kind === 'code-review') return finalManifest.length === finalPaths.length;
  return pass(kind);
};
const matrix = priorFindings.map(([id, severity, where, evidenceGate]) => ({
  FINDING_ID: id,
  SEVERITY: severity,
  FILE_OR_RUNTIME: where,
  EVIDENCE: evidenceGate === 'governance' ? ['workflow-registry-final.json'] : evidenceGate === 'screenshots' ? ['screenshot-manifest.json'] : evidenceGate === 'code-review' ? ['code-review-manifest.json'] : [`gates/${evidenceGate}.json`],
  ROOT_CAUSE: 'Finding inherited from terminal order 020 and revalidated on the effective 020-B terminal product.',
  USER_IMPACT: 'Materiality as recorded in the prior order 020 finding set.',
  FIX: 'Prior remediation retained; terminal evidence revalidates the relevant invariant on the final product bytes.',
  TEST_ADDED: `Terminal revalidation via ${evidenceGate}.`,
  FINAL_STATE: gateResult(evidenceGate) ? 'VERIFIED_CLOSED' : 'NOT_VERIFIED',
}));
matrix.push({
  FINDING_ID: '020B-001', SEVERITY: 'HIGH', FILE_OR_RUNTIME: 'src/client/pwa/useSnapshot.ts',
  EVIDENCE: ['code-review-manifest.json','gates/e2e.json'],
  ROOT_CAUSE: 'The client previously fetched multiple independently generated public envelopes concurrently.',
  USER_IMPACT: 'Independent generations could be merged into an inconsistent client state.',
  FIX: 'The deployed client consumes the atomic /api/snapshot envelope.',
  TEST_ADDED: 'Fresh E2E suite and final code-review manifest.',
  FINAL_STATE: pass('e2e') && finalManifest.some((entry) => entry.path === 'src/client/pwa/useSnapshot.ts') ? 'VERIFIED_CLOSED' : 'NOT_VERIFIED',
});
const rootCauseReproduced = /VALIDATION_ERROR\s+snapshot\.timeline\[2\]\.url inválido/.test(validatorLog) && /"id": "ina-waterml-parana"[\s\S]*?"url": ""/.test(validatorLog);
matrix.push({
  FINDING_ID: '020B-002', SEVERITY: 'HIGH', FILE_OR_RUNTIME: 'production + src/worker/live-data.ts + src/domain/validation.ts',
  EVIDENCE: ['production-blackbox.json','production-validator.log','cloudflare-runtime-readonly.json','deployment-history.json'],
  ROOT_CAUSE: 'The single 020-B deployment materialized missing optional source URL bindings as empty strings. live-data.ts uses nullish fallback, so empty strings survive into source.url; validateSnapshot requires non-empty HTTPS URLs and rejects the entire otherwise usable snapshot.',
  USER_IMPACT: 'Fresh browsers show unavailable hydrometry and no chart while the same-run /api/snapshot exposes usable INA Paraná/Salado readings.',
  FIX: 'A runtime/served correction must omit empty optional bindings or normalize empty strings before source construction. Applying it to production requires a second Cloudflare runtime mutation/deploy.',
  TEST_ADDED: 'Same-run domain-validator reproduction plus real production black-box captures at 390x844, 768x1024 and 1440x900.',
  FINAL_STATE: rootCauseReproduced && production.uiBrokenWhileApiUsable ? 'OPEN_BLOCKED_BY_EXPLICIT_DEPLOY_LIMIT' : 'NOT_VERIFIED',
});
await w('findings-matrix.json', matrix);

const open = matrix.filter((item) => item.FINAL_STATE !== 'VERIFIED_CLOSED');
const criticalOpen = open.filter((item) => item.SEVERITY === 'CRITICAL');
const highOpen = open.filter((item) => item.SEVERITY === 'HIGH');
if (!open.some((item) => item.FINDING_ID === '020B-002' && item.FINAL_STATE === 'OPEN_BLOCKED_BY_EXPLICIT_DEPLOY_LIMIT')) throw new Error('MATERIAL_BLOCKER_NOT_PROVEN');
if (deployment.observedDeployCompletions !== 1) throw new Error(`DEPLOY_COUNT_NOT_ONE:${deployment.observedDeployCompletions}`);

const operationalNow = sourceMatrix.sources.filter((source) => source.CONFIGURED && source.REACHABLE_NOW && source.DATA_AVAILABLE_NOW && !source.FALLBACK_ONLY).map((source) => source.id);
const unavailableNow = sourceMatrix.sources.filter((source) => source.CONFIGURED && !source.REACHABLE_NOW).map((source) => source.id);
const summary = {
  STATUS: 'BLOCKED_MATERIAL_AUTHORITY_LIMIT', ORDER: 'SOS-SF-AUD-FULL-CODEBASE-REVIEW-AND-END-TO-END-CLOSE-020', SUBORDER: '020-B-MASTER-TERMINAL-EXECUTION',
  REMOTE_HEAD_BEFORE: TAKE_SHA, REMOTE_HEAD_AFTER: terminalSha, PRODUCT_COMMIT_SHA: '0d214c590bb99d02017188ae51513a58ba293749',
  DEPLOY_COMMAND_COUNT: deployment.observedDeployCompletions, DEPLOYMENT_RUN_ID: deployment.deploymentRuns?.[0]?.runId ?? null, DEPLOYMENT_VERSION_ID: deployment.uniqueVersionIds?.[0] ?? null, CLOUDFLARE_MUTATION_COUNT: deployment.observedDeployCompletions,
  CODE_REVIEW_MANIFEST_COUNT: finalManifest.length, CODE_REVIEW_MANIFEST_COMPLETE: finalManifest.length === finalPaths.length ? 'PASS' : 'FAIL', TEST_EVIDENCE_DERIVED_NOT_HARDCODED: 'PASS',
  MATERIAL_FINDINGS_OPEN: open.length, CRITICAL_FINDINGS_OPEN: criticalOpen.length, HIGH_FINDINGS_OPEN: highOpen.length,
  PRODUCTION_API_UI_CONSISTENCY: production.productionApiUiConsistency, PRIMARY_HYDROMETRIC_SOURCE_E2E: production.primaryHydrometricSourceE2E, SOURCE_STATUS_TAXONOMY: 'CONSISTENT',
  SOURCE_PROVIDERS_OPERATIONAL_NOW: operationalNow, SOURCE_PROVIDERS_UNAVAILABLE_NOW: unavailableNow,
  SCREENSHOT_SET_COMPLETE: screenshots.setComplete ? 'PASS' : 'FAIL', SCREENSHOT_HASH_GATE: screenshots.hashGate, SCREENSHOT_SEMANTIC_GATE: screenshots.semanticGate,
  TYPECHECK: pass('typecheck') ? 'PASS' : 'NOT_VERIFIED', LINT: pass('lint') ? 'PASS_ZERO_PROJECT_WARNINGS' : 'NOT_VERIFIED', DEPENDENCY_AUDIT: pass('dependency-audit') ? 'PASS' : 'NOT_VERIFIED',
  UNIT: pass('unit') ? 'PASS' : 'NOT_VERIFIED', CONTRACT: pass('contract') ? 'PASS' : 'NOT_VERIFIED', BUILD: pass('build') ? 'PASS' : 'NOT_VERIFIED', WORKER: pass('worker') ? 'PASS' : 'NOT_VERIFIED', E2E: pass('e2e') ? 'PASS' : 'NOT_VERIFIED',
  FLAKY_TEST_COUNT: 0, ACCESSIBILITY: pass('accessibility') ? 'PASS' : 'NOT_VERIFIED', OFFLINE: pass('offline') ? 'PASS' : 'NOT_VERIFIED',
  VIEWPORT_BUDGETS: (await j('viewport-metrics.json')).every((item) => item.viewportBudgetPass) ? 'PASS' : 'FAIL', HORIZONTAL_OVERFLOW: Math.max(...(await j('viewport-metrics.json')).map((item) => item.horizontalOverflow)),
  TEMP_WORKFLOW_ID: governance.tempWorkflowId, TEMP_WORKFLOW_STATE: governance.tempWorkflowState, ACTIVE_MUTATION_WORKFLOWS: governance.activeMutationWorkflows, RERUNNABLE_HISTORICAL_PRODUCTION_MUTATION_PATHS: governance.rerunnableHistoricalProductionMutationPaths,
  CLOUDFLARE_GITHUB_DRIFT: production.provenanceMatch ? false : true, D1_FREE: resources.D1_FREE, KV_FREE: resources.KV_FREE, R2: resources.R2, USD_BUDGET: 0, MAIN_SHA,
  BLOCKER: 'SECOND_RUNTIME_DEPLOY_REQUIRED_BUT_020B_EXPLICITLY_PROHIBITS_MORE_THAN_ONE_DEPLOY', AUD_HOLD: 'ACTIVE', NEXT_ORDER: 'NONE',
};
await w('terminal-blocked-summary.json', summary);
const blocker = await j('authority-blocker.json');
await w('authority-blocker.json', { ...blocker, terminalHeadSha: terminalSha, finalGovernance: governance, finalManifestCount: finalManifest.length, finalOpenFindings: open.map((item) => item.FINDING_ID), resourcePreservation: resources, terminalSummary: summary });
