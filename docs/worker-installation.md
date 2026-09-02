# Installing a DeployPilot worker

Run the worker on a Docker-capable computer that you control. Install Node.js 20+ and Docker Engine, copy the worker application from this repository, and create a worker registration in the DeployPilot dashboard. The registration response displays a token once.

Create a worker-only environment file on that computer:

```env
WORKER_ID="the-worker-id-from-registration"
WORKER_TOKEN="the-one-time-token-from-registration"
WORKER_API_URL="https://your-api-domain.example"
REDIS_URL="your-redis-url"
DATABASE_URL="your-database-url"
DIRECT_URL="your-direct-database-url"
```

Start the worker with `pnpm --filter @deploypilot/worker dev` during development or `pnpm --filter @deploypilot/worker build && node apps/worker/dist/main.js` in production. The worker sends an authenticated heartbeat every 30 seconds when `WORKER_ID` and `WORKER_TOKEN` are present. If the token is revoked, heartbeat requests stop succeeding and the worker should be removed or registered again.

Never commit this environment file, expose Docker's TCP API, or paste the worker token into a public issue. The worker token is not the same as the Supabase key, GitHub App private key, or Redis password.
