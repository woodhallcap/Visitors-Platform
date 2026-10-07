#!/usr/bin/env bash
# Runs every PHP test file; exits non-zero if any file fails.
set -u
cd "$(dirname "$0")/.."
status=0
for file in tests/php/test_*.php; do
  [ "$file" = "tests/php/test_helper.php" ] && continue
  echo "== $file"
  php "$file" || status=1
done
exit $status
