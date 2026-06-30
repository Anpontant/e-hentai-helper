import { describe, test, expect } from 'vitest';
import { buildReleaseNotes } from '../scripts/release-notes.mjs';

describe('buildReleaseNotes', () => {
  test('groups feat/fix/perf commits into titled sections', () => {
    const notes = buildReleaseNotes({
      subjects: [
        'feat: add spread view',
        'fix: restore auto scroll',
        'perf: reduce preload retries'
      ],
      version: '0.8.2'
    });
    expect(notes).toContain('## Features');
    expect(notes).toContain('- add spread view');
    expect(notes).toContain('## Bug Fixes');
    expect(notes).toContain('- restore auto scroll');
    expect(notes).toContain('## Performance');
    expect(notes).toContain('- reduce preload retries');
  });

  test('renders the commit scope as a bold prefix', () => {
    const notes = buildReleaseNotes({
      subjects: ['feat(spread): add side-by-side view'],
      version: '0.8.2'
    });
    expect(notes).toContain('- **spread:** add side-by-side view');
  });

  test('always appends the signed-release line with the version', () => {
    const notes = buildReleaseNotes({
      subjects: ['feat: add spread view'],
      version: '0.8.2'
    });
    expect(notes).toContain('Signed Firefox add-on release 0.8.2.');
  });

  test('falls back to only the signed-release line when no user-facing commits', () => {
    const notes = buildReleaseNotes({
      subjects: ['docs: tweak readme', 'chore: bump deps'],
      version: '0.8.2'
    });
    expect(notes).toBe('Signed Firefox add-on release 0.8.2.');
    expect(notes).not.toContain('##');
  });

  test('appends a Full Changelog link when compareUrl is given', () => {
    const url = 'https://github.com/owner/repo/compare/v0.8.1...v0.8.2';
    const notes = buildReleaseNotes({
      subjects: ['feat: add spread view'],
      version: '0.8.2',
      compareUrl: url
    });
    expect(notes).toContain(`**Full Changelog**: ${url}`);
  });

  test('excludes non-user-facing types and merge commits', () => {
    const notes = buildReleaseNotes({
      subjects: [
        'feat: real feature',
        'docs: update docs',
        'chore: housekeeping',
        'refactor: tidy code',
        'test: add coverage',
        'ci: tweak pipeline',
        'Merge pull request #8 from foo/bar'
      ],
      version: '0.8.2'
    });
    expect(notes).toContain('- real feature');
    expect(notes).not.toContain('update docs');
    expect(notes).not.toContain('housekeeping');
    expect(notes).not.toContain('tidy code');
    expect(notes).not.toContain('Merge pull request');
  });

  test('omits sections that have no commits', () => {
    const notes = buildReleaseNotes({
      subjects: ['fix: a bug'],
      version: '0.8.2'
    });
    expect(notes).toContain('## Bug Fixes');
    expect(notes).not.toContain('## Features');
    expect(notes).not.toContain('## Performance');
  });
});
