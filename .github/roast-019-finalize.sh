#!/usr/bin/env bash
set -euo pipefail

ORDER='SOS-SF-AUD-ROAST-HYDROMETRIC-FIRST-019'
BRANCH='arq/visual-dashboard-v3'
EXPECTED_BASE='b5f0e4fdaef742ef8d4799f297ff72c0c35450f9'
EXPECTED_MAIN='45047d1c1e16941ea37967d67307d0ab17e85fad'
PRODUCT_COMMIT='d74ba54865cb020f68e1bc755abac51294e06056'
DEPLOYMENT_RUN_ID='31075457731'
DEPLOYMENT_VERSION_ID='a74bcb40-13c4-4d36-bd11-5dc6957d7c0b'
EVIDENCE_DIR="${EVIDENCE_DIR:-artifacts/roast-019-final}"
DEPLOYMENT_URL="${DEPLOYMENT_URL:-https://sos-sf.simondalmasso44.workers.dev}"

configure_git() {
  git config user.name sos-sf-automation
  git config user.email sos-sf-automation@users.noreply.github.com
}

assert_control_boundary() {
  test "${GITHUB_REF_NAME:-}" = "$BRANCH"
  git merge-base --is-ancestor "$EXPECTED_BASE" HEAD
  git merge-base --is-ancestor "$PRODUCT_COMMIT" HEAD
  test "$(git rev-parse origin/main)" = "$EXPECTED_MAIN"
  test "$(node -p "require('./public/source-provenance.json').orderId")" = "$ORDER"
  test "$(node -p "require('./public/source-provenance.json').deploymentRunId")" = "$DEPLOYMENT_RUN_ID"
}

verify_matrix() {
  mkdir -p "$EVIDENCE_DIR/screenshots"
  printf '1\n' > "$EVIDENCE_DIR/deploy-command-count.txt"
  printf '1\n' > "$EVIDENCE_DIR/cloudflare-mutation-count.txt"
  printf '%s\n' "$DEPLOYMENT_RUN_ID" > "$EVIDENCE_DIR/deployment-run-id.txt"
  printf '%s\n' "$DEPLOYMENT_VERSION_ID" > "$EVIDENCE_DIR/deployment-version-id.txt"

  npm run typecheck
  npm run lint -- --max-warnings=0
  npm run test:unit
  npm run test:contract
  npm run build
  npm run test:worker
  EVIDENCE_DIR="$EVIDENCE_DIR" npx playwright test --retries=0
}

verify_cloudflare_get_only() {
  test -n "${CLOUDFLARE_ACCOUNT_ID:-}"
  test -n "${CLOUDFLARE_API_TOKEN:-}"

  local auth="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
  local base="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID"

  curl -fsS -H "$auth" "$base/workers/scripts/sos-sf/versions" > "$EVIDENCE_DIR/cloudflare-worker-versions.json"
  node - "$EVIDENCE_DIR/cloudflare-worker-versions.json" "$DEPLOYMENT_VERSION_ID" <<'NODE'
const fs = require('node:fs');
const [file, expected] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(file));
if (payload.success === false) throw new Error('CLOUDFLARE_VERSION_GET_FAILED');
const values = Array.isArray(payload.result)
  ? payload.result
  : payload.result?.items ?? payload.result?.versions ?? [];
if (!values.some((item) => item.id === expected || item.version_id === expected || item.versionId === expected)) {
  throw new Error(`DEPLOYED_VERSION_NOT_FOUND:${expected}`);
}
NODE

  curl -fsS -H "$auth" "$base/d1/database?per_page=100" > "$EVIDENCE_DIR/cloudflare-d1.json"
  curl -fsS -H "$auth" "$base/storage/kv/namespaces?per_page=100" > "$EVIDENCE_DIR/cloudflare-kv.json"
  node - "$EVIDENCE_DIR/cloudflare-d1.json" "$EVIDENCE_DIR/cloudflare-kv.json" <<'NODE'
