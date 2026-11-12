# ARC AI deployment

ARC AI is deployed as a static site on GitHub Pages. The GitHub Actions workflow extracts `arc-secure.zip` into `dist/` and deploys it automatically when `main` changes.

## GitHub Pages

- Repository: `Rohithannam143/ARC_Claude`
- Site: `https://rohithannam143.github.io/ARC_Claude/`
- Workflow: `.github/workflows/deploy-pages.yml`
- Build command: `npm run build`
- Output directory: `dist`

The build script includes the public Firebase Web App configuration and Supabase project URL/publishable key as defaults. They can be overridden with the existing `FIREBASE_*`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` build environment variables. These values are browser-facing client configuration; never put a Supabase secret key or service-role key in the frontend.

## Firebase Authentication

The app uses Firebase Email/Password Authentication. In Firebase Console:

1. Open Authentication → Sign-in method and enable Email/Password.
2. Open Authentication → Settings → Authorized domains.
3. Add `rohithannam143.github.io` (hostname only).
4. Confirm email/password sign-up and email verification are enabled.

## Guest mode

The ARC Edge Function now accepts Firebase Anonymous Authentication tokens as well as verified email/password tokens (function version 3). This allows guest accounts to receive the same short-lived Supabase user token and use per-user RLS safely. Guest data is associated with the anonymous Firebase UID; users should link/upgrade the anonymous account to an email/password account to retain access across devices and avoid losing data when the anonymous account is cleared.

To enable the client-side guest button, open Firebase Console → Authentication → Sign-in method → Anonymous and enable it. The web client must call Firebase signInAnonymously(auth) when the user selects Continue as Guest, then use the resulting Firebase ID token with the existing ARC token endpoint. The client UI source is packaged inside arc-secure.zip; the front-end button and sign-in flow still need to be added to that source archive.

## Supabase backend

The Supabase project is `oremmzzhmyhqqftexcor` in `ap-southeast-2`.

- Database tables: `public.notes` and `public.ai_usage`.
- Storage bucket: private `files` bucket, 20 MB limit.
- Edge Function: `arc` at `/functions/v1/arc`.
- Function JWT gateway verification is disabled intentionally; the handler verifies Firebase ID tokens itself.
- The function reads the Supabase admin secret from the automatically provided `SUPABASE_SECRET_KEYS` environment variable, with legacy service-role fallback. Do not put either value in the browser.

The database schema is managed through the Supabase migrations already applied to the project. Do not drop tables or rerun the destructive test-data instructions in the source archive.

## Required Edge Function secrets

Open Supabase Dashboard → Edge Functions → Secrets and add:

- `GROQ_API_KEY`: a newly rotated Groq API key.
- `JWT_SECRET`: the current Supabase **legacy JWT signing secret** (HS256), not the public JWKS/JWK and not an arbitrary random string.

The function already defaults to Firebase project ID `e-commerce-2a038` and the GitHub Pages origin `https://rohithannam143.github.io`. You can override these with `FIREBASE_PROJECT_ID` and `ALLOWED_ORIGINS` if the deployment changes. `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` are supplied automatically by Supabase.

Important: this implementation creates short-lived HS256 Supabase user tokens from verified Firebase identities. The signing secret must therefore match a Supabase signing key that the project's Data API still trusts. If the legacy JWT secret has been revoked and the project only trusts an asymmetric ES256 key, this HS256 bridge must be migrated to sign with a trusted private key before note access can work. The public JWK is verification-only and cannot sign tokens.

## Credential safety

The earlier API-keys document and chat contained private credentials. Rotate the Groq key and Supabase secret API key before production use. Keep all replacement secrets in Supabase Edge Function Secrets only. Never commit API-key documents, `.env` files, Groq keys, Supabase secret/service-role keys, or JWT signing secrets.
