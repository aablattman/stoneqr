#!/usr/bin/env bash
#
# Deploy StoneQR to Cloudflare Pages as static assets.
# Builds apps/site with adapter-static, then uploads ./apps/site/build.
#
# Usage:
#   ./deploy.sh              # build and deploy to production
#   ./deploy.sh --dry-run    # build and list the output, no upload
#
# Requires: bun, wrangler (npx wrangler), already authenticated (`npx wrangler whoami`).
# First time: `npx wrangler pages project create stoneqr --production-branch main`,
# then add the custom domain stoneqr.app in the Cloudflare dashboard.

set -euo pipefail
cd "$(dirname "$0")"

PROJECT="stoneqr"
DIST="apps/site/build"

echo "→ Running engine tests"
bun run --cwd packages/engine test

echo "→ Refreshing sitemap lastmod dates from git"
bun run scripts/sitemap.mjs > /dev/null

echo "→ Building site"
bun run --cwd apps/site build

if [[ "${1:-}" == "--dry-run" ]]; then
  echo "→ Dry run — contents of ./$DIST:"
  find "$DIST" -type f | sort
  exit 0
fi

echo "→ Deploying ./$DIST to Cloudflare Pages project '$PROJECT'"
npx wrangler pages deploy "$DIST" --project-name "$PROJECT"

# Pages can serve the new index.html before every hashed asset is reachable from every edge. In
# that window a request for a missing asset gets the not-found page, and the _headers rule for
# /_app/immutable/* stamps it with a one-year immutable cache header, so the edge and the first
# browser to ask keep a broken page (seen 2026-09-04). Poll with a throwaway query string, which
# has its own cache key, so the checks can never poison the canonical one; once every asset is
# right, fetch the canonical URLs once to warm them with the real files.
ORIGIN="https://stoneqr.app"
echo "→ Waiting for every asset to be served from $ORIGIN"
# The service worker is checked and warmed with them: it precaches every one of these on install
# and fails the install (retrying on the next load) if any is still a 404, so it must be live too.
ASSETS=$(cd "$DIST" && { find _app/immutable -type f \( -name '*.js' -o -name '*.css' \); echo service-worker.js; } | sort)
COUNT=$(echo "$ASSETS" | wc -l | tr -d ' ')
check() {
  local ct
  ct=$(curl -s -o /dev/null -w '%{content_type}' -H 'Accept-Encoding: gzip, deflate, br' "$ORIGIN/$1?check=$2")
  case "$1:$ct" in
    *.js:application/javascript*|*.css:text/css*) return 0 ;;
    *) return 1 ;;
  esac
}
missing=1
for attempt in $(seq 1 24); do
  missing=0
  for f in $ASSETS; do check "$f" "$attempt$(date +%s)" || missing=$((missing + 1)); done
  [[ $missing -eq 0 ]] && break
  echo "  $missing of $COUNT assets not served yet (attempt $attempt of 24), waiting 5 s"
  sleep 5
done
if [[ $missing -ne 0 ]]; then
  echo "✗ $missing assets still missing after two minutes. Do not open the site until they appear." >&2
  exit 1
fi
for f in $ASSETS; do curl -s -o /dev/null -H 'Accept-Encoding: gzip, deflate, br' "$ORIGIN/$f"; done
echo "✓ All $COUNT assets are served and warm. Verify at $ORIGIN"
