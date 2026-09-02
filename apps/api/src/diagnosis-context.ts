import { createHash } from "node:crypto";

const secretAssignment = /(password|secret|token|api[_-]?key|private[_-]?key|authorization)\s*[:=]\s*([^\s,;]+)/gi;

export function redactLog(message: string) {
  return message.replace(secretAssignment, (_match, name) => `${name}=[REDACTED]`);
}

export function buildDiagnosisContext(input: { status: string; commitSha: string; failedStage?: string; logs: Array<{ sequence: number; stage: string; level: string; message: string }>; profile: unknown; requiredSecretNames: string[] }) {
  const logs = input.logs.slice(-120).map((log) => ({ sequence: log.sequence, stage: log.stage, level: log.level, message: redactLog(log.message).slice(0, 2000) }));
  const context = { status: input.status, commitSha: input.commitSha, failedStage: input.failedStage, logs, profile: input.profile, requiredSecretNames: input.requiredSecretNames };
  const inputHash = createHash("sha256").update(JSON.stringify(context)).digest("hex");
  return { context, inputHash };
}
