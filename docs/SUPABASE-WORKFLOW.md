# How Claude works with Supabase in this project (reusable for other projects)

Short version: **Claude does not log in to Supabase.** In this project it never
holds a Supabase password, database connection string or service-role key. It
writes SQL files and tests them on a throwaway local database; Supabase applies
them itself when code is pushed to GitHub. This keeps secrets out of chat and
means a mistake can't touch live data.

## The five parts

| # | What | Where | Who does it |
|---|------|-------|-------------|
| 1 | Schema changes are **migration files**: `supabase/migrations/<timestamp>_<name>.sql`, applied in order, never edited after they are live | the repo | Claude writes them |
| 2 | Every migration is tested on a **throwaway local Postgres 16 + pgvector**, with a small stub of Supabase's `auth` schema and roles (`supabase/tests/00_supabase_stubs.sql`) and security tests (`supabase/tests/10_security.test.sql`) | `npm run test:db` → `scripts/test-db.sh` | Claude runs it |
| 3 | **Supabase's GitHub integration** applies new migrations to the live project on every push to `main` | Supabase → Project Settings → Integrations → GitHub (working directory `.`, production branch `main`, "Deploy to production" on) | You set it up once |
| 4 | The app talks to Supabase with keys held only in **Vercel environment variables** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) | Vercel → Settings → Environment Variables | You (Claude never sees the values) |
| 5 | Anything that can't be a migration (first admin, enabling extensions) is a few lines of SQL **you paste into Supabase's SQL Editor** | Supabase → SQL Editor | You, when Claude tells you |

## What Claude does in a session

1. Reads `docs/NEXT-SESSION.md` and the latest migration number.
2. Adds the next migration file (higher timestamp than all existing ones). Safe changes only: `create ... if not exists`, additive columns, RLS on every new table.
3. Runs `npm run test:db`: builds a clean database from **all** migrations in order, then runs the security tests (what a signed-in student, a guest and an admin may read or write).
4. For app code, tests use **fakes**, not Supabase: `scripts/api/fakes/{db,auth,admin,server,storage}.ts` stand in for the database, sign-in, and storage so the API routes run offline (`npm run test:api`). The browser tests (`npm run test:e2e`) answer every `/api` call with a fake.
5. Commits and pushes to the working branch, then `git push origin <branch>:main`. That push deploys Vercel and applies the migration to Supabase.
6. Tells you the one thing to check live (for example "open Admin → Health").

## Things Claude must not do (and you should keep it that way)

- Never ask for, paste or store the service-role key, database password or connection string in chat, files or commits.
- Never edit a migration that has already been pushed; add a new one.
- Never run SQL against the live database from a session.
- Keep keys server-side: the service-role client (`src/lib/supabase/admin.ts`) is only for server routes; browsers only get the anon key, and Row Level Security does the protecting.

## Copy this to a new project

1. Put the files in place:
   - `supabase/migrations/` (your SQL, timestamped)
   - `supabase/tests/00_supabase_stubs.sql` (fake `auth.users`, `auth.uid()`, roles `anon`/`authenticated`/`service_role`)
   - `supabase/tests/10_security.test.sql`
   - `scripts/test-db.sh` and `"test:db": "bash scripts/test-db.sh"` in `package.json`
   - (optional) `scripts/api/` fakes if you want offline API tests
2. In the new Supabase project: **Integrations → GitHub**, connect the repo, working directory `.`, production branch `main`, Deploy to production on.
3. Put the three Supabase variables into Vercel (or your host); do not give them to Claude.
4. Add this to the project's `CLAUDE.md`/`AGENTS.md` so every session follows it:

   > Database work: add a new migration file in `supabase/migrations/`, run `npm run test:db`, never touch the live database, never ask for database secrets. A push to `main` applies migrations. Tell the owner any SQL that must be pasted into the Supabase SQL Editor.

5. Postgres 16 with pgvector must exist in the session container for `test:db` (see the top of `scripts/test-db.sh`). If your new project does not use pgvector, remove it from the stubs.

## If you ever want Claude to look at live data

Don't hand over the service-role key. Safer options, in order:
- Run a read-only query yourself in the SQL Editor and paste the result (remove personal data).
- Create a **read-only Postgres role** limited to the tables needed, with a short-lived password, and say so explicitly in the session.
- Use Supabase's official MCP server in **read-only, project-scoped** mode, and only for a development project.

## How to check the live project is in sync

Supabase → Database → Migrations lists what has been applied. It should match the files in `supabase/migrations/`. A failed migration shows there; fix it with a **new** migration.
