#!/bin/sh
# Compatibility for existing Render build commands; npm postinstall already
# performs setup. This call is idempotent and also works if scripts were skipped.
cd "$(dirname "$0")/.." || exit 1
node scripts/setup-downloader.js
