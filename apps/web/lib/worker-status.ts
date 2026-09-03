export const WORKER_HEARTBEAT_TIMEOUT_MS = 90_000;

export type WorkerPresence = "ONLINE" | "OFFLINE" | "REVOKED";

export function getWorkerPresence(
  lastSeenAt: string | Date | null | undefined,
  revokedAt: string | Date | null | undefined,
  now = Date.now(),
): WorkerPresence {
  if (revokedAt) return "REVOKED";
  if (!lastSeenAt) return "OFFLINE";

  const lastSeen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeen)) return "OFFLINE";

  return now - lastSeen <= WORKER_HEARTBEAT_TIMEOUT_MS ? "ONLINE" : "OFFLINE";
}

export function formatHeartbeatAge(lastSeenAt: string | null | undefined, now = Date.now()): string {
  if (!lastSeenAt) return "Never seen";

  const timestamp = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (seconds < 10) return "a few seconds ago";
  if (seconds < 60) return `${seconds} seconds ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
