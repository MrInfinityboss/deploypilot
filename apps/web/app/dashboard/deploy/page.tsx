"use client";

import { useState } from "react";
import { apiRequest } from "../../../lib/api";

type Setup = { configs: { id: string; branchRule: string; version: number }[]; environments: { id: string; name: string; url: string | null }[]; workers: { id: string; name: string; revokedAt: string | null; lastSeenAt: string | null }[] };

export default function DeployPage() {
  const [repositoryId, setRepositoryId] = useState("");
  const [branch, setBranch] = useState("main");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [configId, setConfigId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [status, setStatus] = useState("Load a repository setup to prepare a deployment.");

  const load = async () => {
    if (!repositoryId) { setStatus("Repository ID is required."); return; }
    try { const result = await apiRequest<Setup & { configs: Setup["configs"] }>(`/v1/repositories/${encodeURIComponent(repositoryId)}/setup`); setSetup(result); setConfigId(result.configs[0]?.id ?? ""); setEnvironmentId(result.environments[0]?.id ?? ""); setWorkerId(result.workers.find((item) => !item.revokedAt)?.id ?? ""); setStatus("Setup loaded."); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to load setup."); }
  };
  const deploy = async () => {
    if (!repositoryId || !configId || !environmentId || !workerId || !branch) { setStatus("Repository, branch, config, environment, and worker are required."); return; }
    try { const result = await apiRequest<{ id: string; status: string; commitSha: string }>(`/v1/repositories/${encodeURIComponent(repositoryId)}/deployments`, { method: "POST", body: JSON.stringify({ branch, configId, environmentId, workerId }) }); setStatus(`Deployment ${result.id} accepted as ${result.status}.`); } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to create deployment."); }
  };

  return <main style={{ padding: 40, maxWidth: 900 }}><p style={{ color: "#64748b" }}>RELEASE</p><h1>Deploy a commit</h1><p style={{ color: "#475569" }}>Select an immutable source target and an authorized Docker worker.</p><div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, marginTop: 28, maxWidth: 640, display: "grid", gap: 14 }}><label>Repository ID<input value={repositoryId} onChange={(event) => setRepositoryId(event.target.value)} placeholder="Paste persisted repository ID" style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} /></label><button onClick={load}>Load setup</button>{setup && <><label>Branch<input value={branch} onChange={(event) => setBranch(event.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }} /></label><label>Build profile<select value={configId} onChange={(event) => setConfigId(event.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}>{setup.configs.map((item) => <option key={item.id} value={item.id}>{item.branchRule} · v{item.version}</option>)}</select></label><label>Environment<select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}>{setup.environments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Worker<select value={workerId} onChange={(event) => setWorkerId(event.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 6 }}>{setup.workers.filter((item) => !item.revokedAt).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.lastSeenAt ? "online recently" : "not connected"}</option>)}</select></label><button onClick={deploy} style={{ padding: 12, background: "#0f172a", color: "white", borderRadius: 8 }}>Deploy commit</button></>}<p style={{ color: "#64748b" }}>{status}</p></div></main>;
}
