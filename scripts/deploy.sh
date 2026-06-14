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
# Requires wrangler authed as the account that owns the `monsoon` project
# (wrangler whoami). Does not touch git — commit/push separately.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="monsoon"
BRANCH="${1:-main}"

# Build + stage dist/ (fails if any private input leaked into the upload set).
bash scripts/build.sh

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
