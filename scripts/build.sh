#!/usr/bin/env bash
# Build dist/ for a Cloudflare Pages direct-upload deploy.
#
# Vite owns the build now: assets are content-hashed (cache-busting is
# automatic) and data/travel-data.json is bundled via src/lib/data.js, so
# dist/ should contain only index.html + assets/. Pages direct-upload does
# NOT honor .assetsignore, so after building we verify that none of the
# private inputs (raw data files, scripts, docs) leaked into the upload set.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

# Guard: fail the deploy staging if anything private ends up in dist/.
leaks=$(find dist -type f \( \
  -name 'safety-inputs-v3.json' -o \
  -name 'fcdo-advice.json' -o \
  -name 'city-content.json' -o \
  -name 'city-media.json' -o \
  -name 'worldbank-homicide.json' -o \
  -name 'wps-community-safety.json' -o \
  -name '*.backup.json' -o \
  -name '*.md' -o \
  -name '*.py' -o \
  -name '*.xlsx' \
\) || true)
if [ -n "$leaks" ]; then
  echo "ERROR: private files staged into dist/ — refusing to deploy:" >&2
  echo "$leaks" >&2
  exit 1
fi

echo "Staged dist/:"
find dist -type f | sort
