#!/usr/bin/env bash
set -euo pipefail

BRANCH="arq/visual-dashboard-v3"
MAIN_SHA="45047d1c1e16941ea37967d67307d0ab17e85fad"
TAKE_SHA="4ef8b79f40f7c275db35aeb4f07eca74cf5245aa"
PRODUCT_FIX_SHA="0d214c590bb99d02017188ae51513a58ba293749"
EVIDENCE_DIR="${EVIDENCE_DIR:-artifacts/order-020b-terminal}"
export EVIDENCE_DIR

# Immutable authority and exact remote-head guard.
test "$(git branch --show-current)" = "$BRANCH"
git merge-base --is-ancestor "$TAKE_SHA" HEAD
git merge-base --is-ancestor "$PRODUCT_FIX_SHA" HEAD
test "$(git rev-parse origin/main)" = "$MAIN_SHA"
test "$(git ls-remote origin "refs/heads/$BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"

mkdir -p "$EVIDENCE_DIR/screenshots" node_modules/.tmp
cp .github/order020b/terminal.mjs node_modules/.tmp/order020b-terminal.mjs
cp .github/order020b/checkpoint.mjs node_modules/.tmp/order020b-checkpoint.mjs
python .github/order020b/harden-terminal.py
node --check node_modules/.tmp/order020b-terminal.mjs
node --check node_modules/.tmp/order020b-checkpoint.mjs

# Same-run semantic production truth: this suborder is allowed one deploy only because
# production API has usable hydrometry while the current UI fails to consume it.
node .github/order020b/predeploy.mjs
cp "$EVIDENCE_DIR/screenshots/predeploy-production-390x844.png" "$EVIDENCE_DIR/screenshots/before-owner-rejected-390x844.png"
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises';
const p = JSON.parse(await readFile(process.env.EVIDENCE_DIR + '/production-predeploy-truth.json', 'utf8'));
if (!(p.productBug === true && p.apiHasUsable === true && p.uiMatched === false)) {
  console.error(JSON.stringify(p, null, 2));
  process.exit(1);
}
NODE

# Full tracked-file review and executable static-security gate.
node node_modules/.tmp/order020b-terminal.mjs review
bash .github/order020b/run-gate.sh repo-security node --input-type=module -e "import{readFile}from'node:fs/promises';const m=JSON.parse(await readFile(process.env.EVIDENCE_DIR+'/code-review-manifest.json'));const bad=m.flatMap(e=>['HISTORICAL_ARTIFACT','DOCUMENTATION'].includes(e.category)?[]:e.review_evidence.staticFlags.filter(f=>['HARDCODED_PRIVATE_KEY','AWS_KEY_SHAPE','EVAL','NEW_FUNCTION','EXTENSIONLESS_RELATIVE_IMPORT'].includes(f.id)).map(f=>({path:e.path,...f})));if(bad.length){console.error(JSON.stringify(bad,null,2));process.exit(1)}console.log('executable static security flags: 0')"

# Terminal verification matrix. Every gate writes its own exit-code manifest.
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

# Resolve only pre-existing Free D1/KV resources, bind final provenance, and rebuild exact bytes.
node node_modules/.tmp/order020b-terminal.mjs prepare-deploy
npm run build

test "$(git ls-remote origin "refs/heads/$BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"
test "$(git rev-parse origin/main)" = "$MAIN_SHA"

# The one and only Cloudflare mutation in 020-B.
bash .github/order020b/run-gate.sh deployment npx wrangler deploy --config wrangler.generated.jsonc

# Workers-first provenance synchronization: this does not redeploy.
git add public/source-provenance.json
git diff --cached --check
git config user.name sos-sf-automation
git config user.email sos-sf-automation@users.noreply.github.com
git commit -m 'chore: synchronize 020-B deployed provenance'
git push origin "HEAD:$BRANCH"

# Same-run real production proof and source taxonomy.
node node_modules/.tmp/order020b-terminal.mjs production
bash .github/order020b/run-gate.sh security-endpoints node .github/order020b/security-gate.mjs
node node_modules/.tmp/order020b-terminal.mjs review

# Terminally remove every workflow/trigger/temporary runtime and completed historical run.
GH_TOKEN="${GH_TOKEN:?}" bash .github/order020b/cleanup.sh

# The only non-.github difference after the tested trigger head is deployment provenance.
changed="$(git diff --name-only "$GITHUB_SHA" HEAD -- . ':(exclude).github/**' ':(exclude)public/source-provenance.json')"
test -z "$changed"
node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const governance = JSON.parse(await readFile(process.env.EVIDENCE_DIR + '/workflow-registry-final.json', 'utf8'));
await writeFile(process.env.EVIDENCE_DIR + '/head-equivalence.json', JSON.stringify({
  testedHeadSha: process.env.GITHUB_SHA,
  terminalHeadSha: governance.terminalSha,
  operationalDifferencesExcludingProvenance: [],
  result: 'PASS',
}, null, 2) + '\n');
NODE

# Derive final findings, screenshots, warnings, roast, and gate matrix from evidence.
node node_modules/.tmp/order020b-terminal.mjs finalize
