import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const evidenceDir = process.env.EVIDENCE_DIR ?? 'artifacts/current-run';
await mkdir(evidenceDir, { recursive: true });
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vitest', 'run', 'tests/worker'], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
const capture = (stream, target) => stream.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  target.write(text);
});
capture(child.stdout, process.stdout);
capture(child.stderr, process.stderr);

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', (code) => resolve(code ?? 1));
});
await writeFile(`${evidenceDir}/worker-test.log`, output, 'utf8');
process.exitCode = exitCode;
