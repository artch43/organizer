#!/usr/bin/env bash
# Applies setup.sql twice (it must be safe to re-run) to an empty Postgres
# that mimics Supabase, then runs db.test.sql. Exits non-zero if any check fails.
#   With DATABASE_URL set (CI): uses that database.
#   Without it: starts a throwaway postgres:16 container (needs Docker).
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${DATABASE_URL:-}" ]; then
  name=organizer-db-tests
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" -e POSTGRES_PASSWORD=test postgres:16 >/dev/null
  trap 'docker rm -f "$name" >/dev/null' EXIT
  until docker exec "$name" pg_isready -U postgres -q 2>/dev/null; do sleep 0.3; done
  sleep 1
  run() { docker exec -i "$name" psql -U postgres -X -v ON_ERROR_STOP=1 -q "$@"; }
else
  run() { psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q "$@"; }
fi

run < supabase-stub.sql
# pg_cron isn't in the plain image; the stub provides the cron schema instead.
for pass in 1 2; do
  grep -v "create extension if not exists pg_cron" ../setup.sql | run >/dev/null 2>&1 ||
    { grep -v "create extension if not exists pg_cron" ../setup.sql | run; exit 1; }
done
echo "setup.sql applied twice"

out=$(run < db.test.sql 2>&1)
echo "$out" | grep -oE "(PASS|FAIL) .*"
if echo "$out" | grep -q "FAIL" || ! echo "$out" | grep -q "PASS"; then
  echo "database tests failed" >&2
  exit 1
fi
