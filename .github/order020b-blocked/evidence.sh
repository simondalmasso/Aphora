#!/usr/bin/env bash
set -euo pipefail

export EVIDENCE_DIR="${EVIDENCE_DIR:-artifacts/order-020b-terminal-blocked}"
REPO="${GITHUB_REPOSITORY:?}"
BRANCH="arq/visual-dashboard-v3"
MAIN_SHA="45047d1c1e16941ea37967d67307d0ab17e85fad"
TAKE_SHA="4ef8b79f40f7c275db35aeb4f07eca74cf5245aa"
PRODUCT_FIX_SHA="0d214c590bb99d02017188ae51513a58ba293749"
DEPLOYED_PROVENANCE_SHA="8d507b13c521edf903ee364465ee7bc96a46e221"
mkdir -p "$EVIDENCE_DIR/logs" "$EVIDENCE_DIR/gates" "$EVIDENCE_DIR/screenshots"

test "$(git branch --show-current)" = "$BRANCH"
git merge-base --is-ancestor "$TAKE_SHA" HEAD
git merge-base --is-ancestor "$PRODUCT_FIX_SHA" HEAD
git merge-base --is-ancestor "$DEPLOYED_PROVENANCE_SHA" HEAD
test "$(git rev-parse origin/main)" = "$MAIN_SHA"
test "$(git ls-remote origin "refs/heads/$BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"

# Fresh, non-production-mutating terminal project gates.
bash .github/order020b/run-gate.sh repo-security node --input-type=module -e "import{readFile}from'node:fs/promises';import{execFileSync}from'node:child_process';const ps=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\\0').filter(Boolean);const bad=[];for(const p of ps){if(p.startsWith('artifacts/')||p.startsWith('docs/'))continue;let t='';try{t=await readFile(p,'utf8')}catch{continue}for(const [id,re] of [['PRIVATE_KEY',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],['AWS_KEY',/AKIA[0-9A-Z]{16}/g],['EVAL',/\\beval\\s*\\(/g],['NEW_FUNCTION',/new\\s+Function\\s*\\(/g]]){const n=[...t.matchAll(re)].length;if(n)bad.push({p,id,n})}}if(bad.length){console.error(JSON.stringify(bad,null,2));process.exit(1)}console.log('executable static security flags: 0')"
bash .github/order020b/run-gate.sh dependency-audit npm audit --audit-level=high
cp "$EVIDENCE_DIR/logs/dependency-audit.log" "$EVIDENCE_DIR/dependency-audit.txt"
bash .github/order020b/run-gate.sh typecheck npm run typecheck
bash .github/order020b/run-gate.sh lint npx eslint . --max-warnings=0 --ignore-pattern '.github/**'
bash .github/order020b/run-gate.sh unit npm run test:unit
bash .github/order020b/run-gate.sh contract npm run test:contract
bash .github/order020b/run-gate.sh build npm run build
bash .github/order020b/run-gate.sh worker npm run test:worker
bash .github/order020b/run-gate.sh e2e npm run test:e2e
bash .github/order020b/run-gate.sh accessibility npx playwright test -g "chart supports keyboard reading|skip link is hidden|alert feed failure"
bash .github/order020b/run-gate.sh offline npx playwright test -g "offline keeps the cached hydrometric surface"
bash .github/order020b/run-gate.sh source-freshness-fallback bash -lc "npm run test:unit && node scripts/revalidate-public-sources.mjs"
bash .github/order020b/run-gate.sh performance node scripts/verify-build.mjs
bash .github/order020b/run-gate.sh security-endpoints node .github/order020b/security-gate.mjs

# Preserve the same-run client-domain rejection as diagnostic evidence. Failure is expected and asserted.
set +e
npx vitest run .github/order020b/validation-diagnostic.test.ts --reporter=verbose >"$EVIDENCE_DIR/production-validator.log" 2>&1
validator_code=$?
set -e
cat "$EVIDENCE_DIR/production-validator.log"
test "$validator_code" -ne 0
grep -F 'VALIDATION_ERROR snapshot.timeline[2].url inválido' "$EVIDENCE_DIR/production-validator.log" >/dev/null
grep -F '"id": "ina-waterml-parana"' "$EVIDENCE_DIR/production-validator.log" >/dev/null
grep -F '"url": ""' "$EVIDENCE_DIR/production-validator.log" >/dev/null

# Capture all predecessor 020-B logs before terminal history cleanup and derive the exactly-one deploy fact.
mkdir -p "$EVIDENCE_DIR/predecessor-logs"
for run_id in 31148204517 31148648753 31148826915 31149423075 31149737503 31150030157 31150222001 31150351728; do
  gh run view "$run_id" --repo "$REPO" --log >"$EVIDENCE_DIR/predecessor-logs/run-$run_id.log" 2>&1 || true
done
bash .github/order020b/deployment-history.sh

# The continuation is GET-only. This verifier records real production, Cloudflare read state, screenshots and blocker derivation.
node .github/order020b-blocked/final-blocked.mjs

# Third-party runner/action warnings are kept separate from project lint.
grep -hEi 'warning|deprecated|deprecation' "$EVIDENCE_DIR"/predecessor-logs/*.log >"$EVIDENCE_DIR/toolchain-warnings.txt" || true

# Preserve a compact current-head diff/provenance proof before .github-only disarm.
git diff --name-status "$DEPLOYED_PROVENANCE_SHA" HEAD >"$EVIDENCE_DIR/deployed-to-precleanup-head.diff-names.txt"
node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const dir=process.env.EVIDENCE_DIR;
const changed=execFileSync('git',['diff','--name-only','8d507b13c521edf903ee364465ee7bc96a46e221','HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const operational=changed.filter((p)=>!p.startsWith('.github/'));
await writeFile(`${dir}/precleanup-head-equivalence.json`,JSON.stringify({deployedProvenanceCommit:'8d507b13c521edf903ee364465ee7bc96a46e221',precleanupHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),changedPaths:changed,operationalChangedPaths:operational,result:operational.length===0?'PASS':'FAIL'},null,2)+'\n');
if(operational.length)process.exit(1);
NODE
