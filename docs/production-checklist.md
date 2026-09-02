# Production checklist

Before launch, create separate staging and production environments. Configure the web application on Vercel with only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_URL`. Configure the API host with database, GitHub, Redis, R2, Resend, and AI secrets server-side. Configure the worker host with its revocable worker token and API URL.

Run the migration against Supabase, enable GitHub login, and add exact production redirect URLs. Register the GitHub App on the intended repositories only. Keep the webhook disabled until the API responds over HTTPS, then enable only the Push event. Confirm that an invalid signature is rejected and that a repeated delivery ID does not create a second deployment.

For the Docker host, disable public Docker API exposure, restrict SSH access, use a non-root worker process where practical, configure disk cleanup, and monitor CPU, memory, process count, and workspace retention. Rotate worker tokens and provider keys if they are ever exposed. Keep `.env` files out of Git and configure secret scanning in the repository.
