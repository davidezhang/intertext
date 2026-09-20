#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
runtime_root="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if ! command -v node >/dev/null 2>&1; then
  export PATH="$runtime_root/node/bin:$runtime_root/bin/fallback:$PATH"
fi
exec pnpm dev "$@"
