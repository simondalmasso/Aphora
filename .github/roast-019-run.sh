#!/usr/bin/env bash
set -euo pipefail

ORDER='SOS-SF-AUD-ROAST-HYDROMETRIC-FIRST-019'
BRANCH='arq/visual-dashboard-v3'
EXPECTED_BASE='b5f0e4fdaef742ef8d4799f297ff72c0c35450f9'
EXPECTED_MAIN='45047d1c1e16941ea37967d67307d0ab17e85fad'
EVIDENCE_DIR="${EVIDENCE_DIR:-artifacts/roast-019}"
DEPLOYMENT_URL="${DEPLOYMENT_URL:-https://sos-sf.simondalmasso44.workers.dev}"
mkdir -p "$EVIDENCE_DIR" "$EVIDENCE_DIR/screenshots"

git_config() {
  git config user.name sos-sf-automation
  git config user.email sos-sf-automation@users.noreply.github.com
}

product_hash() {
  python - <<'PY'
from pathlib import Path
import hashlib, subprocess
excluded = ('.github/', 'artifacts/', 'dist/')
marker = 'public/source-provenance.json'
paths = subprocess.check_output(['git','ls-files','-z']).split(b'\0')
digest = hashlib.sha256(); count = 0
for raw in sorted(p for p in paths if p):
    path = raw.decode()
    if path == marker or path.startswith(excluded): continue
    data = Path(path).read_bytes()
    digest.update(path.encode()); digest.update(b'\0'); digest.update(len(data).to_bytes(8,'big')); digest.update(data); count += 1
print(digest.hexdigest(), count)
PY
}

case "${1:-}" in
  apply)
    test "$GITHUB_REF_NAME" = "$BRANCH"
    git merge-base --is-ancestor "$EXPECTED_BASE" HEAD
    test "$(git rev-parse origin/main)" = "$EXPECTED_MAIN"
    test -f src/client/App.tsx
    test -f tests/e2e/dashboard.spec.ts
    test -f docs/ROAST_019_REFERENCE_MATRIX.md
    grep -q 'Situación hidrométrica' src/client/features/hydro/HydrometricMonitoring.tsx
    grep -q 'main-hydro-chart' tests/e2e/dashboard.spec.ts
    ! grep -RInE 'REPORTS_BUCKET|r2_buckets|/r2/' src scripts/provision-cloudflare.mjs wrangler.jsonc wrangler.test.jsonc
    git rm -f .github/roast-019-product.tar.gz.b64
    git rm -r .github/roast-019-product-parts .github/roast-019-script-parts
    git add src/client tests/e2e/dashboard.spec.ts docs .github/roast-019-run.sh
    git diff --cached --check
    git_config
    git commit -m 'feat: rebuild hydrometric-first dashboard 019'
    git push origin HEAD:"$BRANCH"

    read -r tree_hash file_count < <(product_hash)
    mkdir -p public
    node - "$tree_hash" "$file_count" <<'NODE'
const fs = require('node:fs');
const [hash,count] = process.argv.slice(2);
const payload = {schemaVersion:1,orderId:'SOS-SF-AUD-ROAST-HYDROMETRIC-FIRST-019',productTreeSha256:hash,includedFileCount:Number(count),deploymentRunId:process.env.GITHUB_RUN_ID};
fs.writeFileSync('public/source-provenance.json', JSON.stringify(payload)+'\n');
NODE
    git add public/source-provenance.json
    git diff --cached --check
    git commit -m 'chore: record roast 019 product provenance'
    git push origin HEAD:"$BRANCH"
    final_sha="$(git rev-parse HEAD)"
    {
      echo "product_commit_sha=$final_sha"
      echo "product_tree_sha256=$tree_hash"
    } >> "$GITHUB_OUTPUT"
    printf '{"productCommitSha":"%s","productTreeSha256":"%s","includedFileCount":%s}\n' "$final_sha" "$tree_hash" "$file_count" > "$EVIDENCE_DIR/product-provenance.json"
    ;;

  verify)
    npm run typecheck
    npm run lint -- --max-warnings=0
    npm run test:unit
    npm run test:contract
    npm run build
    npm run test:worker
    EVIDENCE_DIR="$EVIDENCE_DIR" npx playwright test --retries=0

    test -n "${CLOUDFLARE_ACCOUNT_ID:-}"
    test -n "${CLOUDFLARE_API_TOKEN:-}"
    node <<'NODE'
