# DeployPilot Production Runbook

## Purpose

This runbook describes how to operate DeployPilot after the first production release. DeployPilot consists of a Next.js dashboard, a NestJS API, Supabase PostgreSQL and Auth, hosted Redis, a Docker worker controlled by the owner, Cloudflare R2 log storage, Resend notifications, and OpenAI diagnosis.

> **Security boundary:** Production credentials remain in the hosting providers' secret managers. Never commit them to GitHub, place them in frontend code, or paste them into support messages.

## Production architecture

| Component | Provider or location | Responsibility |
|---|---|---|
| Web dashboard | Vercel | Serves the authenticated Next.js interface |
| Control-plane API | Render | Owns authentication, authorization, webhooks, deployment state, SSE, R2, Resend, and OpenAI calls |
| Database and authentication | Supabase | Stores application records and provides GitHub login |
| Queue | Upstash Redis | Carries deployment jobs through BullMQ |
| Worker | Owner-controlled Docker computer | Executes bounded Docker deployment jobs and sends heartbeats |
| Log archive | Cloudflare R2 | Stores deployment logs as JSONL and provides signed downloads |
| Email | Resend | Sends deployment result notifications |

## Required environment variables

### Render API

```env
DATABASE_URL=<Supabase pooled connection string>
DIRECT_URL=<Supabase direct connection string>
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
REDIS_URL=<Upstash Redis URL>
WEB_ORIGIN=https://<your-vercel-domain>
GITHUB_APP_ID=<GitHub App ID>
GITHUB_PRIVATE_KEY_PATH=/etc/secrets/github-private-key.pem
GITHUB_WEBHOOK_SECRET=<GitHub webhook secret>
R2_ENDPOINT=<Cloudflare R2 S3 endpoint>
R2_ACCESS_KEY_ID=<R2 access key>
R2_SECRET_ACCESS_KEY=<R2 secret>
R2_BUCKET=<R2 bucket name>
RESEND_API_KEY=<Resend sending key>
RESEND_FROM_EMAIL=DeployPilot <verified-sender@example.com>
OPENAI_API_KEY=<OpenAI API key>
OPENAI_MODEL=gpt-4.1-mini
```

`NEXT_PUBLIC_*` variables are safe for the browser only when they are intended to be public. All database, Redis, GitHub private key, R2, Resend, and OpenAI credentials must remain server-side.

### Vercel web application

```env
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
NEXT_PUBLIC_API_URL=https://<your-render-api-domain>
```

### Local worker

```env
API_URL=https://<your-render-api-domain>
WORKER_ID=<registered worker ID>
WORKER_TOKEN=<worker token>
REDIS_URL=<same hosted Redis URL used by the API>
```

The API and worker must use the exact same Redis instance. `localhost` is valid only when both services use the same local Redis service.

## Deployment procedure

Push a commit to the configured repository and branch. GitHub sends a signed `push` webhook to the API. The API validates the signature, checks the repository configuration, creates a queued deployment, and places a BullMQ job in Redis. The worker claims the job, executes each stage, persists logs and events, and finalizes the deployment.

For a manual deployment, open **Dashboard → Deploy**, select the repository, configuration, environment, and online worker, then start the deployment. The Overview page refreshes its metrics automatically while it remains open. The deployment detail page provides live stage and log events.

## Worker operations

Start the worker from the repository root:

```powershell
pnpm install
pnpm --filter @deploypilot/worker exec tsx src/main.ts
```

A healthy startup includes:

```text
[worker] Redis connection ready
[worker] queue waiting...
DeployPilot worker online
```

The worker should also print periodic heartbeat messages. A completed job prints its deployment ID and may print a notification result.

### Rotate a worker token

Open **Dashboard → Workers**, select the worker, and click **Rotate token**. The previous token is invalidated immediately. Copy the replacement token and update the local worker's `WORKER_TOKEN` before restarting it.

### Revoke a worker

Use **Revoke access** when a computer is retired or no longer trusted. Revocation immediately blocks heartbeats and deployment result callbacks. Register a new worker when access must be restored.

## Recovery behavior

