# V1 test summary

Local pre-publish evidence on 2026-08-02:

- Typecheck: PASS
- ESLint: PASS
- Unit: PASS — 15 tests
- API contract: PASS — 7 tests
- Production build: PASS
- Performance budgets: PASS — 67,155 B JS gzip; 4,552 B CSS gzip
- Local E2E: platform-limited before browser launch; Playwright Chromium download failed five times because the execution proxy returned certificate/time errors. No product assertion ran or was reclassified as passing.
- GitHub Actions E2E: pending first workflow dispatch; workflow installs Chromium and produces both screenshots.
- Local Wrangler dry-run: platform command approval blocked; required CI step remains mandatory.

The Actions artifact is authoritative for E2E, dry-run, deployment and remote verification.
