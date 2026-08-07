#!/usr/bin/env bash
set -euo pipefail

BRANCH="arq/visual-dashboard-v3"
MAIN_SHA="45047d1c1e16941ea37967d67307d0ab17e85fad"
TAKE_SHA="4ef8b79f40f7c275db35aeb4f07eca74cf5245aa"
PRODUCT_FIX_SHA="0d214c590bb99d02017188ae51513a58ba293749"
DEPLOYED_PROVENANCE_SHA="8d507b13c521edf903ee364465ee7bc96a46e221"
EVIDENCE_DIR="${EVIDENCE_DIR:-artifacts/order-020b-terminal}"
export EVIDENCE_DIR

# No Cloudflare mutation is permitted in this continuation.
test "$(git branch --show-current)" = "$BRANCH"
git merge-base --is-ancestor "$TAKE_SHA" HEAD
git merge-base --is-ancestor "$PRODUCT_FIX_SHA" HEAD
git merge-base --is-ancestor "$DEPLOYED_PROVENANCE_SHA" HEAD
test "$(git rev-parse origin/main)" = "$MAIN_SHA"
test "$(git ls-remote origin "refs/heads/$BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"

mkdir -p "$EVIDENCE_DIR/screenshots" node_modules/.tmp /tmp/order020b-before
cp .github/order020b/terminal.mjs node_modules/.tmp/order020b-terminal.mjs
cp .github/order020b/checkpoint.mjs node_modules/.tmp/order020b-checkpoint.mjs
python .github/order020b/harden-terminal.py
node --check node_modules/.tmp/order020b-terminal.mjs
node --check node_modules/.tmp/order020b-checkpoint.mjs

# Preserve the independently captured rejected production baseline from before the only deploy.
gh run download 31148204517 --repo "$GITHUB_REPOSITORY" -n sos-sf-order-020b-predeploy-truth -D /tmp/order020b-before
cp /tmp/order020b-before/production-predeploy-truth.json "$EVIDENCE_DIR/predeploy-rejected-truth.json"
cp /tmp/order020b-before/screenshots/predeploy-production-390x844.png "$EVIDENCE_DIR/screenshots/before-owner-rejected-390x844.png"

# Review every tracked file from the current synchronized effective head.
node node_modules/.tmp/order020b-terminal.mjs review
bash .github/order020b/run-gate.sh repo-security node --input-type=module -e "import{readFile}from'node:fs/promises';const m=JSON.parse(await readFile(process.env.EVIDENCE_DIR+'/code-review-manifest.json'));const bad=m.flatMap(e=>['HISTORICAL_ARTIFACT','DOCUMENTATION'].includes(e.category)?[]:e.review_evidence.staticFlags.filter(f=>['HARDCODED_PRIVATE_KEY','AWS_KEY_SHAPE','EVAL','NEW_FUNCTION','EXTENSIONLESS_RELATIVE_IMPORT'].includes(f.id)).map(f=>({path:e.path,...f})));if(bad.length){console.error(JSON.stringify(bad,null,2));process.exit(1)}console.log('executable static security flags: 0')"

# Fresh current-head verification matrix. These are all non-mutating with respect to production.
bash .github/order020b/run-gate.sh dependency-audit npm audit --audit-level=high
cp "$EVIDENCE_DIR/logs/dependency-audit.log" "$EVIDENCE_DIR/dependency-audit.txt"
bash .github/order020b/run-gate.sh typecheck npm run typecheck
bash .github/order020b/run-gate.sh lint npx eslint . --max-warnings=0 --ignore-pattern '.github/order020b/**'
bash .github/order020b/run-gate.sh unit npm run test:unit
bash .github/order020b/run-gate.sh contract npm run test:contract
bash .github/order020b/run-gate.sh build npm run build
bash .github/order020b/run-gate.sh worker npm run test:worker
bash .github/order020b/run-gate.sh e2e npm run test:e2e
bash .github/order020b/run-gate.sh accessibility npx playwright test -g "chart supports keyboard reading|skip link is hidden|alert feed failure"
bash .github/order020b/run-gate.sh offline npx playwright test -g "offline keeps the cached hydrometric surface"
bash .github/order020b/run-gate.sh source-freshness-fallback bash -lc "npm run test:unit && node scripts/revalidate-public-sources.mjs"
bash .github/order020b/run-gate.sh performance node scripts/verify-build.mjs

# Derive exactly-one deployment evidence from the predecessor terminal runs. This script never deploys.
bash .github/order020b/deployment-history.sh

# GET-only live verification of the already deployed product, source taxonomy and Cloudflare bindings.
node node_modules/.tmp/order020b-terminal.mjs production
bash .github/order020b/run-gate.sh security-endpoints node .github/order020b/security-gate.mjs

# Re-run complete static manifest after all evidence-only checks; no product file has changed.
node node_modules/.tmp/order020b-terminal.mjs review

# Remove every workflow, trigger, temporary script and historical completed run.
TEMP_WORKFLOW_PATH="order-020b-postdeploy-close.yml" GH_TOKEN="${GH_TOKEN:?}" bash .github/order020b/cleanup.sh

# Prove final terminal product bytes are identical to this continuation's tested product bytes.
changed="$(git diff --name-only "$GITHUB_SHA" HEAD -- . ':(exclude).github/**')"
test -z "$changed"
node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const governance = JSON.parse(await readFile(process.env.EVIDENCE_DIR + '/workflow-registry-final.json', 'utf8'));
await writeFile(process.env.EVIDENCE_DIR + '/head-equivalence.json', JSON.stringify({
  testedHeadSha: process.env.GITHUB_SHA,
  terminalHeadSha: governance.terminalSha,
  operationalDifferences: [],
  result: 'PASS',
}, null, 2) + '\n');
NODE

# Evidence-derived final matrices, screenshot semantic/hash gates and auto-ROAST.
node node_modules/.tmp/order020b-terminal.mjs finalize
