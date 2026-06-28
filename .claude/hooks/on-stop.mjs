#!/usr/bin/env node
// Stop hook: when source files have uncommitted changes, run the test suite
// (`node --test`) and report the result to the user. Advisory only — it never
// forces the turn to continue, so it cannot loop.
import { spawnSync } from 'node:child_process';

// Guard: if this file is ever executed by `node --test` (a test-runner glob
// match), bail immediately — never read stdin, never spawn another run. The
// spawned `node --test` below sets this env var, so recursion is impossible.
if (process.env.E_HENTAI_HELPER_ON_STOP) process.exit(0);

await readStdin(); // drain hook payload; nothing in it is needed here

// Only run when tracked source actually changed (src / test / scripts).
const status = spawnSync('git', ['status', '--porcelain', '--', 'src', 'test', 'scripts'], {
  encoding: 'utf8'
});
if (status.error || !status.stdout || status.stdout.trim() === '') process.exit(0);

const run = spawnSync('npx', ['vitest', 'run'], {
  encoding: 'utf8',
  env: { ...process.env, E_HENTAI_HELPER_ON_STOP: '1' },
  shell: true
});
const out = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim();

if (run.status === 0) {
  process.stdout.write(JSON.stringify({ systemMessage: '✓ vitest passed' }));
} else {
  const tail = out.split('\n').slice(-40).join('\n');
  process.stdout.write(JSON.stringify({ systemMessage: `✗ vitest failed:\n${tail}` }));
}
process.exit(0);

function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
  });
}
