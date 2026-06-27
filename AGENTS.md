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

Codex hooks for this repository call:

```bash
scripts/codex-hooks/check-on-stop.sh
```

The hook is intended to run `npm run check` automatically at Codex `Stop` when
repository files were changed. If it fails, fix the issue before committing.

Do not commit unrelated user changes unless explicitly asked.
