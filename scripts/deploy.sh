#!/usr/bin/env bash
# Build and deploy Monsoon to Cloudflare Pages (direct upload).
#
# Pages project `monsoon` is NOT git-connected, so a GitHub push does not
# deploy anything — this script is the release path. It runs the build (which
# includes the private-file leak guard) and then uploads dist/ as the
# production deploy that updates monsoon.fyi.
#
# Usage:
#   scripts/deploy.sh                 # production deploy (branch=main)
#   scripts/deploy.sh <branch>        # preview deploy on a named branch
#
# Runs `npm run check` before the build (SKIP_CHECKS=1 to skip) and
# `npm run check:seo` after it; either failing aborts the deploy.
#
# Requires wrangler authed as the account that owns the `monsoon` project
# (wrangler whoami). Does not touch git — commit/push separately.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="monsoon"
BRANCH="${1:-main}"

# Offline checks first; a failure aborts before anything is built or uploaded.
# SKIP_CHECKS=1 is the escape hatch (skips the checks only, never the build).
if [ "${SKIP_CHECKS:-}" = "1" ]; then
  echo "SKIP_CHECKS=1: skipping npm run check."
else
  npm run check
fi

# Build + stage dist/ (fails if any private input leaked into the upload set).
bash scripts/build.sh

# Static-page checks (script-free pages, JSON-LD, sitemap) against the fresh dist/.
npm run check:seo

echo
echo "Deploying dist/ to Pages project '$PROJECT' (branch: $BRANCH)…"
wrangler pages deploy dist \
  --project-name="$PROJECT" \
  --branch="$BRANCH" \
  --commit-dirty=true

echo
if [ "$BRANCH" = "main" ]; then
  echo "✅ Production deploy live: https://monsoon.fyi"
else
  echo "✅ Preview deploy uploaded for branch '$BRANCH' (see the *.pages.dev URL above)."
fi
