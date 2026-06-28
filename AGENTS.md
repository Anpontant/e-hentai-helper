# Repository Instructions

This file is the single source of agent/AI instructions for this repository.
`CLAUDE.md` is a symlink to this file.

## Project shape

Firefox MV3 extension. Source is authored in `src/` and bundled by esbuild into
`addon/` for the browser to load.

```
src/
  shared/          Pure helpers and constants (shared with tests)
  content/         Content script — modules + Preact components (.jsx)
  popup/           Popup UI — Preact entry point (.jsx)
addon/
  manifest.json    Extension manifest (hand-edited)
  content/         content.css (hand-edited), content.js (built — gitignored)
  popup/           popup.html, popup.css (hand-edited), popup.js (built — gitignored)
  icons/, _locales/
scripts/
  build.mjs        esbuild bundler config
```

### Tech stack

- **Bundler:** esbuild — `npm run build` bundles `src/` → `addon/`
- **UI framework:** Preact + @preact/signals for reactive state
- **JSX:** automatic runtime via esbuild (`jsxImportSource: 'preact'`)
- **Linting:** ESLint 8 + eslint-plugin-react (JSX support)
- **Formatting:** Prettier
- **Addon tooling:** web-ext (lint, build, sign, dev)

### Key conventions

- Edit source in `src/`, never edit `addon/content/content.js` or
  `addon/popup/popup.js` directly — they are build output (gitignored).
- Static assets in `addon/` (manifest.json, CSS, HTML, icons, \_locales) are
  hand-edited as usual.

## Quality gate

Before committing any change to code, scripts, tooling, or docs, run:

```bash
npm run check
```

This runs `lint`, `format:check`, `test`, `addon:lint`, and `addon:build`
(which includes `npm run build`). It must pass before you commit. The same
command runs in CI (`.github/workflows/ci.yml`) on every pull request and on
pushes that touch code.

Line endings are normalized to LF via `.gitattributes`. Do not reintroduce CRLF;
if `format:check` flags files you did not touch, run `npm run format`.

## Commit discipline

When a coherent unit of work is complete, create a git commit before moving on
to unrelated work. Commit frequently — each logical change (feature, fix,
refactor step) should be its own commit.

Use Conventional Commits:

- `feat: ...` for user-facing feature additions
- `fix: ...` for bug fixes
- `perf: ...` for performance improvements
- `docs: ...` for documentation-only changes
- `chore: ...` for repository maintenance, tooling, or release tasks
- `refactor: ...` for code restructuring without behavior changes
- `test: ...` for test additions or updates
- `ci: ...` for CI/CD workflow changes

Keep the message concise and specific to what changed.

Examples:

- `fix: restore auto scroll during early page load`
- `perf: reduce preload retries and cache viewer metadata`
- `docs: document WSL debugging workflow`
- `chore: bump version to 0.2.2`

## Branch and review flow

Do not commit directly to `main`. Work on a topic branch and open a pull request
so CI runs and the change is reviewable. Do not commit unrelated user changes
unless explicitly asked.

## Releases

`npm run version:patch|minor|major` bumps the version. Pushing a version change
to `main` triggers signing + GitHub Release via
`.github/workflows/sign-addon.yml`.

## Codex stop hook

`scripts/codex-hooks/check-on-stop.sh` runs `npm run check` automatically at
Codex `Stop` when tracked files changed. It identifies this project by the
`package.json` `name`, so it is safe to register globally and only fires here.

Register it in `~/.codex/config.toml` (path/format depend on your Codex
version), e.g.:

```toml
[hooks]
stop = ["sh", "scripts/codex-hooks/check-on-stop.sh"]
```

If the hook is not registered, run `npm run check` manually before committing.
