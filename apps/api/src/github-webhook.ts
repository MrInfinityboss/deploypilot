import { createHmac, timingSafeEqual } from "node:crypto";

export type PushPayload = {
  ref?: string;
  after?: string;
  repository?: { id?: number; full_name?: string; default_branch?: string };
  sender?: { login?: string };
};

export function verifyGitHubSignature(rawBody: Buffer, signature: string | undefined, secret: string | undefined) {
  if (!signature || !secret || !signature.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function branchFromRef(ref: string | undefined) {
  return ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : undefined;
}
