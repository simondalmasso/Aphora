#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?}"
BRANCH="arq/visual-dashboard-v3"
MAIN_SHA="45047d1c1e16941ea37967d67307d0ab17e85fad"
CURRENT_RUN="${GITHUB_RUN_ID:?}"
EVIDENCE_DIR="${EVIDENCE_DIR:-artifacts/order-020b-terminal}"
TEMP_WORKFLOW_PATH="${TEMP_WORKFLOW_PATH:-order-020b-terminal.yml}"
mkdir -p "$EVIDENCE_DIR"

temp_workflow_id="$(gh api "repos/$REPO/actions/workflows/$TEMP_WORKFLOW_PATH" --jq '.id')"

# Terminal freeze: disable every registered active workflow, including this running workflow.
mapfile -t active_workflow_ids < <(gh api --paginate "repos/$REPO/actions/workflows?per_page=100" --jq '.workflows[] | select(.state == "active") | .id')
for workflow_id in "${active_workflow_ids[@]}"; do
  gh api -X PUT "repos/$REPO/actions/workflows/$workflow_id/disable" >/dev/null || true
done

# Remove completed historical runs. The current run remains in-progress and is excluded.
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

# Remove all temporary workflows, triggers and order-020B runtimes from the canonical branch.
rm -rf .github/workflows .github/order020b .github/order020b-blocked
rm -f .github/order-020b-terminal-trigger .github/order-020b-truth-trigger .github/order-020b-postdeploy-trigger .github/order-020b-ui-diagnostic-trigger .github/order-020b-blocked-final-trigger
find .github -maxdepth 1 -type f \( -name '*020b*trigger*' -o -name '*020-b*trigger*' \) -delete

git add -A .github
git diff --cached --check
git config user.name sos-sf-automation
git config user.email sos-sf-automation@users.noreply.github.com
if ! git diff --cached --quiet; then
  git commit -m 'ci: terminally disarm SOS-SF 020-B execution routes'
  git push origin "HEAD:$BRANCH"
fi
terminal_sha="$(git rev-parse HEAD)"
[[ "$(git rev-parse origin/main)" == "$MAIN_SHA" ]]

gh api --paginate "repos/$REPO/actions/workflows?per_page=100" --slurp > "$EVIDENCE_DIR/workflow-registry-raw.json"
node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const pages = JSON.parse(await readFile(process.env.EVIDENCE_DIR + '/workflow-registry-raw.json', 'utf8'));
const workflows = pages.flatMap((page) => page.workflows || []);
const active = workflows.filter((workflow) => workflow.state === 'active');
await writeFile(process.env.EVIDENCE_DIR + '/workflow-registry-final.partial.json', JSON.stringify({
  capturedAt: new Date().toISOString(),
  workflows: workflows.map(({ id, name, path, state }) => ({ id, name, path, state })),
  activeWorkflowCount: active.length,
}, null, 2) + '\n');
NODE

active_count="$(node -e "const p=require('./$EVIDENCE_DIR/workflow-registry-final.partial.json'); console.log(p.activeWorkflowCount)")"
[[ "$active_count" == "0" ]]
completed_remaining="$(gh api --paginate "repos/$REPO/actions/runs?per_page=100" --jq '[.workflow_runs[] | select(.status == "completed")] | length' | awk '{s+=$1} END{print s+0}')"
[[ "$completed_remaining" == "0" ]]
versioned_workflows="$(git ls-files '.github/workflows/*' | wc -l | tr -d ' ')"
[[ "$versioned_workflows" == "0" ]]
temp_state="$(gh api "repos/$REPO/actions/workflows/$temp_workflow_id" --jq '.state')"
[[ "$temp_state" != "active" ]]

TEMP_WORKFLOW_ID="$temp_workflow_id" TEMP_STATE="$temp_state" TERMINAL_SHA="$terminal_sha" DELETED_RUNS="$deleted_runs" CURRENT_RUN="$CURRENT_RUN" node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const dir = process.env.EVIDENCE_DIR;
const partial = JSON.parse(await readFile(dir + '/workflow-registry-final.partial.json', 'utf8'));
await writeFile(dir + '/workflow-registry-final.json', JSON.stringify({
  ...partial,
  terminalSha: process.env.TERMINAL_SHA,
  tempWorkflowId: Number(process.env.TEMP_WORKFLOW_ID),
  tempWorkflowState: process.env.TEMP_STATE,
  activeMutationWorkflows: 0,
  rerunnableHistoricalProductionMutationPaths: 0,
  completedHistoricalRunsDeleted: Number(process.env.DELETED_RUNS),
  completedHistoricalRunsRemaining: 0,
  currentRunId: Number(process.env.CURRENT_RUN),
  currentRunStateAtCapture: 'in_progress',
  currentRunRemoteHeadGuard: true,
  versionedWorkflowFilesRemaining: 0,
}, null, 2) + '\n');
NODE
rm -f "$EVIDENCE_DIR/workflow-registry-final.partial.json"
printf 'terminal_sha=%s\n' "$terminal_sha" >> "$GITHUB_OUTPUT"
printf 'temp_workflow_id=%s\n' "$temp_workflow_id" >> "$GITHUB_OUTPUT"
printf 'temp_workflow_state=%s\n' "$temp_state" >> "$GITHUB_OUTPUT"
