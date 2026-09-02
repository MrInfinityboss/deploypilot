"use client";

import { useState } from "react";
import { apiRequest } from "../../../lib/api";

type Repository = { id: string; fullName: string; defaultBranch: string; githubRepoId: string };

export default function RepositoriesPage() {
  const [installationId, setInstallationId] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [status, setStatus] = useState("Connect a GitHub App installation to sync repositories.");

  const sync = async () => {
    if (!installationId.trim()) { setStatus("Enter your GitHub App installation ID."); return; }
    try {
      const result = await apiRequest<{ repositories: Repository[] }>(`/v1/github/installations/${encodeURIComponent(installationId)}/repositories`);
      setRepositories(result.repositories);
      setStatus(`${result.repositories.length} repositories synchronized.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to sync repositories."); }
  };

  return <main style={{ padding: 40, maxWidth: 900 }}><p style={{ color: "#64748b" }}>SETUP</p><h1>Repositories</h1><p style={{ color: "#475569" }}>Choose which GitHub repositories DeployPilot is allowed to build and run.</p><div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, marginTop: 28, maxWidth: 600 }}><label htmlFor="installation">GitHub installation ID</label><input id="installation" value={installationId} onChange={(event) => setInstallationId(event.target.value)} placeholder="e.g. 12345678" style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 16px", border: "1px solid #cbd5e1", borderRadius: 8 }} /><button onClick={sync} style={{ padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>Sync repositories</button><p style={{ color: "#64748b" }}>{status}</p></div><div style={{ display: "grid", gap: 12, marginTop: 24 }}>{repositories.map((repo) => <article key={repo.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18, display: "flex", justifyContent: "space-between" }}><strong>{repo.fullName}</strong><span style={{ color: "#64748b" }}>default: {repo.defaultBranch}</span></article>)}</div></main>;
}
