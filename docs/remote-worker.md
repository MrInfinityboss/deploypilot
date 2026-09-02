# Remote Docker worker model

A worker is a small process installed on a Docker-capable computer. It opens an outbound HTTPS connection to the DeployPilot API, authenticates with a revocable credential, reports heartbeats, receives only jobs assigned to it, and streams status and redacted logs back to the control plane.

The worker host must not expose `/var/run/docker.sock` through a public port. The worker may access the local Docker socket because it is the trusted bridge on that machine, but all repository checkout, command execution, container resource limits, timeouts, and cleanup must be enforced by the worker adapter. Each job receives a disposable workspace. Worker credentials are stored as hashes by the API and can be revoked from the settings screen.

The initial worker protocol is intentionally small: registration, heartbeat, deployment acceptance, stage updates, log append events, terminal completion, cancellation, and credential revocation. Multiple workers can later be selected by labels and environment policy without changing the deployment record model.
