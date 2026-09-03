import { describe, expect, it } from "vitest";
import { WORKER_HEARTBEAT_TIMEOUT_MS, formatHeartbeatAge, getWorkerPresence } from "./worker-status";

describe("getWorkerPresence", () => {
  const now = Date.parse("2026-09-03T12:00:00.000Z");

  it("reports a worker online while its heartbeat is fresh", () => {
    expect(getWorkerPresence(new Date(now - WORKER_HEARTBEAT_TIMEOUT_MS), null, now)).toBe("ONLINE");
  });

  it("reports a worker offline after the heartbeat timeout", () => {
    expect(getWorkerPresence(new Date(now - WORKER_HEARTBEAT_TIMEOUT_MS - 1), null, now)).toBe("OFFLINE");
  });

  it("reports workers without a heartbeat as offline", () => {
    expect(getWorkerPresence(null, null, now)).toBe("OFFLINE");
  });

  it("keeps revoked workers revoked even if they recently checked in", () => {
    expect(getWorkerPresence(new Date(now), new Date(now), now)).toBe("REVOKED");
  });

  it("treats invalid timestamps as offline", () => {
    expect(getWorkerPresence("not-a-date", null, now)).toBe("OFFLINE");
  });
});

describe("formatHeartbeatAge", () => {
  const now = Date.parse("2026-09-03T12:00:00.000Z");

  it("formats a recent heartbeat for the dashboard", () => {
    expect(formatHeartbeatAge(new Date(now - 23_000).toISOString(), now)).toBe("23 seconds ago");
  });

  it("handles a worker that has never checked in", () => {
    expect(formatHeartbeatAge(null, now)).toBe("Never seen");
  });
});
