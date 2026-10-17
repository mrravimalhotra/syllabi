# Deploying StudySprint

Stack: Vercel (Next.js app) + Supabase (Postgres + pgvector + Auth) + Cloudflare R2 (files) + Google Gemini API. All on free tiers.

**Never commit real keys** — the repo is public. Keys go into Vercel's env settings, or a local `.env.local` (gitignored).

## 1. Supabase

1. Create a project at supabase.com (or confirm the existing one).
2. In **SQL Editor**, run each migration in `supabase/migrations/`, in order:
   `0001_init.sql`, `0002_chunk_images.sql`, `0003_flash_tier_defaults.sql`, `0004_tighten_rls.sql`.
   (0001 enables the `vector` and `pgcrypto` extensions.)
3. **Authentication → URL Configuration:** set Site URL to your Vercel domain, and add `https://<your-domain>/auth/callback` to Redirect URLs.
4. Decide whether email confirmation is on (Authentication → Providers → Email). Both work; the callback route handles confirmation links.
5. **Project Settings → API Keys:** note the project URL, the publishable key (`sb_publishable_...`) and the secret key (`sb_secret_...`).

## 2. Cloudflare R2

1. In the Cloudflare dashboard: **R2 → Create bucket**, name `studysprint`.
2. **R2 → Manage API tokens → Create token** with *Object Read & Write* on that bucket.
3. Note the Account ID, Access Key ID and Secret Access Key.

## 3. Google Gemini

Create an API key at aistudio.google.com. The default models are Flash tier, which work on the free tier.

## 4. Vercel

1. **Add New → Project →** import `mrravimalhotra/studysprint`.
2. Before the first deploy, add these environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `sb_publishable_...` key (legacy variable name) |
| `SUPABASE_SERVICE_ROLE_KEY` | the `sb_secret_...` key (legacy variable name; server only) |
| `GOOGLE_API_KEY` | Gemini API key |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | from step 2 |
| `R2_BUCKET_NAME` | `studysprint` (default if unset) |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | optional fallbacks |

3. Deploy. Then put the Vercel domain into Supabase's Auth URL settings (step 1.3) if you hadn't yet.

## 5. First admin

Sign up through the app, then in Supabase SQL Editor run:

```sql
update students set role = 'admin', active = true where email = '<your email>';
```

## 6. Smoke test

1. Sign up a second (student) account → it lands on `/pending`.
2. As admin: create a school, grade and subject (`/admin/taxonomy`); activate the student and assign them (`/admin/students`).
3. Upload a few pages (`/admin/documents`) and wait for status `ready`.
4. As the student: generate a solution, download the PDF, and check that quota usage went up.

## Local check

```bash
npm ci && npm run lint && npm run build
```
