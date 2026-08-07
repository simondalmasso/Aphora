#!/usr/bin/env bash
set -uo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: run-gate.sh <name> <command...>" >&2
  exit 64
fi

name="$1"
shift
root="${EVIDENCE_DIR:-artifacts/order-020b-terminal}"
mkdir -p "$root/logs" "$root/gates"
log="$root/logs/${name}.log"
meta="$root/gates/${name}.json"
start="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
head="$(git rev-parse HEAD)"
printf -v command '%q ' "$@"

set +e
"$@" >"$log" 2>&1
code=$?
set -e
end="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat "$log"

NAME="$name" START="$start" END="$end" HEAD_SHA="$head" EXIT_CODE="$code" COMMAND="$command" LOG_PATH="$log" META_PATH="$meta" node --input-type=module <<'NODE'
import { writeFile } from 'node:fs/promises';
const payload = {
  name: process.env.NAME,
  command: process.env.COMMAND?.trim(),
  exitCode: Number(process.env.EXIT_CODE),
  headSha: process.env.HEAD_SHA,
  startedAt: process.env.START,
  endedAt: process.env.END,
  logPath: process.env.LOG_PATH,
};
await writeFile(process.env.META_PATH, `${JSON.stringify(payload, null, 2)}\n`);
NODE

exit "$code"
