#!/usr/bin/env bash
# Builds the front end and assembles build/visitor/ and build/visitor-deploy.zip for Bluehost.
# The zip's visitor/ folder becomes the subdomain's document root.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd frontend && npm ci --no-audit --no-fund && npm run build)
OUT=build/visitor
rm -rf build && mkdir -p "$OUT/storage" "$OUT/scripts"
cp -R frontend/dist/. "$OUT/"
cp .htaccess config.php config.local.example.php "$OUT/"
cp -R api lib migrations "$OUT/"
cp scripts/create-it-user.php "$OUT/scripts/"
cp storage/.htaccess "$OUT/storage/.htaccess"
(cd build && zip -qr visitor-deploy.zip visitor)
echo "Built build/visitor-deploy.zip"
