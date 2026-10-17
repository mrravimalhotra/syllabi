# Deploying Syllabi

Stack: Vercel (Next.js app) + Supabase (Postgres + pgvector + Auth) + Cloudflare R2 (files) + Google Gemini API. All on free tiers.

**Never commit real keys** — the repo is public. Keys go into Vercel's env settings, or a local `.env.local` (gitignored).

## 1. Supabase

1. Create a project at supabase.com (or confirm the existing one).
2. Apply the database migrations in `supabase/migrations/` (one of):
   - **GitHub integration (preferred):** Project Settings → Integrations → GitHub → connect `mrravimalhotra/syllabi`, working directory `.`, production branch `main`, **Deploy to production** on. Every push to `main` then applies any new migrations automatically.
   - **By hand:** in **SQL Editor**, run each file in filename order (the first one enables the `vector` and `pgcrypto` extensions). Don't mix the two methods on the same database: the integration tracks what it has applied and would re-run hand-applied files.
3. **Authentication → URL Configuration:** set Site URL to your Vercel domain, and add `https://<your-domain>/auth/callback` to Redirect URLs.
4. Decide whether email confirmation is on (Authentication → Providers → Email). Both work; the callback route handles confirmation links.
5. Password reset ("Forgot password?") emails come from Supabase's built-in sender, which is rate-limited (a few emails per hour). That is fine for testing; add your own SMTP sender (Authentication → Emails → SMTP Settings) before opening sign-ups. The reset link lands on `/auth/callback`, so the Redirect URL from step 3 is required.
5. **Project Settings → API Keys:** note the project URL, the publishable key (`sb_publishable_...`) and the secret key (`sb_secret_...`).

## 2. Cloudflare R2

1. In the Cloudflare dashboard: **R2 → Create bucket**, name `syllabi`.
2. **R2 → Manage API tokens → Create token** with *Object Read & Write* on that bucket.
3. Note the Account ID, Access Key ID and Secret Access Key.

## 3. Google Gemini

Create an API key at aistudio.google.com. The default models are Flash tier, which work on the free tier.

## 4. Vercel

1. **Add New → Project →** import `mrravimalhotra/studysprint` (or the new name, if you renamed the repo). Name the Vercel project `syllabi`.
2. Before the first deploy, add these environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `sb_publishable_...` key (legacy variable name) |
| `SUPABASE_SERVICE_ROLE_KEY` | the `sb_secret_...` key (legacy variable name; server only) |
| `GOOGLE_API_KEY` | Gemini API key |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | from step 2 |
| `R2_BUCKET_NAME` | `syllabi` (default if unset) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | optional fallbacks |
| `ADMIN_EMAIL` | your email: during private testing, the only address allowed to sign up |
| `OPEN_SIGNUPS` | `false` during private testing; set `true` (and redeploy) to let parents and tutors sign up |

3. Server region is pinned to Mumbai (`bom1`, next to the Supabase database in South Asia (Mumbai)) by `vercel.json`; change it there if the database moves.
4. Deploy. Then put the Vercel domain into Supabase's Auth URL settings (step 1.3) if you hadn't yet.

## 5. First admin

Sign up through the app, then in Supabase SQL Editor run:

```sql
update students set role = 'admin', active = true where email = '<your email>';
```

## 6. Smoke test

1. Sign up a second account (parent or tutor) → it lands on `/pending`.
2. As admin: grant it access (`/admin/students`).
3. As that account: upload a few pages under **My books** (`/dashboard/library`), tick the ownership box, and wait for status `ready`.
4. Generate a solution (optionally with a photo), download the PDF, and check that quota usage went up (reading the pages counts too).
5. Sign in as a different account and confirm it cannot see or search the first account's books.

## Local check

```bash
npm ci && npm run lint && npm run build
```
