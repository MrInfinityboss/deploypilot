"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { apiRequest } from "../../../../lib/api";

type Detail = { id: string; status: string; commitSha: string; stages: { name: string; status: string }[]; repository: { fullName: string } };
type Diagnosis = { summary: string; confidence: string; evidence: { sequence: number; quote: string }[]; likely_causes: string[]; recommended_actions: string[]; safety_notes: string[] };

export default function DeploymentDetailPage({ params }: { params: { deploymentId: string } }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [message, setMessage] = useState("Loading deployment…");
  const load = async () => { try { const result = await apiRequest<Detail>(`/v1/deployments/${params.deploymentId}`); setDetail(result); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load deployment."); } };
  useEffect(() => { void load(); let source: EventSource | undefined; const connect = async () => { const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); const { data } = await supabase.auth.getSession(); if (!data.session) return; source = new EventSource(`${process.env.NEXT_PUBLIC_API_URL}/v1/deployments/${params.deploymentId}/events?access_token=${encodeURIComponent(data.session.access_token)}`); source.addEventListener("log.appended", (event) => { const payload = JSON.parse((event as MessageEvent).data) as { stage: string; message: string }; setLogs((items) => [...items, `[${payload.stage}] ${payload.message}`].slice(-500)); }); source.addEventListener("deployment.completed", () => void load()); }; void connect(); return () => source?.close(); }, [params.deploymentId]);
  const action = async (path: string) => { try { await apiRequest(path, { method: "POST" }); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Action failed."); } };
  const diagnose = async () => { try { setDiagnosis(await apiRequest<Diagnosis>(`/v1/deployments/${params.deploymentId}/diagnose`, { method: "POST" })); } catch (error) { setMessage(error instanceof Error ? error.message : "Diagnosis failed."); } };
  if (!detail) return <main style={{ padding: 40 }}>{message}</main>;
  return <main style={{ padding: 40, maxWidth: 1100 }}><p style={{ color: "#64748b" }}>{detail.repository.fullName}</p><h1>Deployment <code>{detail.id.slice(0, 8)}</code></h1><p>Status: <strong>{detail.status}</strong> · commit <code>{detail.commitSha.slice(0, 12)}</code></p><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{detail.stages.map((stage) => <span key={stage.name} style={{ padding: "8px 12px", borderRadius: 999, background: stage.status === "SUCCEEDED" ? "#dcfce7" : stage.status === "FAILED" ? "#fee2e2" : "#e2e8f0" }}>{stage.name}: {stage.status}</span>)}</div><div style={{ marginTop: 18 }}><button onClick={() => action(`/v1/deployments/${detail.id}/cancel`)} disabled={!(["QUEUED", "RUNNING"].includes(detail.status))}>Cancel</button><button onClick={() => action(`/v1/deployments/${detail.id}/retry`)} disabled={detail.status !== "FAILED"} style={{ marginLeft: 8 }}>Retry</button><button onClick={diagnose} disabled={detail.status !== "FAILED"} style={{ marginLeft: 8 }}>Diagnose failure</button></div><h2>Live logs</h2><pre style={{ background: "#0f172a", color: "#e2e8f0", padding: 20, minHeight: 300, overflow: "auto" }}>{logs.join("\n") || "Waiting for deployment events…"}</pre>{diagnosis && <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20 }}><h2>AI diagnosis</h2><p>{diagnosis.summary}</p><p>Confidence: <strong>{diagnosis.confidence}</strong></p><h3>Evidence</h3><ul>{diagnosis.evidence.map((item) => <li key={item.sequence}>#{item.sequence}: {item.quote}</li>)}</ul><h3>Recommended actions</h3><ul>{diagnosis.recommended_actions.map((item) => <li key={item}>{item}</li>)}</ul></section>}</main>;
}
