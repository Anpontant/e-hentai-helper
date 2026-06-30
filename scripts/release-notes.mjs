import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SECTIONS = [
  { type: 'feat', title: 'Features' },
  { type: 'fix', title: 'Bug Fixes' },
  { type: 'perf', title: 'Performance' }
];

const COMMIT_RE = /^(feat|fix|perf)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

export function buildReleaseNotes({ subjects, version, compareUrl }) {
  const grouped = { feat: [], fix: [], perf: [] };
  for (const subject of subjects) {
    const match = COMMIT_RE.exec(String(subject).trim());
    if (!match) continue;
    const scope = match[2];
    const description = match[4].trim();
    grouped[match[1]].push(scope ? `**${scope}:** ${description}` : description);
  }

  const blocks = [];
  for (const { type, title } of SECTIONS) {
    if (grouped[type].length === 0) continue;
    const items = grouped[type].map((desc) => `- ${desc}`).join('\n');
    blocks.push(`## ${title}\n\n${items}`);
  }

  blocks.push(`Signed Firefox add-on release ${version}.`);
  if (compareUrl) {
    blocks.push(`**Full Changelog**: ${compareUrl}`);
  }

  return blocks.join('\n\n');
}

// --- CLI ---------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function readVersion() {
  const manifestPath = path.join(process.cwd(), 'addon', 'manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version;
}

// Previous release tag and commit subjects since it. Degrades to whole-history
// (and ultimately an empty list) so release-note generation never blocks a release.
function gatherGitContext() {
  let prevTag = '';
  try {
    prevTag = git(['describe', '--tags', '--abbrev=0', '--match', 'v*']);
  } catch {
    prevTag = '';
  }

  let subjects = [];
  try {
    const range = prevTag ? `${prevTag}..HEAD` : 'HEAD';
    const out = git(['log', range, '--no-merges', '--format=%s']);
    subjects = out ? out.split('\n').filter(Boolean) : [];
  } catch {
    subjects = [];
  }

  return { prevTag, subjects };
}

function buildCompareUrl(prevTag, version) {
  const server = process.env.GITHUB_SERVER_URL;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!prevTag || !server || !repo) return undefined;
  return `${server}/${repo}/compare/${prevTag}...v${version}`;
}

function main() {
  const version = process.argv[2] || readVersion();
  const { prevTag, subjects } = gatherGitContext();
  const compareUrl = buildCompareUrl(prevTag, version);
  process.stdout.write(`${buildReleaseNotes({ subjects, version, compareUrl })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
