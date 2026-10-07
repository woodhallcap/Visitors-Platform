#!/usr/bin/env bash
# Builds the deploy zip and checks what it ships, and what it must never ship.
set -euo pipefail
cd "$(dirname "$0")/.."
scripts/package.sh >/dev/null
LIST=$(unzip -Z1 build/visitor-deploy.zip)
fail=0
need() { grep -qx "visitor/$1" <<<"$LIST" || { echo "MISSING: $1"; fail=1; }; }
never() { if grep -qE "^visitor/$1" <<<"$LIST"; then echo "MUST NOT SHIP: $1"; fail=1; fi; }
for f in index.html favicon.svg .htaccess config.php config.local.example.php api/index.php lib/bootstrap.php lib/visits.php lib/stats.php \
  migrations/001_init.sql migrations/002_indexes.sql migrations/migrate.php scripts/create-it-user.php storage/.htaccess; do
  need "$f"
done
grep -qE '^visitor/assets/index-[^/]+\.js$' <<<"$LIST" || { echo "MISSING: built JS bundle"; fail=1; }
for p in 'tests/' 'docs/' 'frontend/' 'node_modules/' 'config\.local\.php$' 'storage/sessions' 'storage/logs' '\.superpowers' '\.git/' 'build/'; do
  never "$p"
done
grep -q 'RewriteRule \^api' build/visitor/.htaccess || { echo "MISSING: API rewrite in .htaccess"; fail=1; }
[ "$fail" -eq 0 ] && echo "package OK"
exit "$fail"
