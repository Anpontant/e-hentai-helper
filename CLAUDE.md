# Claude Code instructions

This repository is developed with multiple AI agents (Claude Code and Codex).
The shared repository conventions live in [AGENTS.md](AGENTS.md) — **read it and
follow it**. Claude Code does not load `AGENTS.md` automatically, so this file
points to it and adds Claude-specific notes.

## Quality gate

Before committing any change to code, scripts, tooling, or docs, run:

```bash
npm run check
```

This runs `lint`, `format:check`, `addon:lint`, and `addon:build`. It must pass
before you commit. The same command runs in CI (`.github/workflows/ci.yml`) on
every pull request.

Line endings are normalized to LF via `.gitattributes`; do not reintroduce CRLF.
If `format:check` reports unrelated files, run `npm run format` rather than
hand-editing.

## Branch and review flow

- Do not commit directly to `main`. Create a topic branch and open a pull
  request so CI runs and the change is reviewable.
- Use Conventional Commits (see [AGENTS.md](AGENTS.md) for the prefixes and
  examples). Keep commits scoped to one coherent unit of work.

## Project shape

- Firefox MV3 extension. Source lives in `addon/` (`content/`, `popup/`,
  `manifest.json`). Build/lint/sign scripts are in `package.json` and
  `scripts/`.
- There is currently no automated test suite; rely on `npm run check` plus
  manual verification in Firefox (`about:debugging`) until tests are added.
- Releases: `npm run version:patch|minor|major` bumps the version manually, and
  pushing a version change to `main` triggers signing + GitHub Release via
  `.github/workflows/sign-addon.yml`.
