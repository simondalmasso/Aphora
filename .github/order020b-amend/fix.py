from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new))


replace_once(
    'src/domain/snapshot.ts',
    "  readonly sourceId: string;\n  readonly official: boolean;\n}",
    "  readonly sourceId: string;\n  readonly url?: string;\n  readonly official: boolean;\n}",
    'timeline optional url type',
)

replace_once(
    'src/domain/validation.ts',
    "  if (row.url !== undefined) httpsUrl(row.url, `snapshot.timeline[${index}].url`);\n  if (typeof row.official !== 'boolean') throw new TypeError(`snapshot.sources[${index}].official inválido`);",
    "  if (row.url !== undefined) httpsUrl(row.url, `snapshot.sources[${index}].url`);\n  if (typeof row.official !== 'boolean') throw new TypeError(`snapshot.sources[${index}].official inválido`);",
    'source url validation label',
)

replace_once(
    'src/domain/public-safety.ts',
    "    events.push(Object.freeze({ id: `source:${source.id}:${source.classification}`, at: source.lastCheckedAt ?? now.toISOString(), type: 'SOURCE_DEGRADED', title: `Fuente con disponibilidad limitada: ${source.feedName ?? source.name}`, detail: source.limitations ?? source.contribution, sourceId: source.id, official: false }));",
    "    events.push(Object.freeze({\n      id: `source:${source.id}:${source.classification}`,\n      at: source.lastCheckedAt ?? now.toISOString(),\n      type: 'SOURCE_DEGRADED',\n      title: `Fuente con disponibilidad limitada: ${source.feedName ?? source.name}`,\n      detail: source.limitations ?? source.contribution,\n      sourceId: source.id,\n      ...(source.url ? { url: source.url } : {}),\n      official: false,\n    }));",
    'timeline source optional url producer',
)

replace_once(
    'src/worker/live-data.ts',
    "async function configKey(env: LiveDataEnv): Promise<string> {\n  const config = JSON.stringify({\n    version: LIVE_DATA_CACHE_VERSION,\n    waterMlParana: env.INA_WATERML_PARANA_URL ?? null,\n    waterMlSalado: env.INA_WATERML_SALADO_URL ?? null,\n    ports: env.PORTS_HYDROMETER_JSON_URL ?? null,\n    smnObservations: env.SMN_OBSERVATIONS_JSON_URL ?? null,\n    smnAlerts: env.SMN_ALERTS_JSON_URL ?? null,\n  });",
    "function optionalHttpsConfigUrl(value: string | undefined, label: string): string | undefined {\n  const normalized = value?.trim();\n  if (!normalized) return undefined;\n  let parsed: URL;\n  try { parsed = new URL(normalized); } catch { throw new TypeError(`${label} debe ser una URL HTTPS válida`); }\n  if (parsed.protocol !== 'https:') throw new TypeError(`${label} debe usar HTTPS`);\n  return normalized;\n}\n\nasync function configKey(env: LiveDataEnv): Promise<string> {\n  const config = JSON.stringify({\n    version: LIVE_DATA_CACHE_VERSION,\n    waterMlParana: optionalHttpsConfigUrl(env.INA_WATERML_PARANA_URL, 'INA_WATERML_PARANA_URL') ?? null,\n    waterMlSalado: optionalHttpsConfigUrl(env.INA_WATERML_SALADO_URL, 'INA_WATERML_SALADO_URL') ?? null,\n    ports: optionalHttpsConfigUrl(env.PORTS_HYDROMETER_JSON_URL, 'PORTS_HYDROMETER_JSON_URL') ?? null,\n    smnObservations: optionalHttpsConfigUrl(env.SMN_OBSERVATIONS_JSON_URL, 'SMN_OBSERVATIONS_JSON_URL') ?? null,\n    smnAlerts: optionalHttpsConfigUrl(env.SMN_ALERTS_JSON_URL, 'SMN_ALERTS_JSON_URL') ?? null,\n  });",
    'normalize optional environment urls in cache key',
)