The API checks every 30 seconds for deployments that have been running for at least five minutes while their worker heartbeat has been missing for more than two minutes. Such deployments are marked `TIMED_OUT`, the active stage is marked failed, and a recovery log and event are written.

A deployment can be retried from its detail page after the worker is healthy. If the worker finishes after recovery, the worker reports the deployment's actual terminal status rather than overwriting the recovered status.

## Logs, archives, and downloads

Live logs are stored in PostgreSQL and streamed through deployment events. A completed deployment can be archived to R2 from its detail page. The API stores an `application/x-ndjson` object at:

```text
deployments/<deployment-id>/logs.jsonl
```

Downloads use short-lived signed URLs. Treat downloaded logs as operational data because they may contain repository build output.

## Notifications

The API sends a Resend email after a worker reports a terminal deployment result. If Resend is not configured, the deployment still completes and the worker reports that notification delivery was skipped. Check the worker output and the Resend dashboard when an expected email is missing.

## AI diagnosis

Open **Dashboard → AI Assistant**, enter a failed deployment ID, and generate a diagnosis. The API sends redacted deployment evidence to OpenAI. The diagnosis is cached by deployment and input hash. The system instructs the model not to invent evidence or request secret values.

If diagnosis is unavailable, verify `OPENAI_API_KEY` and `OPENAI_MODEL` on Render. AI output is advisory and must not be treated as an automatic change to infrastructure or source code.

## Health checks

Use these endpoints after an API deployment:

```bash
curl https://<your-render-api-domain>/health
curl https://<your-render-api-domain>/ready
```

`/health` confirms that the API process responds. `/ready` checks the database and Redis dependencies. A Redis failure makes the API not ready even if the process itself is reachable.

## Troubleshooting matrix

| Symptom | Likely cause | Action |
|---|---|---|
| Dashboard cannot load data | Incorrect API URL, expired session, or CORS origin | Check Vercel `NEXT_PUBLIC_API_URL`, Supabase session, and Render `WEB_ORIGIN` |
| Deployment remains queued | Worker offline, wrong Redis URL, or worker token rejected | Check worker startup, Redis readiness, worker status, and token |
| Worker heartbeat returns 401 | Token was rotated or revoked | Copy the current token from Workers and restart the worker |
| Worker heartbeat returns 502 | API or Redis is unavailable | Check Render logs and `/ready` |
| R2 archive fails | Missing R2 variable or wrong bucket endpoint | Verify all R2 variables on Render |
| Email is not delivered | Resend key/sender issue or spam filtering | Check Render variables and the Resend delivery log |
| Diagnosis is unavailable | Missing OpenAI key or provider error | Verify OpenAI configuration and API availability |
| Dashboard totals are stale | Vercel deployment not complete or page has not loaded | Confirm the latest Vercel deployment and wait for the 15-second refresh |

## Release checklist

Before a release, run:

```bash
pnpm typecheck
pnpm test
pnpm --filter @deploypilot/web build
```

Then confirm the repository is clean, push the intended commit, wait for Render and Vercel deployments to become live, check `/health` and `/ready`, and perform one end-to-end deployment from GitHub push through worker completion.

A stable release should also verify one R2 archive download, one Resend notification, one AI diagnosis, one worker token rotation, and one dashboard metric refresh.

## Incident response

If a worker or credential is compromised, revoke the worker immediately, rotate any affected token or provider key, and inspect recent deployment and webhook activity. If a GitHub App secret is exposed, regenerate the private key and webhook secret. If an OpenAI, Resend, or R2 credential is exposed, revoke it at the provider and replace the Render variable. Never attempt to conceal an incident by deleting deployment logs before preserving the relevant evidence.

## References

[1]: https://supabase.com/docs "Supabase documentation"
[2]: https://render.com/docs "Render documentation"
[3]: https://vercel.com/docs "Vercel documentation"
[4]: https://developers.cloudflare.com/r2/ "Cloudflare R2 documentation"
[5]: https://resend.com/docs "Resend documentation"
[6]: https://platform.openai.com/docs "OpenAI documentation"
[7]: https://docs.github.com/en/webhooks "GitHub webhooks documentation"
