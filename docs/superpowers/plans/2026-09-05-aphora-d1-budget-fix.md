# APHORA D1 Budget Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce APHORA's own D1 row-read amplification, prove a deterministic 24h budget <=2.5M rows, preserve semantics, and freeze an exact predeploy artifact only after browser acceptance passes.

**Architecture:** Keep canonical D1 and all current product semantics. Measure and target only APHORA/sos-sf-hazard queries. Minimize scans by changing the hottest recurring reads to bounded/index-friendly forms and by avoiding duplicate public reads where one authoritative bounded read can serve the response. Validate with query-budget tests plus exact-dist browser acceptance.

**Tech Stack:** Cloudflare Workers, D1/SQLite, Node test runner, Playwright.

**Spec:** ORDER-032 user directive in current conversation.

## Global Constraints

USD_COST=0_HARD
NO production mutation before AUD exact-artifact pass.
No redesign, no backend semantics invention, no second database, no paid D1.
Canonical D1 remains sos-sf-hazard.
Target rows-read <=2,500,000/day; warning >=3,500,000; fail-closed >=4,000,000.

---

### Task 1: Baseline and failing budget regressions

**Files:**
- Create: `test/d1-budget.test.mjs`

**Interfaces:**
- Consumes current Worker SQL and cadence constants.
- Produces regression assertions for bounded rebuild, bounded retention, O(1) health, and 24h projected budget.

- [ ] Write static/behavioral tests that fail on current full-scan-prone SQL shapes.
- [ ] Run only `test/d1-budget.test.mjs` and confirm RED for the intended reasons.

### Task 2: Minimal D1 query fix

**Files:**
- Modify: `src/worker/runtime.js`
- Modify: `src/worker/ingestion.js`
- Modify: `src/worker/national.js` only if needed by failing tests.
- Create migration only if an actual missing index is proven by the query shape.

**Interfaces:**
- Preserve API response shapes and scheduler semantics.
- Produce bounded/index-friendly SQL for recurrent hot paths.

- [ ] Make the smallest production change that turns Task 1 GREEN.
- [ ] Run targeted tests.
- [ ] Run full typecheck/lint/tests.

### Task 3: Deterministic 24h workload proof

**Files:**
- Create: `scripts/d1-budget-24h.mjs`

**Interfaces:**
- Inputs: 288 cron opportunities plus deterministic public API/health/event-detail usage profile.
- Output: rows-read projection and per-query ranked contribution.

- [ ] Simulate the agreed 24h workload deterministically.
- [ ] Require total <=2.5M and all endpoint/scheduler semantic gates PASS.

### Task 4: Exact predeploy browser acceptance

**Files:**
- Reuse/parameterize QA acceptance runner outside production source.

**Interfaces:**
- Serve exact frozen candidate dist bytes.
- Validate required 320/390/412/768/1440 browser matrix and service-worker generation.

- [ ] Freeze source.
- [ ] Build once.
- [ ] Run exact-dist browser acceptance with console/network/cache-mix gates.

### Task 5: Exact artifact and custody

**Files:**
- Release manifests/evidence/package only.

- [ ] Compute source/dist/package hashes.
- [ ] Package once and verify gzip/tar/hash.
- [ ] Upload exact package/evidence to canonical Drive folder and read back exact package SHA.
- [ ] Return ARQ_PREAUD=PASS and AUD_GATE=PENDING without deploying.
