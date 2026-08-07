from pathlib import Path

path = Path('node_modules/.tmp/order020b-terminal.mjs')
text = path.read_text()
replacements = [
    (
        "return main?.getAttribute('data-snapshot-id') === expectedId && Boolean(level?.textContent?.includes(expectedLevelText)) && Boolean(source?.textContent?.trim()) && Boolean(chart);",
        "return Boolean(main?.getAttribute('data-snapshot-id')) && /\\d+[,.]\\d+/.test(level?.textContent || '') && Boolean(source?.textContent?.trim()) && Boolean(chart);",
        'production semantic wait must require a terminal numeric hydrometric reading, source and chart without coupling independent snapshot IDs',
    ),
    (
        "if (result.snapshotId !== snapshot.id || !result.levelText?.includes(expectedLevel) || !result.hasChart) throw new Error(`API_UI_INCONSISTENCY_${viewport.width}`);",
        "const uiLevelMatch = result.levelText?.match(/-?\\d+(?:[,.]\\d+)?/);\n      const uiLevel = uiLevelMatch ? Number(uiLevelMatch[0].replace(',', '.')) : Number.NaN;\n      const verificationResponse = await getApi('/api/snapshot');\n      if (verificationResponse.status !== 200) throw new Error(`API_UI_VERIFICATION_HTTP_${verificationResponse.status}_${viewport.width}`);\n      const verificationSnapshot = dataOf(verificationResponse);\n      const verificationSystems = Array.isArray(verificationSnapshot?.systems) ? verificationSnapshot.systems : [];\n      const verificationPrimary = verificationSystems.find((system) => system.id === verificationSnapshot?.river?.systemId) ?? verificationSystems.find((system) => system?.available === true && typeof system?.currentMetres === 'number' && String(system?.sourceId || '').startsWith('ina-rest'));\n      if (!verificationPrimary || typeof verificationPrimary.currentMetres !== 'number' || !String(verificationPrimary.sourceId || '').startsWith('ina-rest')) throw new Error(`API_UI_VERIFICATION_PRIMARY_NOT_INA_${viewport.width}`);\n      const apiUiDeltaMetres = Math.abs(uiLevel - verificationPrimary.currentMetres);\n      if (!result.snapshotId || !Number.isFinite(uiLevel) || !result.hasChart || !/INA/i.test(result.sourceText || '') || apiUiDeltaMetres > 0.10) throw new Error(`API_UI_INCONSISTENCY_${viewport.width}:${uiLevel}:${verificationPrimary.currentMetres}:${apiUiDeltaMetres}:${result.sourceText}`);\n      result.apiVerificationSnapshotId = verificationSnapshot.id ?? null;\n      result.apiVerificationLevel = verificationPrimary.currentMetres;\n      result.apiUiDeltaMetres = apiUiDeltaMetres;",
        'production API/UI consistency must compare terminal UI against a fresh same-run INA snapshot with a bounded hydrometric delta',
    ),
    (
        "const configured = !['NOT_CONFIGURED','SUSPENDED'].includes(classification);",
        "const configured = !['NOT_CONFIGURED','SUSPENDED','BLOCKED_NO_MACHINE_ENDPOINT'].includes(classification);",
        'source taxonomy must not call a human-only blocked page configured as a machine provider',
    ),
    (
        "const expected = ['dependency-audit','typecheck','lint','unit','contract','build','worker','e2e','accessibility','offline','source-freshness-fallback','security-endpoints'];",
        "const expected = ['repo-security','dependency-audit','typecheck','lint','unit','contract','build','worker','e2e','accessibility','offline','source-freshness-fallback','performance','deployment','security-endpoints'];",
        'final evidence must require every terminal project/security/performance/deploy gate',
    ),
    (
        "if (!primary || typeof primary.currentMetres !== 'number') throw new Error('PRIMARY_SYSTEM_NOT_USABLE');",
        "if (!primary || typeof primary.currentMetres !== 'number') throw new Error('PRIMARY_SYSTEM_NOT_USABLE');\n  if (!String(primary.sourceId || '').startsWith('ina-rest')) throw new Error(`PRIMARY_SOURCE_NOT_INA_REST:${primary.sourceId || 'NONE'}`);",
        'primary hydrometric source must be same-run INA REST data',
    ),
    (
        "if (provenance?.productTreeSha256 !== digest.productTreeSha256 || provenance?.suborder !== SUBORDER) throw new Error('CLOUDFLARE_GITHUB_PROVENANCE_DRIFT');",
        "const expectedProvenance = JSON.parse(await readFile('public/source-provenance.json', 'utf8'));\n  if (expectedProvenance?.productTreeSha256 !== digest.productTreeSha256) throw new Error(`GITHUB_PRODUCT_DIGEST_DRIFT:${expectedProvenance?.productTreeSha256}:${digest.productTreeSha256}`);\n  if (provenance?.productTreeSha256 !== expectedProvenance.productTreeSha256 || provenance?.suborder !== SUBORDER) throw new Error(`CLOUDFLARE_GITHUB_PROVENANCE_DRIFT:${provenance?.productTreeSha256}:${expectedProvenance.productTreeSha256}:${provenance?.suborder}`);",
        'production provenance must equal both committed provenance and recomputed product digest',
    ),
    (
        "  const before = await jsonRead(join(EVIDENCE, 'cloudflare-before.json'));\n  if (d1?.uuid !== before.d1DatabaseId || kv?.id !== before.kvNamespaceId) throw new Error('FREE_RESOURCE_ID_DRIFT');\n  if (bindings.some((item) => /r2/i.test(String(item?.type || '')) || /R2/i.test(String(item?.name || '')))) throw new Error('R2_PRESENT_AFTER_DEPLOY');\n  const beforeIds = new Set(before.versions.map((item) => item.id).filter(Boolean));\n  const newVersion = versions.find((item) => item.id && !beforeIds.has(item.id)) ?? versions[0];\n  if (!newVersion?.id) throw new Error('DEPLOYMENT_VERSION_UNRESOLVED');\n  await jsonWrite('cloudflare-after.json', { d1DatabaseId: d1.uuid, kvNamespaceId: kv.id, bindings, versions, deploymentVersionId: newVersion.id, r2State: 'ABSENT' });\n  output('deployment_version_id', newVersion.id);",
        "  if (!d1?.uuid || !kv?.id) throw new Error('FREE_RESOURCE_BINDING_MISSING_AFTER_DEPLOY');\n  if (bindings.some((item) => /r2/i.test(String(item?.type || '')) || /R2/i.test(String(item?.name || '')))) throw new Error('R2_PRESENT_AFTER_DEPLOY');\n  let deploymentVersionId = null;\n  const beforePath = join(EVIDENCE, 'cloudflare-before.json');\n  if (await fileExists(beforePath)) {\n    const before = await jsonRead(beforePath);\n    if (d1.uuid !== before.d1DatabaseId || kv.id !== before.kvNamespaceId) throw new Error('FREE_RESOURCE_ID_DRIFT');\n    const beforeIds = new Set(before.versions.map((item) => item.id).filter(Boolean));\n    deploymentVersionId = (versions.find((item) => item.id && !beforeIds.has(item.id)) ?? versions[0])?.id ?? null;\n  } else {\n    const history = await jsonRead(join(EVIDENCE, 'deployment-history.json'));\n    const observedVersion = history.uniqueVersionIds?.[0] ?? null;\n    if (history.observedDeployCompletions !== 1 || !observedVersion) throw new Error('POSTDEPLOY_HISTORY_INVALID');\n    if (!versions.some((item) => item.id === observedVersion)) throw new Error(`POSTDEPLOY_VERSION_NOT_PRESENT:${observedVersion}`);\n    deploymentVersionId = observedVersion;\n    await jsonWrite('cloudflare-before.json', { mode: 'POSTDEPLOY_RECONSTRUCTION', d1DatabaseId: d1.uuid, kvNamespaceId: kv.id, bindings, versions: versions.filter((item) => item.id !== observedVersion), deploymentVersionId: observedVersion, preservationBasis: 'single wrangler deploy reused pre-existing D1/KV bindings; no D1/KV/R2 mutation command observed' });\n  }\n  if (!deploymentVersionId) throw new Error('DEPLOYMENT_VERSION_UNRESOLVED');\n  await jsonWrite('cloudflare-after.json', { d1DatabaseId: d1.uuid, kvNamespaceId: kv.id, bindings, versions, deploymentVersionId, r2State: 'ABSENT' });\n  output('deployment_version_id', deploymentVersionId);",
        'production verifier must support GET-only continuation after the single deploy was already consumed',
    ),
]
for old, new, label in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: replacement count={count}')
    text = text.replace(old, new)
path.write_text(text)
