#!/usr/bin/env bash
# Rebuilds setup.sql from migrations/ (all of them, in order). Run after adding a migration:
#   bash backend/supabase/build-setup.sh
# With --check it only reports whether setup.sql is up to date (used by CI).
set -euo pipefail
cd "$(dirname "$0")"

files=(migrations/*.sql)
first=$(basename "${files[0]}" | cut -c1-3)
last=$(basename "${files[${#files[@]}-1]}" | cut -c1-3)

build() {
  printf -- '-- Organizer: full database setup in one go (same as running migrations %s to %s in order).\n' "$first" "$last"
  printf -- '-- Safe to run more than once.\n\n'
  for f in "${files[@]}"; do
    printf '\n-- ===== %s =====\n' "$(basename "$f")"
    cat "$f"
  done
}

if [ "${1:-}" = "--check" ]; then
  if build | diff -q - setup.sql >/dev/null; then
    echo "setup.sql is up to date"
  else
    echo "setup.sql is out of date: run bash backend/supabase/build-setup.sh" >&2
    exit 1
  fi
else
  build > setup.sql
  echo "setup.sql rebuilt from ${#files[@]} migrations ($first to $last)"
fi
