# Provider activation order

The project can be coded and type-checked without production credentials. Credentials are introduced only when the corresponding integration is exercised.

| Phase | Provider values required | Why |
|---|---|---|
| Local UI login | Supabase URL, publishable/anon key | Browser OAuth session |
| Database migration and API persistence | Transaction pooler URI, direct URI | Prisma runtime and migrations |
| GitHub repository sync | GitHub App ID and private key | Installation access tokens |
| Worker queue execution | Redis URL | BullMQ producer and worker |
| Push automation | Public API URL and GitHub webhook secret | GitHub delivery target and HMAC verification |
| Artifact/log archive | R2 endpoint, access key, secret, bucket | Large files outside PostgreSQL |
| Notifications | Resend API key and verified sender | Deployment email |
| Diagnosis | OpenAI API key | Evidence-based failure explanation |
| Production web | Vercel environment variables | Hosted frontend configuration |

## Applying the initial migration

The migration at `packages/database/migrations/0001_initial/migration.sql` is generated from `packages/database/schema.prisma`. After reviewing it, open Supabase SQL Editor, paste the file contents, and run it once. Do not run it repeatedly unless the SQL is made idempotent or the database is reset.

The current API expects the Prisma tables to exist before repository synchronization or deployment creation. RLS policies and a dedicated server-side database role must be added before exposing direct database access to browsers; the API should remain the authorization boundary.

## Public webhook activation

Do not enable the GitHub App webhook until the API has a stable HTTPS URL. Set the GitHub App webhook URL to `<API_URL>/webhooks/github`, create a strong webhook secret, place the same secret in the API environment as `GITHUB_WEBHOOK_SECRET`, and then enable the Push event. Verify the first delivery in GitHub's webhook delivery panel.
