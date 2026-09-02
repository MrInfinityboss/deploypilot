# Worker setup

A worker is installed on a computer that you control and that has Docker Engine available. It communicates outbound to the DeployPilot API. No inbound port and no public Docker socket are required.

The dashboard will eventually create a worker registration token. The token is shown once, stored only as a SHA-256 hash by the API, and must be placed in the worker host's secret environment. If the token is lost, revoke the worker and register it again. Heartbeats update `lastSeenAt`; a worker is considered offline after the configured heartbeat grace period.

The worker must run with a disposable workspace, a non-root runtime where possible, bounded CPU/memory/PID limits, a maximum deployment timeout, secret redaction, and cleanup after every job. Do not install the worker with a token committed in a repository or expose `/var/run/docker.sock` through a reverse proxy.

Current API boundaries:

```text
POST /v1/repositories/:repositoryId/workers/register
POST /v1/workers/:workerId/heartbeat
```

The registration response contains the token once. Heartbeats use `Authorization: Bearer <worker-token>` and should be sent at least every 30 seconds in production.
