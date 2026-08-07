#!/usr/bin/env bash
set -euo pipefail

export EVIDENCE_DIR="${EVIDENCE_DIR:-artifacts/order-020b-terminal-blocked}"
REPO="${GITHUB_REPOSITORY:?}"
BRANCH="arq/visual-dashboard-v3"
MAIN_SHA="45047d1c1e16941ea37967d67307d0ab17e85fad"
TAKE_SHA="4ef8b79f40f7c275db35aeb4f07eca74cf5245aa"
PRODUCT_FIX_SHA="0d214c590bb99d02017188ae51513a58ba293749"
DEPLOYED_PROVENANCE_SHA="8d507b13c521edf903ee364465ee7bc96a46e221"
BASELINE_D1="64f70d4b-a65f-4902-8bc7-10480f483284"
BASELINE_KV="1acad376c6a74ef4a4cea4fd95ace79a"
mkdir -p "$EVIDENCE_DIR/logs" "$EVIDENCE_DIR/gates" "$EVIDENCE_DIR/screenshots" /tmp/order020b-before

test "$(git branch --show-current)" = "$BRANCH"
git merge-base --is-ancestor "$TAKE_SHA" HEAD
git merge-base --is-ancestor "$PRODUCT_FIX_SHA" HEAD
git merge-base --is-ancestor "$DEPLOYED_PROVENANCE_SHA" HEAD
test "$(git rev-parse origin/main)" = "$MAIN_SHA"
test "$(git ls-remote origin "refs/heads/$BRANCH" | cut -f1)" = "$(git rev-parse HEAD)"

# Preserve the independent real-production baseline captured before the only 020-B deploy.
gh run download 31148204517 --repo "$REPO" -n sos-sf-order-020b-predeploy-truth -D /tmp/order020b-before
cp /tmp/order020b-before/production-predeploy-truth.json "$EVIDENCE_DIR/predeploy-rejected-truth.json"
cp /tmp/order020b-before/screenshots/predeploy-production-390x844.png "$EVIDENCE_DIR/screenshots/before-owner-rejected-390x844.png"

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

# Capture predecessor logs before terminal history cleanup and derive the exactly-one deployment fact.
mkdir -p "$EVIDENCE_DIR/predecessor-logs"
for run_id in 31148204517 31148648753 31148826915 31149423075 31149737503 31150030157 31150222001 31150351728; do
  gh run view "$run_id" --repo "$REPO" --log >"$EVIDENCE_DIR/predecessor-logs/run-$run_id.log" 2>&1 || true
done
bash .github/order020b/deployment-history.sh

# GET-only production and Cloudflare verification; no second deploy or runtime mutation is performed.
node .github/order020b-blocked/final-blocked.mjs

# Normalize visual evidence to the exact terminal names while preserving truthful FAIL semantics.
for size in 390x844 768x1024 1440x900; do
  mv "$EVIDENCE_DIR/screenshots/production-blocked-$size.png" "$EVIDENCE_DIR/screenshots/production-live-$size.png"
