"use client";

import Link from "next/link";
import { useState } from "react";
import { apiRequest } from "../../../lib/api";

type Run = { id: string; commitSha: string; status: string; trigger: string; createdAt: string; environment: { name: string } | null };

export default function DeploymentsPage() {
  const [repositoryId, setRepositoryId] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [message, setMessage] = useState("Enter a repository ID to load deployment history.");
  const load = async () => { try { const result = await apiRequest<{ deployments: Run[] }>(`/v1/repositories/${encodeURIComponent(repositoryId)}/deployments`); setRuns(result.deployments); setMessage(`${result.deployments.length} runs loaded.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load history."); } };
  return <main style={{ padding: 40, maxWidth: 1000 }}><p style={{ color: "#64748b" }}>HISTORY</p><h1>Deployments</h1><div style={{ display: "flex", gap: 8, maxWidth: 620 }}><input value={repositoryId} onChange={(event) => setRepositoryId(event.target.value)} placeholder="Repository ID" style={{ flex: 1, padding: 10 }} /><button onClick={load}>Load history</button></div><p style={{ color: "#64748b" }}>{message}</p><div style={{ display: "grid", gap: 10, marginTop: 20 }}>{runs.map((run) => <Link key={run.id} href={`/dashboard/deployments/${run.id}`} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18, display: "flex", justifyContent: "space-between", textDecoration: "none", color: "inherit" }}><span><strong>{run.status}</strong> · {run.environment?.name ?? "No environment"}<br /><small>{run.commitSha.slice(0, 12)} · {run.trigger} · {new Date(run.createdAt).toLocaleString()}</small></span><span>View run →</span></Link>)}</div></main>;
}
