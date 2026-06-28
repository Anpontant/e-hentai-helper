# Repository Instructions

## Scope

These instructions apply to this repository.

## Commit Discipline

When a coherent unit of work is complete, create a git commit before moving on
to unrelated work.

Use a prefixed commit message. Prefer Conventional Commits style:

- `feat: ...` for user-facing feature additions
- `fix: ...` for bug fixes
- `perf: ...` for performance improvements
- `docs: ...` for documentation-only changes
- `chore: ...` for repository maintenance, tooling, or release tasks
- `refactor: ...` for code restructuring without behavior changes
- `test: ...` for test additions or updates

Keep the message concise and specific to what changed.

Examples:

- `fix: restore auto scroll during early page load`
- `perf: reduce preload retries and cache viewer metadata`
- `docs: document WSL debugging workflow`
- `chore: bump version to 0.2.2`

Before committing, run the relevant checks. For normal code changes, run:

```bash
npm run check
```

This runs `lint`, `format:check`, `addon:lint`, and `addon:build`, and it also
runs in CI (`.github/workflows/ci.yml`) on every pull request and on pushes that
touch code. It must pass before you commit.

Line endings are normalized to LF via `.gitattributes`. Do not reintroduce CRLF;
if `format:check` flags files you did not touch, run `npm run format`.

## Branch and review flow

Do not commit directly to `main`. Work on a topic branch and open a pull request
so CI runs and the change is reviewable. Do not commit unrelated user changes
unless explicitly asked.

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
