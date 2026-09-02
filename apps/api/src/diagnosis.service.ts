import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { db } from "@deploypilot/database/client";
import { buildDiagnosisContext } from "./diagnosis-context.js";

const diagnosisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    confidence_reason: { type: "string" },
    evidence: { type: "array", items: { type: "object", additionalProperties: false, properties: { sequence: { type: "integer" }, quote: { type: "string" } }, required: ["sequence", "quote"] } },
    likely_causes: { type: "array", items: { type: "string" } },
    recommended_actions: { type: "array", items: { type: "string" } },
    safety_notes: { type: "array", items: { type: "string" } },
    follow_up_questions: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "confidence", "confidence_reason", "evidence", "likely_causes", "recommended_actions", "safety_notes", "follow_up_questions"],
};

@Injectable()
export class DiagnosisService {
  async diagnose(deploymentId: string) {
    const deployment = await db.deployment.findUniqueOrThrow({ where: { id: deploymentId }, include: { logs: { orderBy: { sequence: "asc" } }, stages: true, config: true } });
    const profile = deployment.config.profile as { requiredSecretNames?: string[] };
    const failedStage = deployment.stages?.find((stage) => stage.status === "FAILED")?.name;
    const { context, inputHash } = buildDiagnosisContext({ status: deployment.status, commitSha: deployment.commitSha, failedStage, logs: deployment.logs, profile: deployment.config.profile, requiredSecretNames: profile.requiredSecretNames ?? [] });
    const cached = await db.aIDiagnosis.findFirst({ where: { deploymentId, inputHash }, orderBy: { createdAt: "desc" } });
    if (cached) return cached.response;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException("AI diagnosis is not configured");
    const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: [{ role: "system", content: [{ type: "input_text", text: "Diagnose this deployment using only the supplied evidence. Never invent evidence, never ask for secret values, and refer only to secret names. Return valid JSON matching the schema." }] }, { role: "user", content: [{ type: "input_text", text: JSON.stringify(context) }] }], text: { format: { type: "json_schema", name: "deployment_diagnosis", strict: true, schema: diagnosisSchema } } }) });
    if (!response.ok) throw new ServiceUnavailableException("AI diagnosis request failed");
    const body = await response.json() as { output_text?: string };
    if (!body.output_text) throw new ServiceUnavailableException("AI diagnosis returned no structured response");
    let parsed: unknown;
    try { parsed = JSON.parse(body.output_text); } catch { throw new ServiceUnavailableException("AI diagnosis returned invalid JSON"); }
    await db.aIDiagnosis.create({ data: { deploymentId, model, inputHash, response: parsed as object } });
    return parsed;
  }
}