done
BASELINE_D1="$BASELINE_D1" BASELINE_KV="$BASELINE_KV" node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const dir=process.env.EVIDENCE_DIR;
const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const blackbox=JSON.parse(await readFile(`${dir}/production-blackbox.json`,'utf8'));
const controlled=JSON.parse(await readFile(`${dir}/state-screenshot-manifest.json`,'utf8'));
const cloudflare=JSON.parse(await readFile(`${dir}/cloudflare-runtime-readonly.json`,'utf8'));
const before=JSON.parse(await readFile(`${dir}/predeploy-rejected-truth.json`,'utf8'));
const controlledNames=['state-live','state-stale','state-active-alert','state-alerts-unverified','state-offline'];
const entries=[];
for(const name of controlledNames){const path=`${dir}/screenshots/${name}.png`;const bytes=await readFile(path);entries.push({name,kind:'CONTROLLED_TEST_STATE',path,sha256:hash(bytes),semantic:controlled[name]?.semantic??null});}
for(const view of blackbox.views){const name=`production-live-${view.viewport.width}x${view.viewport.height}`;const path=`${dir}/screenshots/${name}.png`;const bytes=await readFile(path);entries.push({name,kind:'PRODUCTION_REAL_FAIL',path,sha256:hash(bytes),semantic:'API_HAS_USABLE_INA_HYDROMETRY_BUT_UI_REJECTS_SNAPSHOT'});}
{const name='before-owner-rejected-390x844';const path=`${dir}/screenshots/${name}.png`;const bytes=await readFile(path);entries.push({name,kind:'REJECTED_BASELINE_REAL_PRODUCTION',path,sha256:hash(bytes),semantic:'PRE_020B_PRODUCTION_BASELINE',snapshotId:before.snapshotId??null});}
const semanticNames=['state-stale','state-active-alert','state-alerts-unverified'];
const semanticHashes=semanticNames.map(name=>entries.find(e=>e.name===name)?.sha256).filter(Boolean);
const controlledHashGate=semanticHashes.length===semanticNames.length&&new Set(semanticHashes).size===semanticHashes.length?'PASS':'FAIL';
const required=['production-live-390x844','production-live-768x1024','production-live-1440x900','state-stale','state-active-alert','state-alerts-unverified','state-offline','before-owner-rejected-390x844'];
const setComplete=required.every(name=>entries.some(e=>e.name===name));
await writeFile(`${dir}/screenshot-manifest.json`,JSON.stringify({generatedAt:new Date().toISOString(),setComplete,hashGate:controlledHashGate,hashGateScope:semanticNames,semanticGate:'FAIL',productionSemanticGate:'FAIL_API_UI_INCONSISTENT',entries},null,2)+'\n');
const budgets={390:2.4,768:1.9,1440:1.35};
const metrics=blackbox.views.map(v=>({viewport:v.viewport,horizontalOverflow:v.ui.horizontalOverflow,scrollRatio:v.ui.scrollRatio,maxScrollRatio:budgets[v.viewport.width],viewportBudgetPass:v.ui.horizontalOverflow<=1&&v.ui.scrollRatio<=budgets[v.viewport.width],snapshotId:v.ui.snapshotId,hasChart:v.ui.hasChart,levelText:v.ui.levelText,sourceText:v.ui.sourceText}));
await writeFile(`${dir}/viewport-metrics.json`,JSON.stringify(metrics,null,2)+'\n');
const d1Preserved=cloudflare.d1?.uuid===process.env.BASELINE_D1;
const kvPreserved=cloudflare.kv?.id===process.env.BASELINE_KV;
const r2Absent=cloudflare.r2Present===false;
await writeFile(`${dir}/free-resource-preservation.json`,JSON.stringify({baselineEvidence:{order020ArtifactId:8980599861,order020ArtifactSha256:'f8b4268fb08fc29e12dba2badcc9439a900bcb7cf7712f6d390a1a172ea34616',d1DatabaseId:process.env.BASELINE_D1,kvNamespaceId:process.env.BASELINE_KV},current:{d1DatabaseId:cloudflare.d1?.uuid??null,kvNamespaceId:cloudflare.kv?.id??null,r2Present:cloudflare.r2Present},D1_FREE:d1Preserved?'PRESERVED':'DRIFT',KV_FREE:kvPreserved?'PRESERVED':'DRIFT',R2:r2Absent?'ABSENT':'PRESENT'},null,2)+'\n');
if(!setComplete||controlledHashGate!=='PASS'||!d1Preserved||!kvPreserved||!r2Absent)process.exit(1);
NODE

# Third-party runner/action warnings are kept separate from project lint.
grep -hEi 'warning|deprecated|deprecation' "$EVIDENCE_DIR"/predecessor-logs/*.log >"$EVIDENCE_DIR/toolchain-warnings.txt" || true

# Preserve compact current-head equivalence proof before .github-only terminal disarm.
git diff --name-status "$DEPLOYED_PROVENANCE_SHA" HEAD >"$EVIDENCE_DIR/deployed-to-precleanup-head.diff-names.txt"
node --input-type=module <<'NODE'
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const dir=process.env.EVIDENCE_DIR;
const changed=execFileSync('git',['diff','--name-only','8d507b13c521edf903ee364465ee7bc96a46e221','HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const operational=changed.filter((p)=>!p.startsWith('.github/'));
await writeFile(`${dir}/precleanup-head-equivalence.json`,JSON.stringify({deployedProvenanceCommit:'8d507b13c521edf903ee364465ee7bc96a46e221',precleanupHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),changedPaths:changed,operationalChangedPaths:operational,result:operational.length===0?'PASS':'FAIL'},null,2)+'\n');
if(operational.length)process.exit(1);
NODE
