#!/usr/bin/env bash
# Saves a copy of Syllabi's data on this computer: the database (accounts,
# books' text and search index, saved answers) and every stored page image.
#
#   SUPABASE_DB_URL="postgresql://postgres...:5432/postgres" \
#   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
#   npm run backup
#
# Keys are read from the environment (or a gitignored .env.local); nothing is
# written to the repository. Output goes to ./backups/<date>/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env.local ] && set -a && . ./.env.local && set +a

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the database connection string (Supabase > Project Settings > Database > Connection string, URI).}"
command -v pg_dump >/dev/null || { echo "pg_dump is not installed. Install the PostgreSQL client tools (e.g. 'brew install libpq' or 'apt install postgresql-client') and try again." >&2; exit 1; }

dir="backups/$(date +%Y-%m-%d)"
mkdir -p "$dir"
echo "Saving the database to $dir/database.sql ..."
pg_dump --no-owner --no-privileges --schema=public --file="$dir/database.sql" "$SUPABASE_DB_URL"
echo "Saving stored page images to $dir/files/ ..."
node scripts/backup/files.mjs "$dir/files"
echo "Done. Keep this folder somewhere safe (it contains your books and your family's data)."
