# V1 test summary

Final evidence for `SOS-SF-HUMAN-ARQ-WEBAPP-V1-ONE-SHOT-001` on 2026-08-02/03:

- Typecheck: PASS
- ESLint: PASS
- Unit: PASS — 23 tests
- API contract: PASS — 9 tests
- Production build: PASS
- Performance budgets: PASS — 70,585 B JS gzip; 5,650 B CSS gzip
- GitHub Actions E2E: PASS — 11 passed, 1 expected desktop skip for a mobile-only assertion
- Offline shell E2E: PASS on desktop and mobile, unchanged assertion
- Screenshots: PASS — `artifacts/v1/screenshots/desktop.png` and `mobile.png`
- Wrangler dry-run: PASS
- Cloudflare Workers deployment: PASS
- CI remote verification: PASS — health, dashboard, lite, snapshot and manifest
- Independent post-run remote verification: PASS

Local Playwright execution remained platform-limited because this workspace could not download Chromium; no local browser assertion was represented as passing. GitHub Actions installed Chromium and is the authoritative browser evidence: run `30780029104`, artifact `8843336040`.
