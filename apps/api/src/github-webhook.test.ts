import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { branchFromRef, verifyGitHubSignature } from "./github-webhook.js";

describe("GitHub webhook verification", () => {
  it("accepts a valid SHA-256 signature", () => {
    const body = Buffer.from('{"ok":true}');
    const secret = "test-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyGitHubSignature(body, signature, secret)).toBe(true);
    expect(verifyGitHubSignature(body, "sha256=bad", secret)).toBe(false);
  });

  it("only extracts branch refs", () => {
    expect(branchFromRef("refs/heads/main")).toBe("main");
    expect(branchFromRef("refs/tags/v1.0.0")).toBeUndefined();
  });
});
