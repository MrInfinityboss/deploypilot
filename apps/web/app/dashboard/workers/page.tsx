"use client";

import { useState } from "react";
import { apiRequest } from "../../../lib/api";

type Worker = { id: string; name: string; version: string; lastSeenAt: string | null; revokedAt: string | null };

export default function WorkersPage() {
  const [repositoryId, setRepositoryId] = useState("");
  const [name, setName] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState("Select a repository before registering a worker.");

  const load = async () => {
    if (!repositoryId) return;
    try { setWorkers((await apiRequest<{ workers: Worker[] }>(`/v1/repositories/${encodeURIComponent(repositoryId)}/workers`)).workers); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to load workers."); }
  };
  const register = async () => {
    if (!repositoryId || !name) { setStatus("Repository ID and worker name are required."); return; }
    try { const result = await apiRequest<{ workerId: string; token: string }>(`/v1/repositories/${encodeURIComponent(repositoryId)}/workers/register`, { method: "POST", body: JSON.stringify({ name, version: "0.1.0", maxConcurrency: 1 }) }); setToken(result.token); setStatus("Worker registered. Copy the token now; it will not be shown again."); await load(); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to register worker."); }
  };
  const revoke = async (workerId: string) => { await apiRequest(`/v1/workers/${workerId}/revoke`, { method: "POST" }); await load(); };

  return <main style={{ padding: 40, maxWidth: 900 }}><p style={{ color: "#64748b" }}>RUNTIME</p><h1>Docker workers</h1><p style={{ color: "#475569" }}>Workers connect outbound from computers you control and run bounded Docker jobs locally.</p><div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, marginTop: 28, maxWidth: 620 }}><label>Repository ID<input value={repositoryId} onChange={(event) => setRepositoryId(event.target.value)} placeholder="Paste persisted repository ID" style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 16px", border: "1px solid #cbd5e1", borderRadius: 8 }} /></label><label>Worker name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. home-docker" style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 16px", border: "1px solid #cbd5e1", borderRadius: 8 }} /></label><button onClick={register} style={{ padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>Register worker</button><button onClick={load} style={{ padding: "10px 16px", borderRadius: 8, cursor: "pointer", marginLeft: 8 }}>Refresh</button><p style={{ color: "#64748b" }}>{status}</p>{token && <pre style={{ background: "#0f172a", color: "#f8fafc", padding: 14, overflow: "auto" }}>{token}</pre>}</div><div style={{ display: "grid", gap: 12, marginTop: 24 }}>{workers.map((worker) => <article key={worker.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18, display: "flex", justifyContent: "space-between" }}><span><strong>{worker.name}</strong><br /><small>{worker.version} · {worker.revokedAt ? "Revoked" : worker.lastSeenAt ? "Last seen " + new Date(worker.lastSeenAt).toLocaleString() : "Never connected"}</small></span>{!worker.revokedAt && <button onClick={() => revoke(worker.id)}>Revoke</button>}</article>)}</div></main>;
}
