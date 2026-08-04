from pathlib import Path


def replace_once(text: str, old: str, new: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'Expected one occurrence, found {count}: {old[:100]}')
    return text.replace(old, new)


path = Path('scripts/verify-deployment.mjs')
text = path.read_text()

text = replace_once(
    text,
    "    semantic = item.status === 200 && item.contentType.includes('text/html') && item.body.includes('Estado hídrico de Santa Fe') && item.body.includes('Teléfonos esenciales') && item.body.includes('no constituye una orden oficial');\n    detail = 'lite + quality/threshold disclaimer';",
    "    semantic = item.status === 200 && item.contentType.includes('text/html') && item.body.includes('Estado hídrico de Santa Fe') && item.body.includes('Teléfonos esenciales') && item.body.includes('no constituye una orden oficial') && item.body.includes('Datos en vivo') && /3\\.\\d{2} m/.test(item.body) && !item.body.includes('1970-01-01');\n    detail = 'lite + current numeric observation + quality/threshold disclaimer';",
)

text = replace_once(
    text,
    "    semantic = item.status === 200 && data?.status === 'healthy' && data?.dataMode === 'LIVE_AGGREGATION' && privateState && Array.isArray(data?.providers) && data.providers.length >= 3 && data.providers.every((provider) => typeof provider.id === 'string' && ['FRESH', 'STALE', 'UNAVAILABLE'].includes(provider.status));\n    detail = expectPrivateFeatures ? 'provider health + private activation' : 'provider health + private fail-closed state';",
    "    const providers = Array.isArray(data?.providers) ? data.providers : [];\n    const ina = providers.find((provider) => provider.id === 'ina-rest-30');\n    semantic = item.status === 200 && data?.status === 'healthy' && data?.dataMode === 'LIVE_AGGREGATION' && privateState && providers.length >= 3 && providers.every((provider) => typeof provider.id === 'string' && ['FRESH', 'STALE', 'UNAVAILABLE'].includes(provider.status) && 'lastSuccessAt' in provider && 'lastObservedAt' in provider && 'errorClass' in provider && 'circuitOpenUntil' in provider) && ['FRESH', 'STALE'].includes(ina?.status) && Number.isFinite(Date.parse(ina?.lastSuccessAt)) && Number.isFinite(Date.parse(ina?.lastObservedAt)) && ina?.errorClass === null && ina?.circuitOpenUntil === null;\n    detail = expectPrivateFeatures ? 'live INA provider health + private activation' : 'live INA provider health + private fail-closed state';",
)

text = replace_once(
    text,
    "    semantic = item.status === 200 && ['LIVE', 'STALE', 'UNAVAILABLE', 'OFFLINE'].includes(data?.dataStatus) && systems.some((system) => system.id === 'parana-santa-fe') && systems.some((system) => system.id === 'salado-santo-tome') && data?.state !== 'EVACUACION_OFICIAL' && !item.body.includes('DEMO_FIXTURE') && !item.body.includes('DEMO / NO OFICIAL');\n    detail = 'non-synthetic separated-system snapshot';",
    "    const santaFe = systems.find((system) => system.id === 'parana-santa-fe' && system.stationCode === '30');\n    const observedAt = Date.parse(santaFe?.observedAt);\n    semantic = item.status === 200 && data?.mode === 'LIVE' && ['LIVE', 'STALE'].includes(data?.dataStatus) && santaFe?.available === true && Number.isFinite(santaFe?.currentMetres) && Number.isFinite(observedAt) && Date.now() - observedAt <= 36 * 60 * 60 * 1000 && systems.some((system) => system.id === 'salado-santo-tome') && data?.state !== 'EVACUACION_OFICIAL' && !item.body.includes('DEMO_FIXTURE') && !item.body.includes('DEMO / NO OFICIAL');\n    detail = 'current numeric Santa Fe observation + separated-system snapshot';",
)

text = replace_once(
    text,
    "    semantic = item.status === 200 && systems.some((system) => system.id === 'parana-santa-fe') && systems.some((system) => system.id === 'salado-santo-tome') && sources.length >= 2 && sources.every((source) => typeof source.id === 'string' && ['FRESH', 'STALE', 'UNAVAILABLE'].includes(source.status) && typeof source.contribution === 'string' && typeof source.official === 'boolean');\n    detail = 'station separation + explicit provenance state';",
    "    const inaSource = sources.find((source) => source.id === 'ina:30');\n    semantic = item.status === 200 && systems.some((system) => system.id === 'parana-santa-fe') && systems.some((system) => system.id === 'salado-santo-tome') && sources.length >= 2 && sources.every((source) => typeof source.id === 'string' && ['FRESH', 'STALE', 'UNAVAILABLE'].includes(source.status) && typeof source.contribution === 'string' && typeof source.official === 'boolean') && inaSource?.connected === true && ['FRESH', 'STALE'].includes(inaSource?.status) && Number.isFinite(Date.parse(inaSource?.observedAt)) && String(inaSource?.url ?? '').startsWith('https://alerta.ina.gob.ar/a5/getObservaciones?');\n    detail = 'station separation + exact live INA provenance';",
)

path.write_text(text)
