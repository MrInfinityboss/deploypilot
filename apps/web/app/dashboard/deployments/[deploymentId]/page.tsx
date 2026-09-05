"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { apiRequest } from "../../../../lib/api";
import { Badge, Card, PageHeader, formatDate } from "../../ui";

type Stage = { name: string; status: string; startedAt?: string; endedAt?: string };
type Detail = { id: string; status: string; commitSha: string; createdAt: string; startedAt: string | null; endedAt: string | null; repository: { fullName: string }; environment: { name: string; url: string | null } | null; stages: Stage[]; config: { branchRule: string; version: number } };
type Log = { sequence: number; stage: string; level: string; message: string; createdAt?: string };
const stageNames = ["dependencies", "tests", "docker-build", "health-check", "deploy"];

export default function DetailPage() {
  const { deploymentId } = useParams<{ deploymentId: string }>();
  const router = useRouter();
  const [deployment, setDeployment] = useState<Detail | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [connected, setConnected] = useState(false);
  const [archiveUrl, setArchiveUrl] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [message, setMessage] = useState("Loading deployment…");

  const load = async () => {
    try {
      const detail = await apiRequest<Detail>(`/v1/deployments/${deploymentId}`);
      const result = await apiRequest<{ logs: Log[] }>(`/v1/deployments/${deploymentId}/logs`);
      setDeployment(detail);
      setLogs(result.logs);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load deployment.");
    }
  };

  useEffect(() => {
    let source: EventSource | undefined;
    let retry: number | undefined;
    let closed = false;
    void load();
    const connect = async () => {
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data } = await supabase.auth.getSession();
      if (!data.session) return setMessage("Sign in to view live deployment events.");
      const url = `${process.env.NEXT_PUBLIC_API_URL}/v1/deployments/${deploymentId}/events?access_token=${encodeURIComponent(data.session.access_token)}`;
      source = new EventSource(url);
      source.onopen = () => { setConnected(true); setMessage("Live event stream connected."); };
      source.onerror = () => { setConnected(false); source?.close(); if (!closed) retry = window.setTimeout(connect, 2000); };
      source.addEventListener("deployment.status", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as { status: string };
        setDeployment((previous) => previous ? { ...previous, status: payload.status } : previous);
        if (!["QUEUED", "RUNNING"].includes(payload.status)) void load();
      });
      source.addEventListener("stage.updated", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as Stage;
        setDeployment((previous) => previous ? { ...previous, stages: previous.stages.map((stage) => stage.name === payload.name ? { ...stage, ...payload } : stage) } : previous);
      });
      source.addEventListener("log.appended", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as Log;
        setLogs((previous) => previous.some((log) => log.sequence === payload.sequence) ? previous : [...previous, payload].sort((a, b) => a.sequence - b.sequence));
      });
    };
    void connect();
    return () => { closed = true; if (retry) window.clearTimeout(retry); source?.close(); };
  }, [deploymentId]);

  const action = async (path: string) => {
    try { await apiRequest(`/v1/deployments/${deploymentId}/${path}`, { method: "POST" }); await load(); if (path === "retry") router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Action failed."); }
  };

  const archive = async () => {
    setArchiving(true);
    try {
      const result = await apiRequest<{ downloadUrl?: string }>(`/v1/deployments/${deploymentId}/logs/archive`, { method: "POST" });
      if (result.downloadUrl) setArchiveUrl(result.downloadUrl);
      setMessage("Logs archived to Cloudflare R2.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to archive logs."); }
    finally { setArchiving(false); }
  };

  if (!deployment) return <><PageHeader eyebrow="Operations / Deployment" title="Deployment detail" /><Card>{message}</Card></>;
  const terminal = !["QUEUED", "RUNNING"].includes(deployment.status);
  return <>
    <PageHeader eyebrow={`Operations / ${deployment.repository.fullName}`} title={deployment.commitSha.slice(0, 12)} description={`Created ${formatDate(deployment.createdAt)} · ${deployment.environment?.name ?? "No environment"} · profile ${deployment.config.branchRule} v${deployment.config.version}`} action={<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {!terminal && <button className="dp-btn dp-btn-danger" onClick={() => action("cancel")}>Cancel</button>}
      {["FAILED", "TIMED_OUT"].includes(deployment.status) && <><button className="dp-btn" onClick={() => action("retry")}>↻ Retry</button><button className="dp-btn dp-btn-primary" onClick={() => action("diagnose")}>✦ Diagnose</button></>}
      {terminal && <button className="dp-btn" onClick={archive} disabled={archiving}>{archiving ? "Archiving…" : "Archive logs"}</button>}
      {archiveUrl && <a className="dp-btn dp-btn-primary" href={archiveUrl} target="_blank" rel="noreferrer">Download logs</a>}
    </div>} />
    <Card style={{ marginBottom: 16 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}><div><div className="dp-kicker">Deployment status</div><div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>{deployment.status}</div></div><div style={{ display: "flex", gap: 10, alignItems: "center" }}><span style={{ fontSize: 11, color: connected ? "var(--green)" : "var(--muted)" }}>● {connected ? "LIVE" : "RECONNECTING"}</span><Badge status={deployment.status} /></div></div><div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4 }}>{stageNames.map((name) => { const stage = deployment.stages.find((item) => item.name === name); return <div key={name}><div style={{ height: 7, borderRadius: 8, background: stage?.status === "SUCCEEDED" ? "var(--green)" : stage?.status === "RUNNING" ? "var(--yellow)" : stage?.status === "FAILED" ? "var(--red)" : "#303a4b" }} /><div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>{name}</div></div>; })}</div></Card>
    <div className="dp-grid-2" style={{ display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: 16 }}><Card><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 13 }}><h2 style={{ fontSize: 15, margin: 0 }}>Live logs</h2><span className="dp-mono" style={{ fontSize: 11, color: "var(--muted)" }}>{logs.length} lines</span></div><div style={{ background: "#080a0e", borderRadius: 9, padding: 16, minHeight: 350, maxHeight: 520, overflow: "auto" }}>{logs.length ? logs.map((log) => <div className="dp-mono" key={log.sequence} style={{ fontSize: 11, lineHeight: 1.8, color: log.level === "error" ? "var(--red)" : "#b6c1d1" }}><span style={{ color: "#657187", marginRight: 12 }}>{String(log.sequence).padStart(4, "0")}</span><span style={{ color: "var(--purple)", marginRight: 9 }}>{log.stage}</span>{log.message}</div>) : <div style={{ color: "var(--muted)", paddingTop: 120, textAlign: "center" }}>Waiting for worker events…</div>}</div></Card><Card><h2 style={{ fontSize: 15, margin: "0 0 18px" }}>Run details</h2><div style={{ display: "grid", gap: 15 }}>{[["Repository", deployment.repository.fullName], ["Commit", deployment.commitSha], ["Environment", deployment.environment?.name ?? "—"], ["Started", formatDate(deployment.startedAt)], ["Finished", formatDate(deployment.endedAt)]].map(([key, value]) => <div key={key}><div className="dp-kicker">{key}</div><div className="dp-mono" style={{ fontSize: 11, marginTop: 5, wordBreak: "break-all" }}>{value}</div></div>)}</div></Card></div>
    <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 14 }}>{message}</div>
  </>;
}
