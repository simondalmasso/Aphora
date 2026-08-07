#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?}"
BRANCH="arq/visual-dashboard-v3"
MAIN_SHA="45047d1c1e16941ea37967d67307d0ab17e85fad"
CURRENT_RUN="${GITHUB_RUN_ID:?}"
EVIDENCE_DIR="${EVIDENCE_DIR:-artifacts/order-020b-final-corrective}"
TEMP_WORKFLOW_PATH="order-020b-final-corrective.yml"
mkdir -p "$EVIDENCE_DIR"

temp_workflow_id="$(gh api "repos/$REPO/actions/workflows/$TEMP_WORKFLOW_PATH" --jq '.id')"

mapfile -t active_ids < <(gh api --paginate "repos/$REPO/actions/workflows?per_page=100" --jq '.workflows[] | select(.state == "active") | .id')
for workflow_id in "${active_ids[@]}"; do
  gh api -X PUT "repos/$REPO/actions/workflows/$workflow_id/disable" >/dev/null || true
done

mapfile -t completed_ids < <(gh api --paginate "repos/$REPO/actions/runs?per_page=100" --jq '.workflow_runs[] | select(.status == "completed") | .id')
deleted_runs=0
for run_id in "${completed_ids[@]}"; do
  if [[ "$run_id" == "$CURRENT_RUN" ]]; then
    continue
  fi
  if gh api -X DELETE "repos/$REPO/actions/runs/$run_id" >/dev/null 2>&1; then
    deleted_runs=$((deleted_runs + 1))
  fi
done

rm -rf .github/workflows .github/order020b-amend
rm -f .github/order-020b-final-corrective-trigger
find .github -maxdepth 1 -type f \( -name '*trigger*' -o -name '*020b*' \) -delete 2>/dev/null || true
rmdir .github 2>/dev/null || true

git add -A .github 2>/dev/null || true
git diff --cached --check
git config user.name sos-sf-automation
git config user.email sos-sf-automation@users.noreply.github.com
if ! git diff --cached --quiet; then
  git commit -m 'ci: terminally disarm 020-B corrective deploy authority'
  git push origin "HEAD:$BRANCH"
fi
terminal_sha="$(git rev-parse HEAD)"
[[ "$(git rev-parse origin/main)" == "$MAIN_SHA" ]]

active_count="$(gh api --paginate "repos/$REPO/actions/workflows?per_page=100" --jq '[.workflows[] | select(.state == "active")] | length' | awk '{s+=$1} END{print s+0}')"
completed_remaining="$(gh api --paginate "repos/$REPO/actions/runs?per_page=100" --jq '[.workflow_runs[] | select(.status == "completed")] | length' | awk '{s+=$1} END{print s+0}')"
versioned_workflows="$(git ls-files '.github/workflows/*' | wc -l | tr -d ' ')"
temp_state="$(gh api "repos/$REPO/actions/workflows/$temp_workflow_id" --jq '.state')"
[[ "$active_count" == "0" ]]
[[ "$completed_remaining" == "0" ]]
[[ "$versioned_workflows" == "0" ]]
[[ "$temp_state" != "active" ]]

cat > "$EVIDENCE_DIR/terminal-governance.json" <<JSON
{
  "terminalSha": "$terminal_sha",
  "mainSha": "$MAIN_SHA",
  "tempWorkflowId": $temp_workflow_id,
  "tempWorkflowState": "$temp_state",
  "activeMutationWorkflows": 0,
  "rerunnableHistoricalProductionMutationPaths": 0,
  "completedHistoricalRunsDeleted": $deleted_runs,
  "completedHistoricalRunsRemaining": 0,
  "versionedWorkflowFilesRemaining": 0,
  "currentRunId": $CURRENT_RUN,
  "currentRunStateAtCapture": "in_progress"
}
JSON
printf 'terminal_sha=%s\n' "$terminal_sha" >> "$GITHUB_OUTPUT"
printf 'temp_workflow_id=%s\n' "$temp_workflow_id" >> "$GITHUB_OUTPUT"
