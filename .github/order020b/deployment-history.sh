#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?}"
EVIDENCE_DIR="${EVIDENCE_DIR:-artifacts/order-020b-terminal}"
mkdir -p "$EVIDENCE_DIR/logs" "$EVIDENCE_DIR/gates"
mapfile -t run_ids < <(gh api --paginate "repos/$REPO/actions/workflows/order-020b-terminal.yml/runs?per_page=100" --jq '.workflow_runs[].id')
: > "$EVIDENCE_DIR/logs/deployment-history.log"
for run_id in "${run_ids[@]}"; do
  echo "===== RUN $run_id =====" >> "$EVIDENCE_DIR/logs/deployment-history.log"
  gh run view "$run_id" --repo "$REPO" --log >> "$EVIDENCE_DIR/logs/deployment-history.log" 2>&1 || true
done

RUN_IDS="$(IFS=,; echo "${run_ids[*]}")" node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const dir = process.env.EVIDENCE_DIR;
const text = await readFile(dir + '/logs/deployment-history.log', 'utf8');
const matches = [...text.matchAll(/Current Version ID:\s*([0-9a-f-]{36})/gi)];
const versionIds = matches.map((match) => match[1]);
const uniqueVersions = [...new Set(versionIds)];
const runBlocks = [...text.matchAll(/===== RUN (\d+) =====([\s\S]*?)(?====== RUN \d+ =====|$)/g)];
const deploymentRuns = runBlocks
  .map((match) => ({ runId: Number(match[1]), versionIds: [...match[2].matchAll(/Current Version ID:\s*([0-9a-f-]{36})/gi)].map((m) => m[1]) }))
  .filter((entry) => entry.versionIds.length > 0);
const payload = {
  collectedAt: new Date().toISOString(),
  terminalWorkflowRunIds: String(process.env.RUN_IDS || '').split(',').filter(Boolean).map(Number),
  observedDeployCompletions: matches.length,
  uniqueVersionIds: uniqueVersions,
  deploymentRuns,
};
await writeFile(dir + '/deployment-history.json', JSON.stringify(payload, null, 2) + '\n');
const pass = matches.length === 1 && uniqueVersions.length === 1 && deploymentRuns.length === 1;
await writeFile(dir + '/gates/deployment.json', JSON.stringify({
  name: 'deployment',
  command: 'derived from GitHub Actions terminal workflow logs; no deploy executed by this continuation',
  exitCode: pass ? 0 : 1,
  headSha: process.env.GITHUB_SHA,
  startedAt: null,
  endedAt: new Date().toISOString(),
  logPath: dir + '/logs/deployment-history.log',
  observedDeployCompletions: matches.length,
  deploymentRunId: deploymentRuns[0]?.runId ?? null,
  deploymentVersionId: uniqueVersions[0] ?? null,
}, null, 2) + '\n');
if (!pass) process.exit(1);
NODE