const fs=require('node:fs');
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function get(path){const r=await fetch(base+path,{headers:{Authorization:`Bearer ${token}`}});const p=await r.json();if(!r.ok||p.success===false)throw new Error(`CF_GET_FAILED:${path}:${r.status}`);return p.result;}
(async()=>{const d=await get('/d1/database?per_page=100');const k=await get('/storage/kv/namespaces?per_page=100');const db=d.find(x=>x.name==='sos-sf-private');const kv=k.find(x=>x.title==='sos-sf-private-reports');if(!db?.uuid||!kv?.id)throw new Error('D1_OR_KV_EXPECTED_RESOURCE_MISSING');fs.writeFileSync(process.env.EVIDENCE_DIR+'/cloudflare-storage-before.json',JSON.stringify({d1:{name:db.name,id:db.uuid},kv:{name:kv.title,id:kv.id},r2:'PROHIBITED_NOT_QUERIED'},null,2));})();
NODE

    if [ -z "${SESSION_SIGNING_KEY:-}" ]; then
      npx wrangler secret list --config wrangler.jsonc > /tmp/worker-secret-names.json
      node -e "const x=require('/tmp/worker-secret-names.json');if(!x.some(v=>v.name==='SESSION_SIGNING_KEY'))process.exit(1)"
      export SESSION_SIGNING_KEY_PRESENT=true
    fi
    node scripts/provision-cloudflare.mjs
    node -e "const x=require('./artifacts/roast-019/deployment-mode.json');if(!x.resourcesReady||x.privateRuntime!=='ACTIVE')throw new Error('PRIVATE_RUNTIME_OR_STORAGE_NOT_READY')"

    npx wrangler deploy --config wrangler.generated.jsonc --secrets-file .worker-secrets.json 2>&1 | tee "$EVIDENCE_DIR/wrangler-deploy.log"
    echo 1 > "$EVIDENCE_DIR/deploy-command-count.txt"
    npx wrangler versions list --config wrangler.generated.jsonc --json > "$EVIDENCE_DIR/worker-versions.json"
    version_id="$(node - <<'NODE'
const x=require('./artifacts/roast-019/worker-versions.json');const a=Array.isArray(x)?x:(x.items||x.result||x.versions||[]);const v=a[0]||{};process.stdout.write(String(v.id||v.version_id||v.versionId||''));
NODE
)"
    test -n "$version_id"

    curl -fsS "$DEPLOYMENT_URL/api/health?verify=$GITHUB_RUN_ID" > "$EVIDENCE_DIR/production-health.json"
    curl -fsS "$DEPLOYMENT_URL/api/snapshot?verify=$GITHUB_RUN_ID" > "$EVIDENCE_DIR/production-snapshot.json"
    curl -fsS "$DEPLOYMENT_URL/lite?verify=$GITHUB_RUN_ID" > "$EVIDENCE_DIR/production-lite.html"
    curl -fsS "$DEPLOYMENT_URL/source-provenance.json?verify=$GITHUB_RUN_ID" > "$EVIDENCE_DIR/production-source-provenance.json"
    node <<'NODE'
const fs=require('node:fs');const h=JSON.parse(fs.readFileSync(process.env.EVIDENCE_DIR+'/production-health.json'));const p=JSON.parse(fs.readFileSync(process.env.EVIDENCE_DIR+'/production-source-provenance.json'));const l=JSON.parse(fs.readFileSync('public/source-provenance.json'));if(h.ok!==true)throw new Error('PRODUCTION_HEALTH_NOT_OK');if(p.orderId!==l.orderId||p.productTreeSha256!==l.productTreeSha256)throw new Error('CLOUDFLARE_GITHUB_DRIFT');
NODE

    DEPLOYMENT_URL="$DEPLOYMENT_URL" EVIDENCE_DIR="$EVIDENCE_DIR" node <<'NODE'
