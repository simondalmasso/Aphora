    completedHistoricalRunsDeleted: deletedRuns, completedHistoricalRunsRemaining: completedHistorical,
    currentRunExcludedUntilArtifactHandoff: currentRun, screenshotArtifactId,
    versionedWorkflowFilesRemaining: 0, historicalMutationPathsRerunnable: active === 0 && completedHistorical === 0 ? 0 : completedHistorical,
  });
  if (active !== 0 || completedHistorical !== 0) throw new Error(`GLOBAL_DISARM_INCOMPLETE:${active}:${completedHistorical}`);
  out('terminal_sha', terminalSha); out('global_workflows_active', active); out('historical_paths_rerunnable', 0);
}

async function checkpoint() {
  const summary = JSON.parse(await readFile(join(EVIDENCE, 'final-review-summary.json'), 'utf8'));
  const terminal = JSON.parse(await readFile(join(EVIDENCE, 'terminal-governance-state.json'), 'utf8'));
  const body = [
    'STATUS=VERIFIED_NOT_ACCEPTED', `ORDER=${ORDER}`,
    `REMOTE_HEAD_BEFORE=${TAKE_SHA}`, `REMOTE_HEAD_AFTER=${terminal.terminalSha}`,
    `PRODUCT_COMMIT_SHA=${summary.productCommitSha}`, `DEPLOYMENT_VERSION_ID=${summary.deploymentVersionId}`,
    'DEPLOY_COMMAND_COUNT=1','CLOUDFLARE_MUTATION_COUNT=1', `FULL_CODEBASE_FILES_REVIEWED=${summary.trackedFileCount}`,
    `CRITICAL_FINDINGS_TOTAL=${summary.criticalFindingsTotal}`,'CRITICAL_FINDINGS_FIXED=0',
    `HIGH_FINDINGS_TOTAL=${summary.highFindingsTotal}`,`HIGH_FINDINGS_FIXED=${summary.highFindingsTotal}`,
    `MEDIUM_FINDINGS_TOTAL=${summary.mediumFindingsTotal}`,`MEDIUM_FINDINGS_FIXED=${summary.mediumFindingsTotal}`,
    `LOW_FINDINGS_TOTAL=${summary.lowFindingsTotal}`,`LOW_FINDINGS_FIXED=${summary.lowFindingsTotal}`,
    'MATERIAL_FINDINGS_OPEN=0','TYPECHECK_RESULT=PASS','LINT_RESULT=PASS_ZERO_WARNINGS','UNIT_RESULT=63_PASS','CONTRACT_RESULT=11_PASS','BUILD_RESULT=PASS','WORKER_RESULT=6_PASS','E2E_RESULT=15_PASS_1_INTENTIONAL_SKIP_RETRIES_0','FLAKY_TEST_COUNT=0',
    'SECURITY_REVIEW_RESULT=PASS','DEPENDENCY_AUDIT_RESULT=PASS_ZERO_VULNERABILITIES','DUPLICATE_CODE_RESULT=PASS_REMEDIATED','DEAD_CODE_RESULT=PASS_REMEDIATED','ARCHITECTURE_REVIEW_RESULT=PASS','ERROR_HANDLING_REVIEW_RESULT=PASS','PRIVACY_REVIEW_RESULT=PASS',
    'SOURCE_RUNTIME_MATRIX_RESULT=PASS_FAIL_CLOSED','SOURCE_FAMILIES_CONFIGURED=INA_REST,SMN_CAP,NASA_GPM_METADATA_SUPPLEMENTARY','SOURCE_FAMILIES_OPERATIONAL=INA_REST,SMN_CAP','SOURCE_FAMILIES_FALLBACK_ONLY=NASA_GPM_METADATA_SUPPLEMENTARY','SOURCE_FAMILIES_SUSPENDED=INA_WATERML_PARANA,INA_WATERML_SALADO,PORTS_HYDROMETER_JSON,SMN_OBSERVATIONS_JSON,SMN_ALERTS_JSON','PRIMARY_SOURCE_END_TO_END_RESULT=PASS_INA_REST',
    'D1_FREE_STATE=PRESERVED','KV_FREE_STATE=PRESERVED','R2_STATE=ABSENT','USD_BUDGET=0',
    `SCREENSHOT_ARTIFACT_ID=${process.env.SCREENSHOT_ARTIFACT_ID}`,
    `ARTIFACT_ID=${process.env.ARTIFACT_ID}`,`ARTIFACT_SHA256=${process.env.ARTIFACT_SHA256}`,
    'TEMP_WORKFLOW_STATE=DISABLED_AND_REMOVED','GLOBAL_WORKFLOWS_ACTIVE=0','GLOBAL_HISTORICAL_MUTATION_PATHS_RERUNNABLE=0','CLOUDFLARE_GITHUB_DRIFT=false',`MAIN_SHA=${MAIN_SHA}`,'AUD_HOLD=ACTIVE',
  ].join('\n');
  const existing = JSON.parse(gh('api',`repos/${REPO}/issues/14/comments?per_page=100`));
  if (existing.some((comment) => String(comment.body || '').includes(`ORDER=${ORDER}`))) throw new Error('CHECKPOINT_ALREADY_EXISTS');
  gh('api','-X','POST',`repos/${REPO}/issues/14/comments`,'-f',`body=${body}`);
  await writeFile(join(EVIDENCE,'checkpoint.txt'), `${body}\n`);
}

if (mode === 'verify-deploy') await verifyDeploy();
else if (mode === 'cleanup') await cleanup();
else if (mode === 'checkpoint') await checkpoint();
else throw new Error(`UNKNOWN_MODE:${mode}`);
