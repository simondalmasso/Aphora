    versions: versions.map((item) => ({ id: item?.id || item?.version_id || null, createdOn: item?.metadata?.created_on || item?.created_on || null })),
  };
}

async function fetchWithRetry(path, parser = 'text') {
  let last;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const response = await fetch(`${URL}${path}${path.includes('?') ? '&' : '?'}order020=${Date.now()}-${attempt}`, {
        headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(40_000),
      });
      const body = parser === 'json' ? await response.json() : await response.text();
      if (response.ok) return { status: response.status, headers: Object.fromEntries(response.headers), body };
      last = new Error(`HTTP_${response.status}`);
    } catch (error) { last = error; }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  throw last;
}

const findings = [
  ['HIGH','INA_CACHE_REFRESH_CONFLATED_WITH_OBSERVATION_FRESHNESS','FIXED'],
  ['HIGH','AGGREGATE_NORMAL_WHILE_SYSTEM_UNKNOWN','FIXED'],
  ['HIGH','JWKS_FETCH_NO_TIMEOUT_CACHE_OR_INFLIGHT_DEDUP','FIXED'],
  ['HIGH','UPLOAD_MEDIA_PRIVACY_AND_TYPE_BOUNDARY','FIXED'],
  ['HIGH','HIGH_SEVERITY_UNDICI_DEPENDENCY_ADVISORY','FIXED'],
  ['HIGH','HISTORICAL_PRODUCTIVE_WORKFLOWS_RERUNNABLE','FIXED'],
  ['HIGH','VISUAL_EVIDENCE_STATES_COLLIDED_FALSE_PASS','FIXED'],
  ['MEDIUM','NASA_SUPPLEMENTARY_SOURCE_MARKED_OFFICIAL','FIXED'],
  ['MEDIUM','MISSING_RAINFALL_FABRICATED_AS_ZERO','FIXED'],
  ['MEDIUM','SMN_CAP_YEAR_EXPIRY_AND_FAIL_CLOSED_GAPS','FIXED'],
  ['MEDIUM','CONFIGURED_SOURCE_URLS_NOT_HTTPS_ENFORCED','FIXED'],
  ['MEDIUM','HSTS_AND_SERVICE_WORKER_CACHE_HARDENING','FIXED'],
  ['MEDIUM','TSX_TESTS_EXCLUDED_FROM_TYPECHECK','FIXED'],
  ['MEDIUM','JWKS_TIMEOUT_TEST_UNHANDLED_REJECTION','FIXED'],
  ['MEDIUM','EXTENSIONLESS_IMPORT_NATIVE_LOADER_DRIFT','FIXED'],
  ['MEDIUM','DEAD_COMPONENTS_STALE_ARTIFACTS_AND_AUTHORITY_DOCS','FIXED'],
  ['MEDIUM','DEPENDENCY_RANGES_ALLOWED_TOOLCHAIN_DRIFT','FIXED'],
  ['MEDIUM','PUBLIC_SOURCE_RUNTIME_REVALIDATION_ABSENT','FIXED'],
  ['LOW','CAUGHT_ERROR_CAUSE_NOT_PRESERVED','FIXED'],
  ['LOW','DUPLICATE_OBSOLETE_REVIEW_SURFACES','FIXED'],
].map(([severity,id,status]) => ({ severity,id,status }));

async function verifyDeploy() {
  if (!accountId || !token) throw new Error('CLOUDFLARE_CREDENTIALS_REQUIRED');
  if (git('branch', '--show-current') !== BRANCH) throw new Error('CANONICAL_BRANCH_MISMATCH');
  run('git', ['merge-base', '--is-ancestor', TAKE_SHA, 'HEAD']);
  if (git('rev-parse', 'origin/main') !== MAIN_SHA) throw new Error('MAIN_DRIFT_BEFORE_DEPLOY');
  await mkdir(join(EVIDENCE, 'screenshots'), { recursive: true });
  const digest = await productDigest();
  const provenance = { schemaVersion: 1, orderId: ORDER, ...digest, reviewRunId: process.env.GITHUB_RUN_ID };
  await writeFile('public/source-provenance.json', `${JSON.stringify(provenance)}\n`);
  git('add', 'public/source-provenance.json');
  const staged = spawnSync('git', ['diff', '--cached', '--quiet']);
  if (staged.status !== 0) {
    git('config', 'user.name', 'sos-sf-automation');
    git('config', 'user.email', 'sos-sf-automation@users.noreply.github.com');
    git('commit', '-m', 'chore: bind order 020 product provenance');
    git('push', 'origin', `HEAD:${BRANCH}`);
  }
  const productCommitSha = git('rev-parse', 'HEAD');
  const baseline = await cloudflareSnapshot();
  await jsonWrite('cloudflare-before.json', { ...baseline, secretNames: baseline.secretNames, valuesExposed: false });

  const required = ['GOOGLE_CLIENT_ID','SESSION_SIGNING_KEY','SOS_SF_OPERATOR_EMAILS'];
  const missing = required.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) throw new Error(`PROTECTED_CONFIGURATION_MISSING:${missing.join(',')}`);
  const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
  config.vars = {
    ...(config.vars || {}),
    PRIVATE_MESSAGING_ENABLED: 'true',
    GOOGLE_CLIENT_ID: String(process.env.GOOGLE_CLIENT_ID),
    REPORT_RETENTION_DAYS: String(process.env.REPORT_RETENTION_DAYS || '30'),
    INA_WATERML_PARANA_URL: String(process.env.INA_WATERML_PARANA_URL || ''),
    INA_WATERML_SALADO_URL: String(process.env.INA_WATERML_SALADO_URL || ''),
    PORTS_HYDROMETER_JSON_URL: String(process.env.PORTS_HYDROMETER_JSON_URL || ''),
