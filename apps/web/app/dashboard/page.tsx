"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Deployment = { id: string; status: string; commitSha: string; createdAt: string };

type Log = { sequence: number; stage: string; level: string; message: string };

export default function DashboardPage() {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let source: EventSource | undefined;
    const load = async () => {
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setError("Sign in to view deployments."); return; }
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/deployments/latest`, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      if (!response.ok) { setError("No deployment is available yet."); return; }
      const current = await response.json() as Deployment;
      setDeployment(current);
      source = new EventSource(`${process.env.NEXT_PUBLIC_API_URL}/v1/deployments/${current.id}/events?access_token=${encodeURIComponent(data.session.access_token)}`);
      source.addEventListener("log.appended", (event) => setLogs((previous) => [...previous, JSON.parse((event as MessageEvent).data) as Log].slice(-500)));
      source.addEventListener("deployment.status", () => void load());
    };
    void load();
    return () => source?.close();
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto", padding: 40 }}>
      <p style={{ color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>DeployPilot / Dashboard</p>
      <h1>Deployment control room</h1>
      {error && <p role="alert">{error}</p>}
      {deployment ? <><p>Status: <strong>{deployment.status}</strong> · commit <code>{deployment.commitSha.slice(0, 12)}</code></p><pre style={{ background: "#0f172a", color: "#e2e8f0", padding: 20, minHeight: 320, overflow: "auto" }}>{logs.map((log) => `[${log.stage}] ${log.message}`).join("\n") || "Waiting for worker events…"}</pre></> : <p>Loading latest deployment…</p>}
    </main>
  );
}
