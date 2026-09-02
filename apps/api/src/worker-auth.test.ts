import { describe, expect, it } from "vitest";
import { createWorkerToken, hashWorkerToken, workerTokenMatches } from "./worker-auth.js";

describe("worker authentication", () => {
  it("creates a token that matches only its own hash", () => {
    const token = createWorkerToken();
    const hash = hashWorkerToken(token);
    expect(token.startsWith("dpw_")).toBe(true);
    expect(workerTokenMatches(token, hash)).toBe(true);
    expect(workerTokenMatches(`${token}-wrong`, hash)).toBe(false);
  });

  it("does not accept malformed hashes", () => {
    expect(workerTokenMatches("dpw_test", "not-a-sha256-hash")).toBe(false);
  });
});
