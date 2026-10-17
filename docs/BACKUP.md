# Backup and recovery

Syllabi keeps data in two places. Both can be copied to your own computer.

| What | Where | Holds |
|---|---|---|
| Database | Supabase | Accounts, books and their text, the search index, saved answers, usage |
| Files | Cloudflare R2 (bucket `syllabi`) | The image of every book page |

## Take a backup (about once a month, and before big changes)

1. Install the PostgreSQL client tools so `pg_dump` exists (Mac: `brew install libpq`; Linux: `apt install postgresql-client`).
2. In Supabase: Project Settings → Database → Connection string → URI. Copy it (it contains your database password).
3. In a terminal in the project folder, with your own keys (never paste them into chat or commit them):

   ```
   SUPABASE_DB_URL="postgresql://..." \
   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
   npm run backup
   ```

   Keys may instead go in a `.env.local` file, which git ignores.
4. The copy appears in `backups/<date>/` (`database.sql` and a `files/` folder). Move it to a safe place, such as an encrypted drive. It holds your family's data.

Supabase's free plan keeps no downloadable daily backups, so this script is the only copy you control.

## Restore

- **Database:** create a new Supabase project, apply `supabase/migrations/` in order, then run `psql "<new connection string>" -f database.sql` (data only matters; if tables already exist, restore into the empty ones).
- **Files:** upload the `files/` folder contents to the R2 bucket keeping the same paths (`sources/<book id>/page-N.jpg`), for example with the Cloudflare dashboard or `rclone`.
- Set the environment variables in Vercel for the new project and redeploy.

Test a restore on a throwaway Supabase project once, so you know it works before you need it.
