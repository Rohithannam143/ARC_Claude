# ARC AI deployment notes

The repository contains the original `arc-secure.zip`. Vercel runs `npm run build`, extracts that archive into `dist/`, and serves it as a static site.

## Vercel build settings

- Framework preset: Other
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`
- Root directory: repository root

## Public browser configuration (Vercel Environment Variables)

Set these for Production, Preview, and Development as appropriate:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_APP_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

These are browser-facing Firebase/Supabase client settings. The Supabase anon key is public by design and must be protected by RLS. Do not use a service-role key here.

## Private Supabase Edge Function secrets

Deploy `arc-function.ts` as `supabase/functions/arc/index.ts` and configure these in Supabase Edge Function secrets, not in GitHub and not in browser variables:

- `GROQ_API_KEY`
- `FIREBASE_PROJECT_ID`
- `JWT_SECRET`
- `ALLOWED_ORIGINS` (the exact deployed Vercel origin)
- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` (provided automatically in Supabase Edge Functions; do not hard-code them)

Run `schema.sql` in the Supabase SQL Editor. Follow the setup instructions in the archive's README.

## Security

Never commit API-key files, `.env` files, Supabase service-role keys, JWT secrets, or Groq keys. If any private key was committed or exposed, revoke and rotate it immediately.
