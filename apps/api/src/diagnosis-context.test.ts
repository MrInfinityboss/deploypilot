import { describe, expect, it } from "vitest";
import { buildDiagnosisContext, redactLog } from "./diagnosis-context.js";

describe("diagnosis context safety", () => {
  it("redacts common secret assignments", () => {
    expect(redactLog("TOKEN=super-secret API_KEY:abc123 started")).toContain("TOKEN=[REDACTED]");
    expect(redactLog("TOKEN=super-secret API_KEY:abc123 started")).not.toContain("super-secret");
  });

  it("hashes a context containing names but not values", () => {
    const result = buildDiagnosisContext({ status: "FAILED", commitSha: "abc", logs: [{ sequence: 1, stage: "build", level: "error", message: "PASSWORD=hunter2 failed" }], profile: {}, requiredSecretNames: ["PASSWORD"] });
    expect(result.context.requiredSecretNames).toEqual(["PASSWORD"]);
    expect(JSON.stringify(result.context)).not.toContain("hunter2");
    expect(result.inputHash).toHaveLength(64);
  });
});
