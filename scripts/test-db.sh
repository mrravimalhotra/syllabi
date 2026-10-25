#!/usr/bin/env bash
# Builds a throwaway local Postgres from every migration in order, then runs
# the database test suites in supabase/tests. Needs Postgres 16 + pgvector.
# Usage: npm run test:db
set -euo pipefail

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"
LOG="$DATA/postgres.log"
RUN_AS=()
# Postgres refuses to run as root; use the postgres OS user when we are root.
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DATA"; RUN_AS=(runuser -u postgres --); fi

cleanup() { "${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$DATA" -U postgres -A trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$LOG" start >/dev/null

PSQL=("${RUN_AS[@]}" psql -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stubs.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f" >/dev/null || { echo "Migration failed: $(basename "$f")"; exit 1; }
done
echo "Applied $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrations."

status=0
for t in "$ROOT"/supabase/tests/*.test.sql; do
  echo "== $(basename "$t")"
  out="$("${PSQL[@]}" -t -A -f "$t")"
  echo "$out"
  echo "$out" | grep -q '^FAIL' && status=1
done
exit $status
