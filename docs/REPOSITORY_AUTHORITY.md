# Repository authority

Canonical source: https://github.com/simondalmasso/Aphora

Downstream mirror: https://gitlab.com/simondalmasso/aphora

Rules:

- GitHub is the only source of truth for code, branches, tags, reviews, and release lineage.
- GitLab is a downstream mirror. Do not author independent code changes there.
- The pre-migration GitHub main is preserved at archive/pre-aphora-migration-2026-09-25.
- Mirror automation must never deploy production. Deployment remains subject to APHORA AUD gates.
- Product secrets are never committed. Mirror credentials belong only in credential stores / CI secrets.
- A mirror success means ref parity, not product acceptance.