replace_once(
    'src/worker/live-data.ts',
    "  url: string;\n  connected: boolean;",
    "  url?: string;\n  connected: boolean;",
    'source base optional url input',
)

replace_once(
    'src/worker/live-data.ts',
    "    official: input.official ?? true,\n    url: input.url,\n    connected: input.connected,",
    "    official: input.official ?? true,\n    ...(input.url?.trim() ? { url: input.url.trim() } : {}),\n    connected: input.connected,",
    'omit blank source urls',
)

replace_once(
    'src/worker/live-data.ts',
    "  const defaultWaterMl = (series: string) => `https://alerta.ina.gob.ar/a5/obs/puntual/series/${series}?timestart=${from}&timeend=${to}&format=waterml2`;\n\n  const stationPromise = Promise.all(STATIONS.map((station) => stationSystem(station, now)));\n  const smnAlertPromise = smnAlertFeed(env.SMN_ALERTS_JSON_URL ?? defaultSmnCapUrl(now), now);\n  const optionalPromise = Promise.all([\n    waterMlSource(env.INA_WATERML_PARANA_URL ?? defaultWaterMl('30'), 'ina-waterml-parana', 'INA WaterML · Río Paraná, Santa Fe', now),\n    waterMlSource(env.INA_WATERML_SALADO_URL ?? defaultWaterMl('3044'), 'ina-waterml-salado', 'INA WaterML · Río Salado, Santo Tomé', now),\n    portsSource(env.PORTS_HYDROMETER_JSON_URL, now),\n    smnObservationSource(env.SMN_OBSERVATIONS_JSON_URL, now),",
    "  const defaultWaterMl = (series: string) => `https://alerta.ina.gob.ar/a5/obs/puntual/series/${series}?timestart=${from}&timeend=${to}&format=waterml2`;\n  const waterMlParanaUrl = optionalHttpsConfigUrl(env.INA_WATERML_PARANA_URL, 'INA_WATERML_PARANA_URL');\n  const waterMlSaladoUrl = optionalHttpsConfigUrl(env.INA_WATERML_SALADO_URL, 'INA_WATERML_SALADO_URL');\n  const portsUrl = optionalHttpsConfigUrl(env.PORTS_HYDROMETER_JSON_URL, 'PORTS_HYDROMETER_JSON_URL');\n  const smnObservationsUrl = optionalHttpsConfigUrl(env.SMN_OBSERVATIONS_JSON_URL, 'SMN_OBSERVATIONS_JSON_URL');\n  const smnAlertsUrl = optionalHttpsConfigUrl(env.SMN_ALERTS_JSON_URL, 'SMN_ALERTS_JSON_URL');\n\n  const stationPromise = Promise.all(STATIONS.map((station) => stationSystem(station, now)));\n  const smnAlertPromise = smnAlertFeed(smnAlertsUrl ?? defaultSmnCapUrl(now), now);\n  const optionalPromise = Promise.all([\n    waterMlSource(waterMlParanaUrl ?? defaultWaterMl('30'), 'ina-waterml-parana', 'INA WaterML · Río Paraná, Santa Fe', now),\n    waterMlSource(waterMlSaladoUrl ?? defaultWaterMl('3044'), 'ina-waterml-salado', 'INA WaterML · Río Salado, Santo Tomé', now),\n    portsSource(portsUrl, now),\n    smnObservationSource(smnObservationsUrl, now),",
    'normalize optional urls before provider construction',
)

replace_once(
    'tests/unit/live-data.test.ts',
    "import { buildLiveSnapshot } from '../../src/worker/live-data.ts';",
    "import { validateSnapshot } from '../../src/domain/validation.ts';\nimport { buildLiveSnapshot } from '../../src/worker/live-data.ts';",
    'live data validator import',
)