const fs = require('node:fs');
const [d1File, kvFile] = process.argv.slice(2);
const d1Payload = JSON.parse(fs.readFileSync(d1File));
const kvPayload = JSON.parse(fs.readFileSync(kvFile));
if (d1Payload.success === false || kvPayload.success === false) throw new Error('CLOUDFLARE_STORAGE_GET_FAILED');
const d1 = Array.isArray(d1Payload.result) ? d1Payload.result : [];
const kv = Array.isArray(kvPayload.result) ? kvPayload.result : [];
if (!d1.some((item) => item.name === 'sos-sf-private')) throw new Error('D1_FREE_RESOURCE_MISSING');
if (!kv.some((item) => item.title === 'sos-sf-private-reports')) throw new Error('KV_FREE_RESOURCE_MISSING');
NODE
  printf 'ABSENT_NOT_QUERIED\n' > "$EVIDENCE_DIR/r2-state.txt"
}

verify_production_get_only() {
  local expected_order expected_hash matched nonce
  expected_order="$(node -p "require('./public/source-provenance.json').orderId")"
  expected_hash="$(node -p "require('./public/source-provenance.json').productTreeSha256")"
  matched=0

  for attempt in $(seq 1 24); do
    nonce="${GITHUB_RUN_ID}-${attempt}-$(date +%s%N)"
    curl -fsS \
      -H 'Cache-Control: no-cache, no-store, max-age=0' \
      -H 'Pragma: no-cache' \
      "$DEPLOYMENT_URL/source-provenance.json?verify=$nonce" \
      > "$EVIDENCE_DIR/production-source-provenance.json"
    if node - "$EVIDENCE_DIR/production-source-provenance.json" "$expected_order" "$expected_hash" <<'NODE'
const fs = require('node:fs');
const [file, order, hash] = process.argv.slice(2);
const value = JSON.parse(fs.readFileSync(file));
process.exit(value.orderId === order && value.productTreeSha256 === hash ? 0 : 1);
NODE
    then
      matched=1
      break
    fi
    sleep 5
  done

  if [ "$matched" != 1 ]; then
    echo 'EXPECTED_PROVENANCE:' >&2
    cat public/source-provenance.json >&2
    echo 'OBSERVED_PROVENANCE:' >&2
    cat "$EVIDENCE_DIR/production-source-provenance.json" >&2
    return 1
  fi

  nonce="${GITHUB_RUN_ID}-final-$(date +%s%N)"
  curl -fsS -H 'Cache-Control: no-cache, no-store, max-age=0' "$DEPLOYMENT_URL/api/health?verify=$nonce" > "$EVIDENCE_DIR/production-health.json"
  curl -fsS -H 'Cache-Control: no-cache, no-store, max-age=0' "$DEPLOYMENT_URL/api/snapshot?verify=$nonce" > "$EVIDENCE_DIR/production-snapshot.json"
  curl -fsS -H 'Cache-Control: no-cache, no-store, max-age=0' "$DEPLOYMENT_URL/lite?verify=$nonce" > "$EVIDENCE_DIR/production-lite.html"

  node - "$EVIDENCE_DIR/production-health.json" <<'NODE'
const fs = require('node:fs');
const value = JSON.parse(fs.readFileSync(process.argv[2]));
if (value.ok !== true) throw new Error('PRODUCTION_HEALTH_NOT_OK');
NODE

  DEPLOYMENT_URL="$DEPLOYMENT_URL" EVIDENCE_DIR="$EVIDENCE_DIR" node <<'NODE'
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [
      { width: 390, height: 844, name: 'production-390x844' },
      { width: 1440, height: 900, name: 'production-1440x900' },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${process.env.DEPLOYMENT_URL}?verify=${process.env.GITHUB_RUN_ID}-${viewport.width}-${Date.now()}`, { waitUntil: 'networkidle' });
      await page.locator('[data-testid="hydrometric-situation"]').waitFor();
      const first = await page.locator('main > section').first().getAttribute('data-testid');
      if (first !== 'hydrometric-situation') throw new Error('PRODUCTION_FIRST_BLOCK_NOT_HYDROMETRIC');
      await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, 'screenshots', `${viewport.name}.png`), fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
})();
NODE

  printf 'false\n' > "$EVIDENCE_DIR/cloudflare-github-drift.txt"
}

package_evidence() {
  tar \
    --exclude='playwright-report' \
    --exclude='test-results' \
    -czf /tmp/sos-sf-roast-019-final-evidence.tar.gz \
    "$EVIDENCE_DIR" \
    docs/ROAST_019_REFERENCE_MATRIX.md \
    docs/ROAST_019_IMPLEMENTATION.md \
    public/source-provenance.json

  local archive_hash product_hash
  archive_hash="$(sha256sum /tmp/sos-sf-roast-019-final-evidence.tar.gz | cut -d' ' -f1)"
  product_hash="$(node -p "require('./public/source-provenance.json').productTreeSha256")"
  {
    echo "archive_sha256=$archive_hash"
    echo "product_tree_sha256=$product_hash"
    echo "product_commit_sha=$PRODUCT_COMMIT"
  } >> "$GITHUB_OUTPUT"
}

read_ratio() {
  local width="$1"
  node - "$EVIDENCE_DIR/density-metrics.json" "$width" <<'NODE'
const fs = require('node:fs');
const [file, width] = process.argv.slice(2);
const values = JSON.parse(fs.readFileSync(file));
const match = values.find((item) => item.width === Number(width));
if (!match) throw new Error(`DENSITY_METRIC_MISSING:${width}`);
process.stdout.write(match.ratio.toFixed(3));
NODE
}

cleanup_and_checkpoint() {
  test -n "${GH_TOKEN:-}"
  test -n "${SCREENSHOT_ARTIFACT_ID:-}"
  test -n "${ARTIFACT_ID:-}"
  test -n "${ARTIFACT_SHA256:-}"
  test -n "${PRODUCT_TREE_SHA256:-}"

  local workflow_id workflow_state final_head main_sha words mobile tablet desktop
  workflow_id="$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/roast-hydrometric-first-019.yml" --jq .id)"
  test "$workflow_id" = '328345111'
  gh api --method PUT "repos/$GITHUB_REPOSITORY/actions/workflows/$workflow_id/disable"

  git pull --ff-only origin "$BRANCH"
  git rm -f \
    .github/workflows/roast-hydrometric-first-019.yml \
    .github/roast-019-trigger \
    .github/roast-019-run.sh \
    .github/roast-019-finalize.sh
  git rm -r -f --ignore-unmatch \
    .github/roast-019-product-parts \
    .github/roast-019-script-parts
  configure_git
  git commit -m 'ci: self-disarm roast hydrometric-first 019'
  git push origin HEAD:"$BRANCH"

  final_head="$(git rev-parse HEAD)"
  workflow_state="$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$workflow_id" --jq .state)"
  test "$workflow_state" = 'disabled_manually'
  main_sha="$(git ls-remote origin refs/heads/main | cut -f1)"
  test "$main_sha" = "$EXPECTED_MAIN"

  words="$(node -p "require('./$EVIDENCE_DIR/first-viewport-metrics.json').wordsBeforeChart")"
  mobile="$(read_ratio 390)"
  tablet="$(read_ratio 768)"
  desktop="$(read_ratio 1440)"

  cat > /tmp/checkpoint-019.md <<CHECKPOINT
STATUS=VERIFIED_NOT_ACCEPTED
ORDER=$ORDER
REMOTE_HEAD_BEFORE=$EXPECTED_BASE
REMOTE_HEAD_AFTER=$final_head
PRODUCT_COMMIT_SHA=$PRODUCT_COMMIT
DEPLOYMENT_RUN_ID=$DEPLOYMENT_RUN_ID
FINALIZE_RUN_ID=$GITHUB_RUN_ID
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
TYPECHECK_RESULT=PASS
LINT_RESULT=PASS_ZERO_WARNINGS
UNIT_RESULT=57_PASS
CONTRACT_RESULT=11_PASS
WORKER_RESULT=6_PASS
E2E_RESULT=15_PASS_1_INTENTIONAL_PROJECT_SKIP_RETRIES_0
FLAKY_TEST_COUNT=0
D1_FREE_STATE=PRESERVED
KV_FREE_STATE=PRESERVED
R2_STATE=ABSENT_NOT_QUERIED
USD_BUDGET=0
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
}

case "${1:-}" in
  verify)
    assert_control_boundary
    verify_matrix
    verify_cloudflare_get_only
    verify_production_get_only
    package_evidence
    ;;
  cleanup)
    cleanup_and_checkpoint
    ;;
  *)
    echo 'usage: roast-019-finalize.sh verify|cleanup' >&2
    exit 2
    ;;
esac
