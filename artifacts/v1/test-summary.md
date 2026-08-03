# V1 test summary

Local pre-publish evidence on 2026-08-02 after `OWNER_UI_MESSAGING_OVERRIDE_001.md`:

- Typecheck: PASS
- ESLint: PASS
- Unit: PASS — 23 tests (including Google claim/signature/session validation, authorization, isolation, idempotency, dual rate limits, TTL and defensive input)
- API contract: PASS — 9 tests (including public-without-login and private-disabled/no-store contracts)
- Production build: PASS
- Performance budgets: PASS — 70,260 B JS gzip; 5,650 B CSS gzip
- Local E2E: platform-limited before browser launch; Playwright Chromium download failed five times because the execution proxy returned certificate/time errors. No product assertion ran or was reclassified as passing.
- GitHub Actions E2E: pending first workflow dispatch; workflow installs Chromium and produces both screenshots.
- Local Wrangler dry-run: platform command approval blocked; required CI step remains mandatory.

The Actions artifact is authoritative for E2E, dry-run, deployment and remote verification.
