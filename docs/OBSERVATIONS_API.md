# API de observaciones hidrométricas

## Objetivo

APHORA expone un contrato común de solo lectura para que la interfaz no dependa de la estructura HTML/JSON particular de cada proveedor.

## Endpoint de APHORA

`GET /api/observations`

Parámetros opcionales:

- `type=RIVER_LEVEL`: filtra el tipo de observación admitido.
- `limit=1..100`: limita el número de registros devueltos (por defecto 50).
- `bbox=minLon,minLat,maxLon,maxLat`: recorta por longitud/latitud; requiere geometría utilizable.

La respuesta incluye `data.observations`, `data.count`, `data.sourceState` y `data.coverage`. Cada observación normalizada conserva el proveedor, organización, rol de fuente, estación, valor/unidad, `observedAt`, `fetchedAt`, `freshness`, estado de verificación y geometría si puede asociarse de manera trazable.

Ejemplos:

```http
GET /api/observations?type=RIVER_LEVEL&limit=50
GET /api/observations?type=RIVER_LEVEL&bbox=-61.2,-32.1,-60.1,-31.1&limit=25
```

Un HTTP 200 significa que APHORA pudo responder; no significa que un proveedor tenga datos recientes. Para interpretar la respuesta:

- `sourceState.providers.ina.measurementState` distingue mediciones utilizables de la ausencia de valores.
- `sourceState.providers.ina.coordinateState` indica si se resolvió metadato geográfico.
- `sourceState.providers.prefectura.state` informa si el adaptador pudo leer la tabla publicada.
- `observedAt` es la fecha de medición; `fetchedAt` es la fecha de consulta.
- `freshness` no se debe reemplazar por la hora de consulta.
- Los niveles y umbrales de estación son observaciones; no se presentan como alertas nacionales de APHORA.

## Fuentes de origen identificadas

### INA — observaciones

- Metadatos de series hidrológicas (GeoJSON): <https://alerta.ina.gob.ar/a5/obs/puntual/series?format=geojson&GeneralCategory=Hydrology&data_availability=h>
- Serie temporal JSON: <https://alerta.ina.gob.ar/a5/getObservaciones?tipo=puntual&series_id={series_id}&timestart={YYYY-MM-DD}&timeend={YYYY-MM-DD}>
- Referencia pública: <https://alerta.ina.gob.ar/a5/secciones>

El repositorio canónico ya contiene un cliente REST en el worker legado que consulta `getObservaciones` para las series configuradas, además de un adaptador de metadatos GeoJSON. El endpoint común no debe considerar que existe una medición simplemente porque el objeto de snapshot exista: se requiere valor utilizable y fecha de observación válida.

### Prefectura Naval Argentina — alturas

- Página pública consultada por el adaptador: <https://contenidosweb.prefecturanaval.gob.ar/alturas/>

La página publica una tabla HTML; no se encontró una API JSON propia documentada en sus scripts públicos. APHORA la consulta mediante un parser estricto. Si el Worker no puede acceder a esa página, puede usar una serie identificada por INA/SIyAH como originada en Prefectura (por ejemplo, `fuente=alturas_prefe`) y marcarla como `MIRROR_AVAILABLE` / `INA_SIYAH_MIRROR`. Esa copia no es una corroboración independiente y no se presenta como una conexión directa a Prefectura. Si no existe una serie de respaldo válida, el estado queda degradado o no disponible.

## Límites de esta integración

- INA y Prefectura son fuentes oficiales distintas, pero no necesariamente miden la misma estación ni el mismo instante.
- Las coordenadas asociadas desde metadatos de INA son coordenadas publicadas por el proveedor, no un relevamiento independiente.
- El estado de una estación o sus umbrales no equivalen a una alerta oficial.
- Los datos actuales de producción requieren una consulta exitosa al endpoint publicado y validación de sus marcas de tiempo. Los tests con fixtures solo validan el comportamiento del código.
- La integración es de lectura; no requiere autenticación del usuario final y no ejecuta acciones de escritura en los proveedores.
