import { build, context } from 'esbuild';

const prod = process.argv.includes('--prod');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  format: 'iife',
  target: ['firefox115'],
  minify: prod,
  jsx: 'automatic',
  jsxImportSource: 'preact'
};

const entries = [
  { entryPoints: ['src/content/main.jsx'], outfile: 'addon/content/content.js' },
  { entryPoints: ['src/popup/main.js'], outfile: 'addon/popup/popup.js' }
];

if (watch) {
  const contexts = await Promise.all(entries.map((entry) => context({ ...shared, ...entry })));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('[build] watching for changes...');
} else {
  await Promise.all(entries.map((entry) => build({ ...shared, ...entry })));
}
