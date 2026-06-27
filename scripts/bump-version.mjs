import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const release = process.argv[2] || 'patch';
const allowed = new Set(['patch', 'minor', 'major']);

if (!allowed.has(release)) {
  console.error('Usage: node scripts/bump-version.mjs [patch|minor|major]');
  process.exit(1);
}

const files = [
  path.join(root, 'addon', 'manifest.json'),
  path.join(root, 'package.json'),
  path.join(root, 'package-lock.json')
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function bump(version) {
  const parts = String(version || '0.0.0')
    .split('.')
    .map((part) => parseInt(part, 10));
  while (parts.length < 3) parts.push(0);

  if (release === 'major') {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (release === 'minor') {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }

  return parts.slice(0, 3).join('.');
}

const manifest = readJson(files[0]);
const nextVersion = bump(manifest.version);
manifest.version = nextVersion;
writeJson(files[0], manifest);

const packageJson = readJson(files[1]);
packageJson.version = nextVersion;
writeJson(files[1], packageJson);

if (fs.existsSync(files[2])) {
  const lock = readJson(files[2]);
  lock.version = nextVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = nextVersion;
  }
  writeJson(files[2], lock);
}

execFileSync('npx', ['prettier', '--write', files[0], files[1]], {
  cwd: root,
  stdio: 'inherit'
});

console.log(nextVersion);
