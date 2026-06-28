import { build } from 'esbuild';

const prod = process.argv.includes('--prod');

const shared = {
  bundle: true,
  format: 'iife',
  target: ['firefox115'],
  minify: prod,
  jsx: 'automatic',
  jsxImportSource: 'preact'
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ['src/content/main.jsx'],
    outfile: 'addon/content/content.js'
  }),
  build({
    ...shared,
    entryPoints: ['src/popup/main.jsx'],
    outfile: 'addon/popup/popup.js'
  })
]);
