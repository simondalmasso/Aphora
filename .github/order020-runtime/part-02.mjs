    SMN_OBSERVATIONS_JSON_URL: String(process.env.SMN_OBSERVATIONS_JSON_URL || ''),
    SMN_ALERTS_JSON_URL: String(process.env.SMN_ALERTS_JSON_URL || ''),
  };
  config.d1_databases = [{ binding: 'MESSAGES_DB', database_name: 'sos-sf-private', database_id: baseline.d1DatabaseId, migrations_dir: 'migrations' }];
  config.kv_namespaces = [{ binding: 'REPORTS_KV', id: baseline.kvNamespaceId }];
  delete config.r2_buckets;
  await writeFile('wrangler.generated.jsonc', `${JSON.stringify(config, null, 2)}\n`);
  const secretPayload = {
    SESSION_SIGNING_KEY: String(process.env.SESSION_SIGNING_KEY),
    SOS_SF_OPERATOR_EMAILS: String(process.env.SOS_SF_OPERATOR_EMAILS),
    ...(String(process.env.MESSAGE_BLOCKLIST || '') ? { MESSAGE_BLOCKLIST: String(process.env.MESSAGE_BLOCKLIST) } : {}),
  };
  await writeFile('.worker-secrets.json', `${JSON.stringify(secretPayload)}\n`, { mode: 0o600 });

  run('npm', ['run', 'build'], { stdio: 'inherit' });
  const deploy = spawnSync('npx', ['wrangler','deploy','--config','wrangler.generated.jsonc','--secrets-file','.worker-secrets.json'], { encoding: 'utf8' });
  await writeFile(join(EVIDENCE, 'deploy.log'), `${deploy.stdout || ''}\n${deploy.stderr || ''}`);
  if (deploy.status !== 0) throw new Error(`DEPLOY_FAILED:${deploy.status}`);
  const combined = `${deploy.stdout || ''}\n${deploy.stderr || ''}`;
  const parsedVersion = combined.match(/(?:Current\s+)?Version ID:\s*([0-9a-f-]{36})/i)?.[1] || null;

  let after;
  let versionId = parsedVersion;
  const beforeIds = new Set(baseline.versions.map((item) => item.id).filter(Boolean));
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    after = await cloudflareSnapshot();
    const candidate = after.versions.find((item) => item.id && !beforeIds.has(item.id));
    versionId ||= candidate?.id || after.versions[0]?.id || null;
    if (versionId && after.d1DatabaseId === baseline.d1DatabaseId && after.kvNamespaceId === baseline.kvNamespaceId) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  if (!versionId) throw new Error('DEPLOYMENT_VERSION_ID_UNRESOLVED');
  if (after.d1DatabaseId !== baseline.d1DatabaseId || after.kvNamespaceId !== baseline.kvNamespaceId) throw new Error('D1_OR_KV_DRIFT');
  await jsonWrite('cloudflare-after.json', { ...after, deploymentVersionId: versionId, valuesExposed: false });

  const [health, snapshot, sources, lite, prov, sw] = await Promise.all([
    fetchWithRetry('/api/health','json'), fetchWithRetry('/api/snapshot','json'), fetchWithRetry('/api/sources','json'),
    fetchWithRetry('/lite'), fetchWithRetry('/source-provenance.json','json'), fetchWithRetry('/service-worker.js'),
  ]);
  const provData = prov.body?.data || prov.body;
  if (provData?.orderId !== ORDER || provData?.productTreeSha256 !== digest.productTreeSha256) throw new Error('CLOUDFLARE_GITHUB_PROVENANCE_DRIFT');
  if (!String(lite.body).includes('Situación hidrométrica')) throw new Error('LITE_HYDROMETRIC_SURFACE_MISSING');
  if (!String(sw.body).includes('PUBLIC_API_ALLOWLIST')) throw new Error('SERVICE_WORKER_POLICY_MISSING');
  await jsonWrite('production-endpoints.json', {
    health: { status: health.status, body: health.body }, snapshot: { status: snapshot.status }, sources: { status: sources.status },
    lite: { status: lite.status }, provenance: { status: prov.status, body: provData }, serviceWorker: { status: sw.status },
  });

  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${URL}/?order020=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForSelector('main', { timeout: 20_000 });
      const metrics = await page.evaluate(() => ({
        title: document.title,
        text: document.body.innerText.slice(0, 1000),
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        scrollRatio: document.documentElement.scrollHeight / window.innerHeight,
      }));
      if (!/Situación hidrométrica/i.test(metrics.text) || metrics.horizontalOverflow > 1) throw new Error(`PRODUCTION_UI_GATE_FAILED:${viewport.width}`);
      await page.screenshot({ path: join(EVIDENCE, 'screenshots', `production-${viewport.width}x${viewport.height}.png`), fullPage: true });
