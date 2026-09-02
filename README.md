# DeployPilot

DeployPilot is a production-oriented deployment control plane for three connected workflows: a GitHub push can create a deployment, the dashboard can manage Docker workloads on registered computers, and the product can run as a live hosted service.

## Architecture

The Next.js web application is designed for Vercel. The API owns authentication, authorization, GitHub webhooks, deployment records, and event streaming. Supabase provides PostgreSQL and Supabase Auth. Redis backs BullMQ. A DeployPilot Worker Agent runs on each Docker-capable computer and communicates outbound with the API; Docker is never exposed directly to the public internet. Cloudflare R2 stores archived logs and artifacts, Resend handles email notifications, and Cloudflare manages DNS.

The code is intentionally portable. Production credentials, domains, hosting accounts, and billing remain under the owner's control and are never committed to this repository.

## Repository layout

| Path | Responsibility |
|---|---|
| `apps/web` | Next.js dashboard deployed to Vercel |
| `apps/api` | NestJS control-plane API |
| `apps/worker` | BullMQ worker and future Docker execution adapter |
| `packages/database` | Prisma schema for Supabase PostgreSQL |
| `packages/shared` | Deployment, worker, and SSE contracts |
| `infra` | Local Docker Compose services |
| `docs` | Service setup and operational runbooks |

## Local start

Install Node.js 20+, pnpm 9+, and Docker. Copy `.env.example` to `.env`, then start the local dependencies:

```bash
cp .env.example .env
cd infra
cp ../.env .env
 docker compose up -d postgres redis
cd ..
pnpm install
pnpm --filter @deploypilot/api dev
pnpm --filter @deploypilot/worker dev
```

The API health endpoint is available at `http://localhost:4000/health`. The web application will be added to the same local workflow as the dashboard milestones are implemented.

## Production setup order

1. Create a Supabase project and place its pooled connection string in `DATABASE_URL` and direct connection string in `DIRECT_URL`.
2. Configure Supabase Auth with GitHub as the provider and add the production callback URL.
3. Create the GitHub App with minimum repository permissions and a webhook secret.
4. Create a Redis instance and set `REDIS_URL`.
5. Create a Cloudflare R2 bucket and configure its endpoint and credentials.
6. Deploy `apps/web` to Vercel and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_URL`.
7. Deploy the API to a Node-compatible host, then run migrations against Supabase.
8. Install the worker agent on each Docker-capable computer. The agent will use a revocable worker credential and outbound HTTPS; do not publish the Docker socket.
9. Configure the Cloudflare domain and Resend sender only after the application endpoints are working.

Detailed provider-specific runbooks will be added as the corresponding integrations are implemented. Never put production secrets in GitHub, source files, Docker images, or client-side environment variables.

## Delivery milestones

The first implementation slice establishes the monorepo, contracts, schema, local dependencies, and health boundaries. Next slices will add Supabase session verification, GitHub App repository access, deployment creation and outbox handling, the worker registration protocol, Docker execution limits, durable logs/SSE replay, push webhooks, and grounded AI diagnosis.

## Safety boundary

Builds execute only on explicitly registered workers. Repository input must be validated before reaching a process runner. Worker jobs must use disposable workspaces, timeouts, CPU/memory/PID limits, secret redaction, and a non-privileged container policy. The API must never mark a deployment successful; only the worker can finalize execution after final events are persisted.
