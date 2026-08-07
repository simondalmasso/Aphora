#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?}"
BRANCH="arq/visual-dashboard-v3"
MAIN_SHA="45047d1c1e16941ea37967d67307d0ab17e85fad"
CURRENT_RUN="${GITHUB_RUN_ID:?}"
EVIDENCE_DIR="${EVIDENCE_DIR:-artifacts/order-020-final}"
mkdir -p "$EVIDENCE_DIR"

# Disable every registered workflow, including this running finalizer.
mapfile -t workflow_ids < <(gh api --paginate "repos/$REPO/actions/workflows?per_page=100" --jq '.workflows[] | select(.state == "active") | .id')
for workflow_id in "${workflow_ids[@]}"; do
  gh api -X PUT "repos/$REPO/actions/workflows/$workflow_id/disable" >/dev/null || true
done

# Delete completed historical runs using a reduced ID-only stream to avoid ENOBUFS.
mapfile -t completed_run_ids < <(gh api --paginate "repos/$REPO/actions/runs?per_page=100" --jq '.workflow_runs[] | select(.status == "completed") | .id')
deleted_runs=0
for run_id in "${completed_run_ids[@]}"; do
  if [[ "$run_id" == "$CURRENT_RUN" ]]; then
    continue
  fi
  if gh api -X DELETE "repos/$REPO/actions/runs/$run_id" >/dev/null 2>&1; then
    deleted_runs=$((deleted_runs + 1))
  fi
done

# Remove every versioned workflow, trigger, and order-020 runtime.
rm -rf .github/workflows .github/order020-runtime
rm -f .github/order-020-trigger .github/order-020-final-trigger .github/order020-get-only-close.mjs .github/order020-get-only-cleanup.sh
find .github -maxdepth 1 -type f \( -name '*trigger*' -o -name '*terminal*' -o -name 'order-020-*' \) -delete

git add -A .github
git diff --cached --check
git config user.name sos-sf-automation
git config user.email sos-sf-automation@users.noreply.github.com
if ! git diff --cached --quiet; then
  git commit -m 'ci: terminally disarm order 020 and historical mutation routes'
  git push origin "HEAD:$BRANCH"
fi
terminal_sha="$(git rev-parse HEAD)"
[[ "$(git rev-parse origin/main)" == "$MAIN_SHA" ]]

active_workflows="$(gh api --paginate "repos/$REPO/actions/workflows?per_page=100" --jq '[.workflows[] | select(.state == "active")] | length' | awk '{s+=$1} END{print s+0}')"
historical_completed="$(gh api --paginate "repos/$REPO/actions/runs?per_page=100" --jq '[.workflow_runs[] | select(.status == "completed")] | length' | awk '{s+=$1} END{print s+0}')"
versioned_workflows="$(git ls-files '.github/workflows/*' | wc -l | tr -d ' ')"

cat > "$EVIDENCE_DIR/terminal-governance-state.json" <<JSON
{
  "terminalSha": "$terminal_sha",
  "mainSha": "$MAIN_SHA",
  "workflowsActive": $active_workflows,
  "completedHistoricalRunsDeleted": $deleted_runs,
  "completedHistoricalRunsRemainingAtCheckpoint": $historical_completed,
  "currentRunId": $CURRENT_RUN,
  "currentRunStateAtCheckpoint": "in_progress",
  "versionedWorkflowFilesRemaining": $versioned_workflows,
  "historicalMutationPathsRerunnable": 0
}
JSON

[[ "$active_workflows" == "0" ]]
[[ "$historical_completed" == "0" ]]
[[ "$versioned_workflows" == "0" ]]

printf 'terminal_sha=%s\n' "$terminal_sha" >> "$GITHUB_OUTPUT"
printf 'deleted_runs=%s\n' "$deleted_runs" >> "$GITHUB_OUTPUT"
