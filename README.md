# APHORA — Situación del territorio

[![CI](https://github.com/simondalmasso/Aphora/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/simondalmasso/Aphora/actions/workflows/ci.yml)


**APHORA** es una aplicación web progresiva (PWA) para consultar la situación territorial: alertas, eventos, niveles de ríos y observaciones con fuente, fecha, vigencia y estado de verificación visibles. No ofrece predicciones propias ni afirma capacidades de inteligencia artificial.

- **Aplicación en producción:** https://aphora.simondalmasso44.workers.dev/
- **Repositorio canónico:** https://github.com/simondalmasso/Aphora
- **Espejo heredado de GitLab:** https://gitlab.com/simondalmasso/aphora

> APHORA organiza información para facilitar la observación cívica; no sustituye las alertas oficiales, los servicios de emergencia ni las instrucciones de las autoridades.

## Qué ofrece

- Panorama territorial nacional y exploración por área o localidad.
- Eventos relacionados con riesgos meteorológicos, inundaciones, sismos e incendios, según la disponibilidad de cada fuente.
- Contexto geográfico, actividad reciente y evidencia asociada a los eventos.
- Separación explícita entre fuente oficial, observación y fuente complementaria.
- Indicadores de frescura y verificación: una observación, una alerta publicada y una confirmación no son equivalentes.
- Interfaz adaptable y capacidades de aplicación web progresiva (PWA).

La cobertura y la actualización dependen de las fuentes externas. La ausencia de un evento en APHORA no demuestra que una zona sea segura.

## API de observaciones

El endpoint común `GET /api/observations` combina observaciones hidrométricas normalizadas de INA y Prefectura, con fuente, fecha de medición, fecha de recepción, vigencia y estado por proveedor. Acepta `type=RIVER_LEVEL`, `limit` y `bbox=minLon,minLat,maxLon,maxLat`. El contrato y los endpoints de origen están documentados en [docs/OBSERVATIONS_API.md](docs/OBSERVATIONS_API.md). La respuesta técnica HTTP 200 no garantiza que las fuentes entreguen mediciones actuales; hay que comprobar `sourceState`, `freshness` y `observedAt`.

## Fuentes de datos

El código integra proveedores y adaptadores para fuentes públicas como el Servicio Meteorológico Nacional (SMN/CAP), el Instituto Nacional del Agua (INA), INPRES, USGS, NASA EONET y datos complementarios de inundaciones. La fuente concreta y su función deben evaluarse en cada evento; no todas las fuentes tienen el mismo alcance, autoridad o frecuencia de actualización.

## Arquitectura

- **Frontend:** JavaScript, CSS y HTML en `public/` y `src/client/`.
- **Dominio:** normalización de riesgos y observaciones en `src/domain/`.
- **Proveedores:** adaptadores de fuentes externas en `src/providers/`.
- **Backend:** Cloudflare Worker en `src/worker/`.
- **Persistencia:** Cloudflare D1 y migraciones SQL en `migrations/`.
- **PWA:** manifiesto, iconos y service worker en `public/`.
- **Pruebas y herramientas:** `test/` y `scripts/`.

## Desarrollo local

Requisitos: Node.js compatible con las dependencias del proyecto y npm.

```bash
npm ci
npm run gate
```

La compuerta ejecuta comprobación sintáctica, lint, pruebas automatizadas y build. Para ejecutar tareas individuales:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

La ejecución local del Worker y el acceso a D1 pueden requerir configuración de Cloudflare y credenciales propias. No compartas secretos ni los agregues al repositorio.

## Estructura del repositorio

```text
docs/          Contratos, planes, autoridad y estrategia SEO
migrations/    Migraciones de base de datos
public/        Interfaz web, estilos, PWA y recursos públicos
scripts/       Build, validación, diagnóstico y mantenimiento
src/client/    Lógica de interfaz
src/domain/    Modelo y normalización de riesgos
src/providers/ Adaptadores de fuentes
src/worker/    API y lógica del Cloudflare Worker
test/          Pruebas automatizadas y fixtures
```

## Fuente de verdad y GitLab

GitHub `main` es la fuente canónica para código, ramas, revisiones y linaje de releases. GitLab es un espejo downstream: no desarrolles cambios independientes allí. Consulta [docs/REPOSITORY_AUTHORITY.md](docs/REPOSITORY_AUTHORITY.md).

## SEO y descubrimiento

La estrategia SEO está en [docs/SEO_STRATEGY.md](docs/SEO_STRATEGY.md). Incluye intención de búsqueda, metadatos, rastreo, enlaces canónicos y medición. El posicionamiento no puede garantizarse: requiere rastreo e indexación por buscadores y señales externas.

## Seguridad y uso responsable

- No publiques tokens, claves privadas, credenciales ni datos personales.
- No uses el radar como única fuente para decisiones de emergencia.
- Verifica avisos y recomendaciones directamente con los organismos oficiales.
- Reporta errores mediante [GitHub Issues](https://github.com/simondalmasso/Aphora/issues).

## Estado del proyecto

APHORA está desplegado públicamente y continúa en desarrollo. La disponibilidad de la aplicación no implica que todas las fuentes externas estén activas ni que cada evento esté confirmado.

## Licencia

No se declara una licencia en este README. Hasta que se añada un archivo de licencia explícito, no debe asumirse que el código puede reutilizarse bajo una licencia open source determinada.
