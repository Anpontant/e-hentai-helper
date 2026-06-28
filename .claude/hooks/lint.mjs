#!/usr/bin/env node
// PostToolUse(Write|Edit) hook: lint the just-written JS/JSX/MJS file with ESLint.
// Errors are fed back to Claude (exit 2) so they get fixed before moving on;
// warnings are surfaced to the user but never block.
import { ESLint } from 'eslint';

const filePath = await fileFromStdin();
if (!filePath || !/\.(js|jsx|mjs)$/i.test(filePath)) process.exit(0);

try {
  const eslint = new ESLint();
  if (await eslint.isPathIgnored(filePath)) process.exit(0);

  const results = await eslint.lintFiles([filePath]);
  const errors = results.reduce((n, r) => n + r.errorCount, 0);
  const warnings = results.reduce((n, r) => n + r.warningCount, 0);
  if (errors + warnings === 0) process.exit(0);

  const report = (await (await eslint.loadFormatter('stylish')).format(results)).trim();

  if (errors > 0) {
    console.error(report); // stderr → fed back to Claude on exit 2
    process.exit(2);
  }

  // warnings only: visible to the user, non-blocking
  process.stdout.write(JSON.stringify({ systemMessage: report }));
  process.exit(0);
} catch {
  process.exit(0); // config/parse hiccup: stay advisory, never block
}

async function fileFromStdin() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  try {
    return JSON.parse(raw)?.tool_input?.file_path ?? '';
  } catch {
    return '';
  }
}
