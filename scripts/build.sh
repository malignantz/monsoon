#!/usr/bin/env bash
# Build dist/ for a Cloudflare Pages direct-upload deploy.
#
# Vite owns the build now: assets are content-hashed (cache-busting is
# automatic) and data/travel-data.json is split into src/generated/ and loaded
# via src/lib/data.svelte.js, so dist/ should contain only index.html, assets/
# and the public/ files (robots.txt, og.png, clearStorage.html, 404.html, the
# favicon set + site.webmanifest, and Pages' _headers/_redirects), plus the static
# SEO surface scripts/seo/build-seo.mjs adds after the SPA build: city/<slug>/,
# best/ (the index, where-to-be-in-<month>/ and region hubs), cities/ and
# compare/ (an index.html each), og/ (build-time .png share images), the
# sitemap index sitemap.xml with its sitemap-<type>.xml children, and llms.txt.
# Pages direct-upload does NOT honor .assetsignore, so after
# building we verify that none of the private inputs (raw data files, scripts,
# docs) leaked into the upload set, and that no private input TEXT was rendered
# into the SEO pages (scripts/seo/leak-check.mjs).
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

# Static SEO pages (hub layer): standalone HTML that reuses the app's own
# scoring via Vite's SSR loader. The SPA output above is left untouched.
node scripts/seo/build-seo.mjs

# Guard: fail the deploy staging if anything private ends up in dist/.
leaks=$(find dist -type f \( \
  -name 'safety-inputs-v3.json' -o \
  -name 'fcdo-advice.json' -o \
  -name 'city-content.json' -o \
  -name 'city-media.json' -o \
  -name 'worldbank-homicide.json' -o \
  -name 'wps-community-safety.json' -o \
  -name 'climate-normals.json' -o \
  -name 'air-climatology.json' -o \
  -name 'air-overrides.json' -o \
  -name 'air-calibrated.json' -o \
  -name 'climate-calibrated.json' -o \
  -name 'climate-air-holdbacks.json' -o \
  -name 'station-normals.json' -o \
  -name 'legacy-climate-air.json' -o \
  -name 'travel-data.json' -o \
  -name 'swim-inputs.json' -o \
  -path '*/cost-evidence/*' -o \
  -path '*/data/cities/*' -o \
  -name '_schema.json' -o \
  -path '*/raw/*' -o \
  -name '*.backup.json' -o \
  -name '*.md' -o \
  -name '*.py' -o \
  -name '*.mjs' -o \
  -name '*.xlsx' -o \
  -path 'dist/city/*' ! -name 'index.html' -o \
  -path 'dist/best/*' ! -name 'index.html' -o \
  -path 'dist/cities/*' ! -name 'index.html' -o \
  -path 'dist/compare/*' ! -name 'index.html' -o \
  -path 'dist/og/*' ! -name '*.png' \
\) || true)
if [ -n "$leaks" ]; then
  echo "ERROR: private files staged into dist/ — refusing to deploy:" >&2
  echo "$leaks" >&2
  exit 1
fi

# Guard: the SEO pages render only allowlisted public fields
# (src/seo/publicData.js); fail if any private input text — cost-evidence
# notes/quotes, safety rationale and audit notes — shows up in them.
node scripts/seo/leak-check.mjs

count() { find "$1" -name index.html 2>/dev/null | wc -l | tr -d ' '; }
count_png() { find "$1" -name '*.png' 2>/dev/null | wc -l | tr -d ' '; }
echo "Staged dist/ (SEO trees summarized):"
find dist -type f -not -path 'dist/city/*' -not -path 'dist/best/*' -not -path 'dist/cities/*' -not -path 'dist/compare/*' -not -path 'dist/og/*' | sort
echo "dist/city/ $(count dist/city) pages · dist/best/ $(count dist/best) pages · dist/cities/ $(count dist/cities) page · dist/compare/ $(count dist/compare) pages · dist/og/ $(count_png dist/og) images"