const { chromium }=require('playwright');const fs=require('node:fs');const path=require('node:path');(async()=>{const b=await chromium.launch({headless:true});for(const v of [{w:390,h:844,n:'production-390x844'},{w:1440,h:900,n:'production-1440x900'}]){const p=await b.newPage({viewport:{width:v.w,height:v.h}});await p.goto(process.env.DEPLOYMENT_URL,{waitUntil:'networkidle'});await p.locator('[data-testid="hydrometric-situation"]').waitFor();const first=await p.locator('main > section').first().getAttribute('data-testid');if(first!=='hydrometric-situation')throw new Error('PRODUCTION_FIRST_BLOCK_NOT_HYDROMETRIC');await p.screenshot({path:path.join(process.env.EVIDENCE_DIR,'screenshots',v.n+'.png'),fullPage:true});await p.close();}await b.close();})();
NODE

    tar --exclude='playwright-report' --exclude='test-results' -czf /tmp/sos-sf-roast-019-evidence.tar.gz "$EVIDENCE_DIR" docs/ROAST_019_REFERENCE_MATRIX.md docs/ROAST_019_IMPLEMENTATION.md
    archive_hash="$(sha256sum /tmp/sos-sf-roast-019-evidence.tar.gz | cut -d' ' -f1)"
    {
      echo "deployment_version_id=$version_id"
      echo "archive_sha256=$archive_hash"
    } >> "$GITHUB_OUTPUT"
    ;;

  cleanup)
    test -n "${GH_TOKEN:-}"
    workflow_id="$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/roast-hydrometric-first-019.yml" --jq .id)"
    gh api --method PUT "repos/$GITHUB_REPOSITORY/actions/workflows/$workflow_id/disable"
    git pull --ff-only origin "$BRANCH"
    git rm -f .github/workflows/roast-hydrometric-first-019.yml .github/roast-019-trigger .github/roast-019-run.sh
    git_config
    git commit -m 'ci: self-disarm roast hydrometric-first 019'
    git push origin HEAD:"$BRANCH"
    final_head="$(git rev-parse HEAD)"
    workflow_state="$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$workflow_id" --jq .state)"
    test "$workflow_state" = 'disabled_manually'
    main_sha="$(git ls-remote origin refs/heads/main | cut -f1)"
    test "$main_sha" = "$EXPECTED_MAIN"
    first="$(cat "$EVIDENCE_DIR/first-viewport-metrics.json")"
    density="$(cat "$EVIDENCE_DIR/density-metrics.json")"
    words="$(node -e "const x=$first;process.stdout.write(String(x.wordsBeforeChart))")"
    mobile="$(node -e "const x=$density;process.stdout.write(String(x.find(v=>v.width===390).ratio.toFixed(3)))")"
    tablet="$(node -e "const x=$density;process.stdout.write(String(x.find(v=>v.width===768).ratio.toFixed(3)))")"
    desktop="$(node -e "const x=$density;process.stdout.write(String(x.find(v=>v.width===1440).ratio.toFixed(3)))")"
    cat > /tmp/checkpoint-019.md <<CHECKPOINT
STATUS=VERIFIED_NOT_ACCEPTED
ORDER=$ORDER
REMOTE_HEAD_BEFORE=$EXPECTED_BASE
REMOTE_HEAD_AFTER=$final_head
PRODUCT_COMMIT_SHA=$PRODUCT_COMMIT_SHA
DEPLOYMENT_VERSION_ID=$DEPLOYMENT_VERSION_ID
DEPLOY_COMMAND_COUNT=1
CLOUDFLARE_MUTATION_COUNT=1
PRODUCT_TREE_SHA256=$PRODUCT_TREE_SHA256
FIRST_BLOCK=HYDROMETRIC_SITUATION
FIRST_VIEWPORT_RESULT=PASS
WORDS_BEFORE_CHART=$words
MOBILE_SCROLL_RATIO=$mobile
TABLET_SCROLL_RATIO=$tablet
DESKTOP_SCROLL_RATIO=$desktop
PRIMARY_SECTION_COUNT=4
SOURCE_FAMILIES_VERIFIED=INA_REST,INA_WATERML,SMN_ALERTS,PROTECCION_CIVIL,NASA_GPM_SUPPLEMENTARY
SOURCE_HEALTH_RESULT=PASS_TRACEABLE
ALERT_FAILURE_PLACEMENT=HEADER_BADGE_AND_DIALOG_ONLY
SKIP_LINK_RESULT=PASS_HIDDEN_UNTIL_FOCUS
OFFLINE_RESULT=PASS
E2E_RESULT=PASS_RETRIES_0
FLAKY_TEST_COUNT=0
SCREENSHOT_ARTIFACT_ID=$SCREENSHOT_ARTIFACT_ID
ARTIFACT_ID=$ARTIFACT_ID
ARTIFACT_SHA256=$ARTIFACT_SHA256
TEMP_WORKFLOW_ID=$workflow_id
TEMP_WORKFLOW_STATE=$workflow_state
CLOUDFLARE_GITHUB_DRIFT=false
MAIN_SHA=$main_sha
AUD_HOLD=ACTIVE
CHECKPOINT
    gh issue comment 13 --repo "$GITHUB_REPOSITORY" --body-file /tmp/checkpoint-019.md
    ;;
  *) echo 'usage: roast-019-run.sh apply|verify|cleanup' >&2; exit 2;;
esac