replace_once(
    'tests/unit/live-data.test.ts',
    "  it('returns UNKNOWN when a normal current system is mixed with an obsolete system', async () => {",
    "  it('normalizes blank optional endpoint bindings without invalidating usable INA hydrometry', async () => {\n    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {\n      const id = seriesId(input);\n      if (id === '30') return json(points(Number(id), [['2026-08-03T12:00:00.000Z', 3.18], ['2026-08-03T18:00:00.000Z', 3.2]]));\n      if (id === '3044') return json(points(Number(id), [['2026-08-03T12:00:00.000Z', 4.7], ['2026-08-03T18:00:00.000Z', 4.8]]));\n      if (String(input).includes('/identify')) return json({ observedAt: '2026-08-03T17:30:00.000Z', value: 0 });\n      throw new Error(`unexpected URL ${String(input)}`);\n    }) as typeof fetch;\n    const snapshot = await buildLiveSnapshot({\n      INA_WATERML_PARANA_URL: '',\n      INA_WATERML_SALADO_URL: '   ',\n      PORTS_HYDROMETER_JSON_URL: '',\n      SMN_OBSERVATIONS_JSON_URL: ' ',\n      SMN_ALERTS_JSON_URL: '',\n    }, new Date('2026-08-03T18:00:00.000Z'));\n    expect(validateSnapshot(snapshot)).toBe(snapshot);\n    expect(snapshot.systems?.map((system) => [system.id, system.currentMetres])).toEqual([\n      ['parana-santa-fe', 3.2],\n      ['salado-santo-tome', 4.8],\n    ]);\n    expect(snapshot.sources.every((item) => item.url !== '')).toBe(true);\n    expect(snapshot.sources.find((item) => item.id === 'ina-waterml-parana')?.url).toMatch(/^https:\\/\\//);\n    expect(snapshot.sources.find((item) => item.id === 'ina-waterml-salado')?.url).toMatch(/^https:\\/\\//);\n    expect(snapshot.sources.find((item) => item.id === 'smn-alerts')?.url).toMatch(/^https:\\/\\//);\n    expect(snapshot.timeline?.filter((item) => item.type === 'SOURCE_DEGRADED').every((item) => item.url === undefined || item.url.startsWith('https://'))).toBe(true);\n  });\n\n  it('returns UNKNOWN when a normal current system is mixed with an obsolete system', async () => {",
    'blank binding regression',
)

replace_once(
    'tests/unit/snapshot-validation.test.ts',
    "  it('rejects unsafe public URLs and fabricated available rain totals', () => {\n    expect(() => validateSnapshot(live({ sources: [{ ...source, url: 'javascript:alert(1)' }] }))).toThrow('debe usar HTTPS');\n    expect(() => validateSnapshot(live({ rain: { ...live().rain, available: true, accumulated1hMm: null, accumulated24hMm: null } }))).toThrow('disponible sin acumulados');\n  });",
    "  it('accepts source timeline events without an optional URL and rejects empty or unsafe URLs when present', () => {\n    const timeline = [{ id: 'source:degraded', at, type: 'SOURCE_DEGRADED' as const, title: 'Fuente degradada', detail: 'Sin endpoint publicable.', sourceId: source.id, official: false }];\n    expect(validateSnapshot(live({ timeline }))).toBeTruthy();\n    expect(() => validateSnapshot(live({ sources: [{ ...source, url: '' }] }))).toThrow('snapshot.sources[0].url inválido');\n    expect(() => validateSnapshot(live({ timeline: [{ ...timeline[0], url: '' }] }))).toThrow('snapshot.timeline[0].url inválido');\n    expect(() => validateSnapshot(live({ sources: [{ ...source, url: 'javascript:alert(1)' }] }))).toThrow('debe usar HTTPS');\n  });\n\n  it('rejects fabricated available rain totals', () => {\n    expect(() => validateSnapshot(live({ rain: { ...live().rain, available: true, accumulated1hMm: null, accumulated24hMm: null } }))).toThrow('disponible sin acumulados');\n  });",
    'optional url validation regressions',
)

print('020-B corrective source URL contract patch applied')
