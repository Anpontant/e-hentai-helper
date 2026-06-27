#!/usr/bin/env sh
set -eu

REPO_DIR="/home/iceto/web-app/e-screen"

if [ "${PWD:-}" != "$REPO_DIR" ]; then
  exit 0
fi

if [ ! -f package.json ]; then
  exit 0
fi

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
  .editorconfig \
  .eslintrc.cjs \
  .prettierignore \
  .prettierrc.json 2>/dev/null || true)"

if [ -z "$changed_paths" ]; then
  exit 0
fi

printf '%s\n' "Codex hook: running npm run check for e-hentai-helper"
npm run check
