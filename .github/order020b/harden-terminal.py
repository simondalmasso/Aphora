from pathlib import Path

path = Path('node_modules/.tmp/order020b-terminal.mjs')
text = path.read_text()
replacements = [
    (
        "return main?.getAttribute('data-snapshot-id') === expectedId && Boolean(level?.textContent?.includes(expectedLevelText)) && Boolean(source?.textContent?.trim()) && Boolean(chart);",
        "return Boolean(main?.getAttribute('data-snapshot-id')) && Boolean(level?.textContent?.includes(expectedLevelText)) && Boolean(source?.textContent?.trim()) && Boolean(chart);",
        'production semantic wait must compare API data, not independently generated snapshot IDs',
    ),
    (
        "if (result.snapshotId !== snapshot.id || !result.levelText?.includes(expectedLevel) || !result.hasChart) throw new Error(`API_UI_INCONSISTENCY_${viewport.width}`);",
        "if (!result.snapshotId || !result.levelText?.includes(expectedLevel) || !result.hasChart) throw new Error(`API_UI_INCONSISTENCY_${viewport.width}`);",
        'production API/UI consistency check must tolerate independently generated snapshot IDs',
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
]
for old, new, label in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: replacement count={count}')
    text = text.replace(old, new)
path.write_text(text)
