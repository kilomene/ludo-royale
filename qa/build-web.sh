#!/bin/bash
# Ludo Royale web build: engine (CJS) -> ludo.esm.js -> bundle.js (single file)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/qa"
node build-web-engine.js
./node_modules/.bin/esbuild "$ROOT/web/js/main.js" \
  --bundle --minify --format=iife \
  --outfile="$ROOT/web/js/bundle.js" \
  --log-level=warning
echo "bundle: $(du -h "$ROOT/web/js/bundle.js" | cut -f1)"
