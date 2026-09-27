#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export HOST=0.0.0.0
export PORT=3000
export ORIGIN=http://172.16.19.235:3000
exec bun --env-file=.env apps/web/build/index.js
