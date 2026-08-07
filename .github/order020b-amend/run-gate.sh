#!/usr/bin/env bash
set -euo pipefail
name="$1"
shift
mkdir -p "$EVIDENCE_DIR/logs" "$EVIDENCE_DIR/gates"
set +e
"$@" >"$EVIDENCE_DIR/logs/$name.log" 2>&1
code=$?
set -e
cat "$EVIDENCE_DIR/logs/$name.log"
node --input-type=module - "$name" "$code" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const [name, rawCode] = process.argv.slice(2);
const code = Number(rawCode);
const path = `${process.env.EVIDENCE_DIR}/gates/${name}.json`;
await writeFile(path, JSON.stringify({ name, exitCode: code, result: code === 0 ? 'PASS' : 'FAIL', capturedAt: new Date().toISOString() }, null, 2) + '\n');
NODE
exit "$code"
