"use client";

import { useState } from "react";

export default function RepositoriesPage() {
  const [installationId, setInstallationId] = useState("");
  const [status, setStatus] = useState("Connect a GitHub App installation to sync repositories.");

  const sync = async () => {
    if (!installationId.trim()) { setStatus("Enter your GitHub App installation ID."); return; }
    setStatus("Ready to sync. API authentication will be connected in the next frontend integration pass.");
  };

  return <main style={{ padding: 40, maxWidth: 900 }}><p style={{ color: "#64748b" }}>SETUP</p><h1>Repositories</h1><p style={{ color: "#475569" }}>Choose which GitHub repositories DeployPilot is allowed to build and run.</p><div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, marginTop: 28, maxWidth: 560 }}><label htmlFor="installation">GitHub installation ID</label><input id="installation" value={installationId} onChange={(event) => setInstallationId(event.target.value)} placeholder="e.g. 12345678" style={{ display: "block", width: "100%", padding: 12, margin: "8px 0 16px", border: "1px solid #cbd5e1", borderRadius: 8 }} /><button onClick={sync} style={{ padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>Sync repositories</button><p style={{ color: "#64748b" }}>{status}</p></div></main>;
}
