# APHORA performance optimization report

Date: 2026-10-21
Scope: client startup, map layers, saved-zone status, source catalog, and D1 read round-trips.

## Measurements

| Metric | Before | Candidate build | Change |
|---|---:|---:|---:|
| Main JavaScript decoded size | 72,074 B | 51,026 B | -29.2% |
| All JavaScript, including deferred map and zones modules | 72,074 B monolith | 62,857 B | -12.8% |
| Initial CSS decoded size | 37,460 B | 37,460 B | unchanged |
| Source-catalog JSON body | 60,728 B | 10,897 B | -82.1% |
| Initial API requests | 4 | 3 | -25% |
| Zone status requests for 12 saved zones | up to 12 | 1 batch request | -91.7% |

The before values are from the production browser/API baseline captured before this change. Candidate bundle sizes are from the local minified build; production values must be checked again after deployment.

## Changes made

1. Split the map and saved-zone views into versioned ES modules. They are imported only when the corresponding view opens. The service worker precaches the versioned chunks for offline use.
2. Added esbuild minification to the build output. Source files remain readable; generated dist/public assets are minified and measured during each build.
3. Removed the source catalog from the initial overview request path. The /api/sources?view=capabilities endpoint returns the 13-entry capability registry without the unused legacy snapshot and sets Cache-Control: public, max-age=15, stale-while-revalidate=45.
4. Added POST /api/events/batch for up to 12 saved zones. It reads the active event set once and groups results by each zone's bounding box. This removes per-zone request fan-out.
5. Grouped the durable overview and event reads into D1 batches after the heartbeat check. Overview reads use one batch of three SELECT statements; event-list/detail reads use one batch for event data and verification. The SQL reads remain bounded; the improvement is fewer D1 round-trips, not fewer logical SELECTs.
6. Cached NASA GIBS time metadata per selected product and avoid resetting unchanged map image URLs. Map role filters update markers without reloading unchanged base/risk/satellite images.
7. Reduced Argenmap image request width to the rendered map size (capped at 900 px), added asynchronous image decoding, and declared the existing SVG icon as the favicon. No external web-font requests are introduced.

## Verification

- npm run gate: 279 tests passed, 0 failed; build completed.
- npm audit --omit=dev: 0 production dependency vulnerabilities.
- Playwright + axe smoke test: 320×568, 390×844, 768×1024, 1440×900; no horizontal overflow, 0 serious/critical accessibility violations.
- Deep browser interactions at 390×844 and 1440×900: all map-role filters, every risk-layer option, every NASA product option, all pan/zoom controls, source catalog and refresh, saved-zone create/remove/open, event details, verification details, manual search, explicit geolocation, push buttons, and the four list filters.
- Request assertions: no initial source-catalog call; map and zones chunks load only on demand; one batch request serves multiple saved zones; role filters do not reload unchanged map images; GIBS metadata is reused during pan/zoom; no console/page errors or failed requests in the fixture-based browser run.

The Playwright suite intercepts API and map-provider traffic with deterministic fixtures. It verifies the UI flow and request behavior, not the truth or freshness of live provider data. Live production checks are a separate deployment acceptance step.
