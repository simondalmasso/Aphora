# Pulso del Paraná — test summary

Pre-publication evidence on 2026-08-03, based on remote `102123ac47c26d091494fad8d1a4d5fc8b866b6b`:

- Typecheck: PASS
- ESLint: PASS
- Unit: PASS — 25 tests, including semantic SVG fallback and projection validation
- API contract: PASS — 9 tests
- Production build: PASS
- Initial JS budget: PASS — 74,520 B gzip / 122,880 B
- Dynamic Three.js visual budget: PASS — 129,597 B gzip / 184,320 B
- CSS budget: PASS — 7,018 B gzip / 25,600 B
- External fonts/trackers: NONE
- Local E2E assertions: PLATFORM-LIMITED before browser launch; Chromium download returned a truncated zero-byte archive. No product assertion was reclassified as passing.
- GitHub Actions E2E, screenshots, Wrangler dry-run, deployment and remote verification: PENDING NEW MANUAL RUN

The existing workflow remains `workflow_dispatch` only. Its new run is authoritative for desktop/mobile, SVG fallback, reduced motion, offline shell, screenshots, deployment and remote verification.
