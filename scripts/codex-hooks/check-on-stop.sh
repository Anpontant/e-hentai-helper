#!/usr/bin/env sh
set -eu

# Codex `Stop` hook for e-hentai-helper.
#
# This is registered as a GLOBAL Codex hook and therefore runs after every
# session in any repository. It must be self-identifying: only act when the
# current working tree actually is this project, regardless of the absolute
# path or host OS (Windows, WSL, Linux all differ).
#
# Identification is by package.json "name" at the git top level, not by a
# hardcoded path. See AGENTS.md for how to register this hook.

# Resolve the repository root. If we are not inside a git work tree, do nothing.
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$repo_root" ]; then
  exit 0
fi

cd "$repo_root" || exit 0

# Only act on this project.
if [ ! -f package.json ]; then
  exit 0
fi

pkg_name="$(node -p "require('./package.json').name" 2>/dev/null || true)"
if [ "$pkg_name" != "e-hentai-helper" ]; then
  exit 0
fi

# Only run checks when files that `npm run check` cares about have changed.
changed_paths="$(git status --porcelain -- \
  .github/workflows \
  addon \
  docs \
  scripts \
  tools \
  package.json \
  package-lock.json \
  README.ja.md \
  AGENTS.md \
  CLAUDE.md \
  .gitattributes \
  .editorconfig \
  .eslintrc.cjs \
  .prettierignore \
  .prettierrc.json 2>/dev/null || true)"

if [ -z "$changed_paths" ]; then
  exit 0
fi

printf '%s\n' "Codex hook: running npm run check for e-hentai-helper"
npm run check
